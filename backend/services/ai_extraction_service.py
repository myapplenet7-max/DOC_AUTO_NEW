"""
ai_extraction_service.py
────────────────────────
Groq-compatible variable extraction for long Telugu/English documents.

Improvements over v1:
  1. Smart chunking at paragraph/double-newline boundaries (not hard char cuts)
     with 200-char overlap so field values split at a boundary aren't lost.
  2. Updated Groq prompt: explicit no-duplicate instruction + _PARTIAL suffix
     convention so boundary-cut values can be merged cleanly.
  3. Smart merge: case-insensitive key dedup, prefer longer/more-complete value,
     merge _PARTIAL fragments if they add new context.
  4. Per-chunk logging (raw count) + post-merge logging (unique count, dedup removed).
"""

import re
import os
import json
import logging

logger = logging.getLogger("docauto.ai_extraction")

# ── Groq client (lazy init) ───────────────────────────────────────────────────

_client = None


def _get_client():
    global _client
    if _client is None:
        try:
            from groq import Groq
            api_key = os.environ.get("GROQ_API_KEY", "")
            if not api_key:
                logger.warning("GROQ_API_KEY not set — AI extraction unavailable")
                return None
            _client = Groq(api_key=api_key)
        except ImportError:
            logger.warning("groq package not installed — AI extraction unavailable")
            return None
    return _client


# ── Document type → expected field list ──────────────────────────────────────

DOC_TYPE_FIELDS: dict[str, list[str]] = {
    "sale_deed": [
        "SELLER_NAME", "SELLER_FATHER_NAME", "SELLER_AGE", "SELLER_ADDRESS",
        "SELLER_AADHAAR", "SELLER_PAN",
        "BUYER_NAME", "BUYER_FATHER_NAME", "BUYER_AGE", "BUYER_ADDRESS",
        "BUYER_AADHAAR", "BUYER_PAN",
        "SALE_AMOUNT", "SALE_AMOUNT_WORDS",
        "ADVANCE_AMOUNT", "LOAN_AMOUNT", "CASH_AT_REGISTRATION",
        "DATE", "REGISTRATION_DATE",
        "SURVEY_NUMBER", "DOOR_NUMBER", "VILLAGE", "MANDAL", "DISTRICT",
        "AREA_SQ_YARDS", "AREA_SQ_METERS", "BUILT_UP_AREA_SQ_FEET",
        "EAST_BOUNDARY", "WEST_BOUNDARY", "NORTH_BOUNDARY", "SOUTH_BOUNDARY",
        "BOUNDARIES",
        "DOCUMENT_NUMBER", "BOOK_NUMBER", "SUB_REGISTRAR_OFFICE",
        "BANK_NAME", "LOAN_CHEQUE_NUMBER",
        "ELECTRICITY_SERVICE_NUMBER", "PANCHAYAT_TAX",
    ],
    "gift_deed": [
        "DONOR_NAME", "DONOR_FATHER_NAME", "DONOR_AGE", "DONOR_ADDRESS",
        "DONEE_NAME", "DONEE_FATHER_NAME", "DONEE_AGE", "DONEE_ADDRESS",
        "RELATIONSHIP", "GIFT_DATE",
        "SURVEY_NUMBER", "DOOR_NUMBER", "VILLAGE", "MANDAL", "DISTRICT",
        "AREA_SQ_YARDS", "EAST_BOUNDARY", "WEST_BOUNDARY",
        "NORTH_BOUNDARY", "SOUTH_BOUNDARY", "BOUNDARIES",
    ],
    "rental_agreement": [
        "LANDLORD_NAME", "LANDLORD_ADDRESS", "LANDLORD_AADHAAR",
        "TENANT_NAME", "TENANT_ADDRESS", "TENANT_AADHAAR",
        "RENT_AMOUNT", "ADVANCE_DEPOSIT", "AGREEMENT_DATE",
        "START_DATE", "END_DATE", "DURATION_MONTHS",
        "PROPERTY_ADDRESS", "DOOR_NUMBER", "VILLAGE", "MANDAL", "DISTRICT",
        "NOTICE_PERIOD_DAYS",
    ],
    "affidavit": [
        "DEPONENT_NAME", "DEPONENT_FATHER_NAME", "DEPONENT_AGE",
        "DEPONENT_ADDRESS", "DEPONENT_AADHAAR",
        "AFFIDAVIT_DATE", "PLACE",
        "NOTARY_NAME", "COURT_NAME",
    ],
    "default": [
        "NAME", "FATHER_NAME", "AGE", "ADDRESS", "DATE",
        "AMOUNT", "PLACE", "VILLAGE", "MANDAL", "DISTRICT",
    ],
}


