"""
hybrid_extraction_service.py
────────────────────────────
Controlled integration of Groq AI extraction as an ENHANCEMENT LAYER on top
of the existing regex/keyword placeholder detection.

Merge policy
============
1.  Existing regex/keyword results are the primary system — never removed.
2.  High-confidence regex (confidence ≥ 0.85): keep regex value, attach
    groq_suggested so the user can see what Groq found for comparison.
3.  Low-confidence regex (confidence < 0.85): replace with Groq value when
    the Groq value is materially longer (> 10 chars difference), and mark
    source as "regex+groq".
4.  Fields found only by Groq (not in regex results): add with confidence
    0.70, category "AI Detected", source "groq".
5.  Groq failures (import error, missing key, network error, timeout):
    return regex-only results unchanged — never raise.

Performance
===========
- Results are cached by MD5(text):doc_type with a 2-hour TTL.
- Groq call is executed in a ThreadPoolExecutor with an 8-second hard timeout.
- Groq is skipped entirely if GROQ_API_KEY is not set.
- Documents shorter than MIN_TEXT_LEN_FOR_GROQ chars skip Groq (regex is
  sufficient and Groq adds latency for trivially short texts).

Logging
=======
Every merge call logs:
  ✓ Regex placeholder count
  ✓ Groq variable count  
  ✓ Merged total  (new + updated + unchanged)
  ✓ API latency (ms) or "cache HIT" or "skipped"
  ✓ Any errors
"""

import os
import time
import hashlib
import logging
import concurrent.futures
from typing import Optional

logger = logging.getLogger("docauto.hybrid")

# ── Configuration ─────────────────────────────────────────────────────────────
_CACHE_TTL_SECONDS = 7200          # 2 hours
_GROQ_TIMEOUT_SECONDS = 8          # hard timeout per Groq call
_HIGH_CONF_THRESHOLD = 0.85        # regex values at or above this always win
_MIN_TEXT_LEN_FOR_GROQ = 200       # chars — skip Groq for very short texts
_LONGER_VALUE_MIN_DELTA = 10       # Groq replaces low-conf regex only if
                                   #   len(groq) - len(regex) > this threshold

# ── In-process LRU-style cache (keyed by MD5(text):doc_type) ─────────────────
_GROQ_CACHE: dict[str, tuple[dict, float]] = {}


def _cache_key(raw_text: str, doc_type: str) -> str:
    h = hashlib.md5(raw_text.encode("utf-8", errors="replace")).hexdigest()
    return f"{h}:{doc_type}"


def _cache_get(key: str) -> Optional[dict]:
    entry = _GROQ_CACHE.get(key)
    if entry is None:
        return None
    groq_vars, ts = entry
    if time.time() - ts > _CACHE_TTL_SECONDS:
        del _GROQ_CACHE[key]
        return None
    return groq_vars


def _cache_set(key: str, groq_vars: dict) -> None:
    # Evict oldest entries if cache grows large (simple FIFO trim)
    if len(_GROQ_CACHE) >= 200:
        oldest_key = next(iter(_GROQ_CACHE))
        del _GROQ_CACHE[oldest_key]
    _GROQ_CACHE[key] = (groq_vars, time.time())


# ── Groq call with timeout, wrapped in try/except ─────────────────────────────

def _call_groq(raw_text: str, doc_type: str) -> dict:
    """
    Import and call ai_extraction_service.extract_variables().
    Returns {} on any error so callers can always treat the result as a dict.
    """
    try:
        from services.ai_extraction_service import extract_variables
        return extract_variables(raw_text, doc_type=doc_type)
    except Exception as exc:
        logger.error("Groq extraction raised: %s", exc)
        return {}