# ── Smart chunker: paragraph-boundary splits with overlap ─────────────────────

def _chunk_text(text: str, max_chars: int = 3500, overlap_chars: int = 200) -> list[str]:
    """
    Split `text` into chunks of at most `max_chars`, preferring to break at
    paragraph/section boundaries (double newlines or single newlines).

    After flushing a chunk, the last `overlap_chars` characters are prepended
    to the next chunk so that a field whose value spans a boundary is visible
    in both adjacent chunks (and gets merged correctly later).

    Args:
        text:          Full document text.
        max_chars:     Hard upper limit on chunk size (characters).
        overlap_chars: How many trailing characters from the previous chunk to
                       repeat at the start of the next chunk.

    Returns:
        List of chunk strings.
    """
    # Prefer splitting at paragraph breaks (2+ newlines)
    paragraphs = re.split(r'\n{2,}', text)
    if len(paragraphs) < 2:
        # Fallback: split on single newlines
        paragraphs = text.split('\n')

    chunks: list[str] = []
    current_paras: list[str] = []
    current_len: int = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        # +2 for the '\n\n' joiner we'll use
        para_len = len(para) + 2

        if current_len + para_len > max_chars and current_paras:
            chunk_text = '\n\n'.join(current_paras)
            chunks.append(chunk_text)

            # Carry over the tail of this chunk as overlap context
            tail = chunk_text[-overlap_chars:] if len(chunk_text) > overlap_chars else chunk_text
            current_paras = [tail] if tail else []
            current_len = len(tail) + 2

        current_paras.append(para)
        current_len += para_len

    if current_paras:
        chunks.append('\n\n'.join(current_paras))

    logger.info(
        "Document chunked into %d chunks (max_chars=%d, overlap=%d)",
        len(chunks), max_chars, overlap_chars,
    )
    return chunks


# ── Single chunk → Groq extraction ───────────────────────────────────────────

def _extract_from_chunk(
    chunk: str,
    fields: list[str],
    chunk_index: int,
    total_chunks: int,
) -> dict:
    """
    Send one text chunk to Groq and extract the requested fields.

    Returns a dict of {FIELD_NAME: value_string}.
    Keys with suffix _PARTIAL indicate the value was cut off at the chunk
    boundary and should be merged with the adjacent chunk's detection.
    """
    client = _get_client()
    if client is None:
        return {}

    fields_list = ", ".join(fields)

    system_prompt = (
        "You are a precise data-extraction assistant for Indian legal documents.\n"
        "The document may contain Telugu script, English, or a mix of both.\n\n"
        "Strict rules:\n"
        "1. Extract ONLY the fields listed in the user message.\n"
        "2. Return ONLY a valid JSON object — no markdown fences, no explanation.\n"
        "3. Each field name must appear AT MOST ONCE in the JSON. "
        "Do NOT create duplicate entries for the same field.\n"
        "4. If a field is not present in this text chunk, OMIT it — do not invent values.\n"
        "5. Copy values exactly as they appear (preserve Telugu script).\n"
        "6. If a value looks cut off at the very start or very end of this chunk "
        "(e.g. boundary text split mid-sentence), append the suffix _PARTIAL to "
        "the key (e.g. BOUNDARIES_PARTIAL) so the caller can merge the fragments. "
        "Do NOT invent the missing portion."
    )

    position_hint = (
        f"\n\n[Chunk {chunk_index + 1} of {total_chunks}. "
        "Values near chunk boundaries may be partial.]"
        if total_chunks > 1 else ""
    )

    user_prompt = (
        f"Extract these fields from the document chunk below.\n"
        f"Fields to extract: {fields_list}\n"
        f"Rules: one JSON key per field, no duplicates, omit missing fields."
        f"{position_hint}\n\n"
        f"Document chunk:\n{chunk}"
    )

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=800,
            temperature=0.1,
        )
        raw = response.choices[0].message.content.strip()
        # Strip any markdown code fences the model may add
        raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
        raw = re.sub(r'\s*```$', '', raw, flags=re.MULTILINE)
        raw = raw.strip()
        result = json.loads(raw)
        logger.info(
            "Chunk %d/%d: Groq returned %d raw fields",
            chunk_index + 1, total_chunks, len(result),
        )
        return result
    except json.JSONDecodeError as e:
        logger.warning("Chunk %d/%d: JSON parse error — %s", chunk_index + 1, total_chunks, e)
        return {}
    except Exception as e:
        logger.error("Chunk %d/%d: Groq API error — %s", chunk_index + 1, total_chunks, e)
        return {}


# ── Regex fallback for common Indian legal fields ─────────────────────────────

_REGEX_PATTERNS: dict[str, str] = {
    "PAN":            r'\b([A-Z]{5}[0-9]{4}[A-Z])\b',
    "AADHAAR":        r'\b(\d{4}\s?\d{4}\s?\d{4})\b',
    "SALE_AMOUNT":    r'రూ\.?\s*([\d,]+)\s*/-',
    "DATE":           r'(\d{1,2}[./]\d{1,2}[./]\d{4})',
    "SURVEY_NUMBER":  r'[రీ\.]*\s*సర్వే\.?\s*నెం\.?\s*([\w/]+)',
    "DOOR_NUMBER":    r'డోరు\s+నెం[\.రు]*\s*([\d\-/]+)',
    "AREA_SQ_YARDS":  r'చ\.గ\.?\s*(\d+)',
    "DOCUMENT_NUMBER":r'దస్తావేజు\s+నెం\.?\s*([\d/]+)',
}


def _regex_extract(text: str) -> dict:
    """Extract common Indian legal fields via regex as a lightweight fallback."""
    found: dict = {}
    pan_matches = re.findall(_REGEX_PATTERNS["PAN"], text)
    if len(pan_matches) >= 1:
        found["SELLER_PAN"] = pan_matches[0]
    if len(pan_matches) >= 2:
        found["BUYER_PAN"] = pan_matches[1]
    aadhaar_matches = re.findall(_REGEX_PATTERNS["AADHAAR"], text)
    if aadhaar_matches:
        found["SELLER_AADHAAR"] = aadhaar_matches[0].replace(" ", "")
    if len(aadhaar_matches) >= 2:
        found["BUYER_AADHAAR"] = aadhaar_matches[1].replace(" ", "")
    for field in ["SALE_AMOUNT", "DATE", "SURVEY_NUMBER", "DOOR_NUMBER",
                  "AREA_SQ_YARDS", "DOCUMENT_NUMBER"]:
        m = re.search(_REGEX_PATTERNS[field], text)
        if m:
            found[field] = m.group(1)
    return found


# ── Smart merge: dedup by name, prefer longer value, merge partials ───────────

def _merge_chunk_results(chunk_results: list[dict]) -> dict:
    """
    Merge extracted fields from all chunks into one dict.

    Strategy (in priority order):
    - Keys are normalised to UPPER_CASE with spaces→underscores.
    - Case-insensitive deduplication: if the same base key appears in multiple
      chunks, keep the LONGER / more-complete value.
    - _PARTIAL suffix: if Groq flags a value as cut off, merge it into the base
      key by appending the partial text if it adds new context (not already present).
    - Logs per-chunk raw counts and final unique count for easy debugging.
    """
    merged: dict[str, str] = {}
    raw_total = 0

    for chunk_index, chunk_dict in enumerate(chunk_results):
        chunk_raw = len(chunk_dict)
        raw_total += chunk_raw
        chunk_new = 0
        chunk_updated = 0

        for raw_key, value in chunk_dict.items():
            if not value or not str(value).strip():
                continue

            norm_key = str(raw_key).upper().strip().replace(" ", "_")
            value = str(value).strip()

            is_partial = norm_key.endswith("_PARTIAL")
            base_key = norm_key[:-8] if is_partial else norm_key

            if base_key in merged:
                existing = merged[base_key]

                if is_partial:
                    # Append partial only if it adds context not already at the end
                    if not existing.endswith(value[:30]):
                        merged[base_key] = (existing + " " + value).strip()
                        chunk_updated += 1
                        logger.debug(
                            "Chunk %d: merged _PARTIAL into %s (%d → %d chars)",
                            chunk_index + 1, base_key, len(existing), len(merged[base_key]),
                        )
                elif len(value) > len(existing):
                    # Prefer the longer, more complete value from any chunk
                    merged[base_key] = value
                    chunk_updated += 1
                    logger.debug(
                        "Chunk %d: replaced %s with longer value (%d > %d chars)",
                        chunk_index + 1, base_key, len(value), len(existing),
                    )
                # else: keep existing (already longer or equal)
            else:
                merged[base_key] = value
                chunk_new += 1

        logger.info(
            "Chunk %d: %d raw fields → %d new variables, %d updated existing",
            chunk_index + 1, chunk_raw, chunk_new, chunk_updated,
        )

    post_dedup = len(merged)
    logger.info(
        "Merge complete: %d raw extractions across %d chunk(s) → "
        "%d unique variables (dedup removed %d duplicates)",
        raw_total, len(chunk_results), post_dedup, raw_total - post_dedup,
    )
    return merged