def _cached_groq_extract(raw_text: str, doc_type: str) -> tuple[dict, str]:
    """
    Return (groq_vars_dict, source_label) where source_label is one of:
        "cache"   — served from cache (no API call)
        "api"     — fresh API call succeeded
        "timeout" — Groq timed out (returned {})
        "error"   — other failure (returned {})
        "skipped" — GROQ_API_KEY missing or text too short (returned {})
    """
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        logger.debug("GROQ_API_KEY not set — Groq enhancement skipped")
        return {}, "skipped"

    if len(raw_text) < _MIN_TEXT_LEN_FOR_GROQ:
        logger.debug("Text too short (%d chars) — Groq skipped", len(raw_text))
        return {}, "skipped"

    key = _cache_key(raw_text, doc_type)
    cached = _cache_get(key)
    if cached is not None:
        logger.info(
            "Groq cache HIT (doc_type=%s, key=%.8s…) — %d vars",
            doc_type, key, len(cached),
        )
        return cached, "cache"

    # Cache miss — call Groq with timeout
    t0 = time.time()
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_call_groq, raw_text, doc_type)
            groq_vars = future.result(timeout=_GROQ_TIMEOUT_SECONDS)
        latency_ms = int((time.time() - t0) * 1000)
        logger.info(
            "Groq API call succeeded: %d vars, latency=%dms (doc_type=%s)",
            len(groq_vars), latency_ms, doc_type,
        )
        _cache_set(key, groq_vars)
        return groq_vars, "api"
    except concurrent.futures.TimeoutError:
        latency_ms = int((time.time() - t0) * 1000)
        logger.warning(
            "Groq API timed out after %ds (%dms elapsed) — regex-only fallback",
            _GROQ_TIMEOUT_SECONDS, latency_ms,
        )
        return {}, "timeout"
    except Exception as exc:
        logger.error("Groq extraction failed: %s", exc)
        return {}, "error"


# ── Merge policy ──────────────────────────────────────────────────────────────

def _make_groq_placeholder(ph_name: str, value: str) -> dict:
    """Build a placeholder dict for a field found only by Groq."""
    return {
        "key": ph_name.lower(),
        "placeholder": ph_name.upper(),
        "value": value,
        "confidence": 0.70,
        "category": "AI Detected",
        "approved": False,
        "source": "groq",
    }


def _merge_placeholders(
    regex_phs: list[dict],
    groq_vars: dict,
) -> list[dict]:
    """
    Apply the merge policy described in the module docstring.

    Returns the merged list (always a superset of regex_phs).
    Does NOT mutate the original regex_phs dicts.
    """
    # Index existing regex results by normalised placeholder name
    ph_by_name: dict[str, dict] = {}
    for ph in regex_phs:
        norm = ph.get("placeholder", "").upper()
        if norm:
            ph_by_name[norm] = dict(ph)  # shallow copy so we don't mutate callers' data

    stats = {"new": 0, "updated_value": 0, "annotated": 0, "unchanged": 0}

    for raw_key, groq_value in groq_vars.items():
        if not groq_value or not str(groq_value).strip():
            continue

        ph_name = str(raw_key).upper().strip().replace(" ", "_")
        groq_value = str(groq_value).strip()

        if ph_name in ph_by_name:
            existing = ph_by_name[ph_name]
            regex_conf = existing.get("confidence", 0.0)
            regex_val  = existing.get("value", "")

            if regex_conf >= _HIGH_CONF_THRESHOLD:
                # High-confidence regex wins — annotate Groq suggestion for visibility
                if groq_value != regex_val:
                    existing["groq_suggested"] = groq_value
                    existing["source"] = "regex+groq"
                    stats["annotated"] += 1
                else:
                    existing.setdefault("source", "regex")
                    stats["unchanged"] += 1
            else:
                # Low-confidence regex — prefer Groq when it's materially longer
                if len(groq_value) > len(regex_val) + _LONGER_VALUE_MIN_DELTA:
                    existing["value"] = groq_value
                    existing["source"] = "regex+groq"
                    existing["groq_improved"] = True
                    stats["updated_value"] += 1
                    logger.debug(
                        "Groq improved low-conf regex %s: %r → %r",
                        ph_name, regex_val[:40], groq_value[:40],
                    )
                else:
                    existing.setdefault("source", "regex")
                    stats["unchanged"] += 1
        else:
            # New field found only by Groq — add it
            ph_by_name[ph_name] = _make_groq_placeholder(ph_name, groq_value)
            stats["new"] += 1

    # Rebuild ordered list: keep original regex order, append Groq-only additions
    regex_names_ordered = [ph.get("placeholder", "").upper() for ph in regex_phs]
    groq_only_names = [n for n in ph_by_name if n not in set(regex_names_ordered)]

    merged = [ph_by_name[n] for n in regex_names_ordered if n in ph_by_name]
    merged += [ph_by_name[n] for n in groq_only_names]

    logger.info(
        "Merge: %d regex + %d Groq → %d total "
        "(new=%d, value_improved=%d, annotated=%d, unchanged=%d)",
        len(regex_phs), len(groq_vars), len(merged),
        stats["new"], stats["updated_value"], stats["annotated"], stats["unchanged"],
    )
    return merged


# ── Public API ─────────────────────────────────────────────────────────────────

def merge_with_groq(
    raw_text: str,
    regex_placeholders: list[dict],
    doc_type: str = "default",
) -> list[dict]:
    """
    Enhance `regex_placeholders` with Groq AI extraction.

    Always returns a valid list — even if Groq fails, times out, or is
    not configured, the original `regex_placeholders` list is returned unchanged.

    Args:
        raw_text:           Full document text.
        regex_placeholders: List of placeholder dicts from detect_placeholders().
        doc_type:           Detected document type (sale_deed, affidavit, …).

    Returns:
        Merged list of placeholder dicts (superset of regex_placeholders).
    """
    regex_count = len(regex_placeholders)
    logger.info(
        "merge_with_groq: %d regex placeholders, doc_type=%s, text_len=%d",
        regex_count, doc_type, len(raw_text),
    )

    # Safety: if no text, nothing to enhance
    if not raw_text or not raw_text.strip():
        return regex_placeholders

    try:
        groq_vars, source_label = _cached_groq_extract(raw_text, doc_type)
    except Exception as exc:
        logger.error("_cached_groq_extract raised unexpectedly: %s", exc)
        return regex_placeholders

    if not groq_vars:
        logger.info(
            "Groq returned no variables (source=%s) — returning regex-only results",
            source_label,
        )
        return regex_placeholders

    try:
        merged = _merge_placeholders(regex_placeholders, groq_vars)
        return merged
    except Exception as exc:
        logger.error("Merge failed (%s) — returning regex-only results: %s", source_label, exc)
        return regex_placeholders


def groq_rescan_fill(
    raw_text: str,
    all_existing_placeholders: list[dict],
    doc_type: str = "default",
) -> list[dict]:
    """
    Return a list of NEW placeholder dicts that Groq found but that are NOT
    already in `all_existing_placeholders` (checked case-insensitively by name).

    Designed for the "Scan Again" endpoint — returns only net-new fields.
    Returns [] on any Groq failure.
    """
    existing_names_upper = {
        p.get("placeholder", "").upper() for p in all_existing_placeholders
    }
    logger.info(
        "groq_rescan_fill: %d existing placeholders, doc_type=%s",
        len(existing_names_upper), doc_type,
    )

    try:
        groq_vars, source_label = _cached_groq_extract(raw_text, doc_type)
    except Exception as exc:
        logger.error("groq_rescan_fill: _cached_groq_extract raised: %s", exc)
        return []

    if not groq_vars:
        return []

    new_fields: list[dict] = []
    for raw_key, groq_value in groq_vars.items():
        if not groq_value or not str(groq_value).strip():
            continue
        ph_name = str(raw_key).upper().strip().replace(" ", "_")
        if ph_name in existing_names_upper:
            continue
        new_fields.append(_make_groq_placeholder(ph_name, str(groq_value).strip()))

    logger.info(
        "groq_rescan_fill: %d Groq vars, %d already exist → %d new fields "
        "(source=%s)",
        len(groq_vars), len(existing_names_upper), len(new_fields), source_label,
    )
    return new_fields