# ── Post-processing: clean over-extracted values ──────────────────────────────

_SHORT_FIELDS = {
    "VILLAGE", "MANDAL", "DISTRICT", "SURVEY_NUMBER", "DOOR_NUMBER",
    "AREA_SQ_YARDS", "AREA_SQ_METERS", "SELLER_AGE", "BUYER_AGE",
    "DATE", "REGISTRATION_DATE", "ELECTRICITY_SERVICE_NUMBER", "PANCHAYAT_TAX",
}


def _clean_value(key: str, value: str) -> str:
    """Truncate fields that should be short if Groq over-extracts."""
    if key in _SHORT_FIELDS and len(value) > 60:
        value = value.split(",")[0].strip()[:50]
    return value


# ── Public API ─────────────────────────────────────────────────────────────────

def extract_variables(
    document_text: str,
    doc_type: str = "default",
    use_regex_fallback: bool = True,
    max_chars_per_chunk: int = 3500,
    overlap_chars: int = 200,
) -> dict:
    """
    Extract variables from a (potentially long) Telugu/English legal document.

    Pipeline:
      1. Chunk the document at paragraph boundaries (with overlap).
      2. Call Groq for each chunk → per-chunk field dict.
      3. Merge all chunk dicts with case-insensitive deduplication.
      4. Optionally run regex fallback to fill gaps.
      5. Clean over-long values.

    Args:
        document_text:      Full document text (Telugu/English/mixed).
        doc_type:           One of: sale_deed, gift_deed, rental_agreement,
                            affidavit, default.
        use_regex_fallback: Also run regex patterns and fill any remaining gaps.
        max_chars_per_chunk: Character limit per Groq call (3500 is safe for
                            llama-3.3-70b on the free tier).
        overlap_chars:      Characters of overlap between consecutive chunks.

    Returns:
        dict mapping VARIABLE_NAME → extracted_value (all unique, no duplicates).
    """
    fields = DOC_TYPE_FIELDS.get(doc_type, DOC_TYPE_FIELDS["default"])
    chunks = _chunk_text(
        document_text,
        max_chars=max_chars_per_chunk,
        overlap_chars=overlap_chars,
    )
    total_chunks = len(chunks)

    chunk_results: list[dict] = []
    for i, chunk in enumerate(chunks):
        result = _extract_from_chunk(chunk, fields, chunk_index=i, total_chunks=total_chunks)
        chunk_results.append(result)

    merged = _merge_chunk_results(chunk_results)

    # Regex fallback fills any remaining gaps
    if use_regex_fallback:
        regex_found = _regex_extract(document_text)
        regex_filled = 0
        for key, value in regex_found.items():
            if key not in merged:
                merged[key] = value
                regex_filled += 1
                logger.debug("Regex fallback filled: %s = %s", key, value)
        if regex_filled:
            logger.info("Regex fallback added %d fields not found by Groq", regex_filled)

    # Clean over-extracted values
    merged = {k: _clean_value(k, v) for k, v in merged.items()}

    logger.info("extract_variables complete: %d unique variables returned", len(merged))
    return merged


def detect_doc_type(document_text: str) -> str:
    """
    Lightweight keyword-based document type detection.
    Returns one of: sale_deed, gift_deed, rental_agreement, affidavit, default.
    """
    if any(k in document_text for k in ["విక్రయ దస్తావేజు", "sale deed", "క్రయ విక్రయ"]):
        return "sale_deed"
    if any(k in document_text for k in ["దఖలు దస్తావేజు", "gift deed", "దాన పత్రం"]):
        return "gift_deed"
    if any(k in document_text for k in ["అద్దె ఒప్పందం", "rental agreement", "lease agreement"]):
        return "rental_agreement"
    if any(k in document_text for k in ["అఫిడవిట్", "affidavit", "sworn statement"]):
        return "affidavit"
    return "default"
