"""
ai_extraction_service.py
────────────────────────
Groq-compatible variable extraction for long Telugu/English documents.
Solves free-tier token limits by:
  1. Chunking long documents into ≤1500-word pieces
  2. Using concise English prompts (saves ~40% tokens vs Telugu prompts)
  3. Merging + deduplicating results across chunks
  4. Falling back to regex for common Indian legal fields

Usage:
    from ai_extraction_service import extract_variables
    variables = extract_variables(document_text, doc_type="sale_deed")
"""

import re
import os
import json
import logging
from groq import Groq

logger = logging.getLogger("docauto.ai_extraction")

# ── Groq client ───────────────────────────────────────────────────────────────
_client = None

def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY", "")
        _client = Groq(api_key=api_key)
    return _client


# ── Document type → field hints (English, short) ─────────────────────────────
DOC_TYPE_FIELDS = {
    "sale_deed": [
        "SELLER_NAME", "SELLER_FATHER_NAME", "SELLER_AGE", "SELLER_ADDRESS",
        "SELLER_AADHAAR", "SELLER_PAN",
        "BUYER_NAME",  "BUYER_FATHER_NAME",  "BUYER_AGE",  "BUYER_ADDRESS",
        "BUYER_AADHAAR", "BUYER_PAN",
        "SALE_AMOUNT", "SALE_AMOUNT_WORDS",
        "ADVANCE_AMOUNT", "LOAN_AMOUNT", "CASH_AT_REGISTRATION",
        "DATE", "REGISTRATION_DATE",
        "SURVEY_NUMBER", "DOOR_NUMBER", "VILLAGE", "MANDAL", "DISTRICT",
        "AREA_SQ_YARDS", "AREA_SQ_METERS", "BUILT_UP_AREA_SQ_FEET",
        "EAST_BOUNDARY", "WEST_BOUNDARY", "NORTH_BOUNDARY", "SOUTH_BOUNDARY",
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
        "NORTH_BOUNDARY", "SOUTH_BOUNDARY",
    ],
    "rental_agreement": [
        "LANDLORD_NAME", "LANDLORD_ADDRESS", "LANDLORD_AADHAAR",
        "TENANT_NAME",   "TENANT_ADDRESS",   "TENANT_AADHAAR",
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

# ── Regex fallback patterns for Indian legal docs ─────────────────────────────
REGEX_PATTERNS = {
    "SELLER_PAN":      r'\b([A-Z]{5}[0-9]{4}[A-Z])\b',
    "BUYER_PAN":       r'\b([A-Z]{5}[0-9]{4}[A-Z])\b',
    "SELLER_AADHAAR":  r'\b(\d{4}\s?\d{4}\s?\d{4})\b',
    "SALE_AMOUNT":     r'రూ\.?\s*([\d,]+)\s*/-',
    "DATE":            r'(\d{1,2}[./]\d{1,2}[./]\d{4})',
    "SURVEY_NUMBER":   r'[రీ\.]*\s*సర్వే\.?\s*నెం\.?\s*([\w/]+)',
    "DOOR_NUMBER":     r'డోరు\s+నెం[\.రు]*\s*([\d\-/]+)',
    "AREA_SQ_YARDS":   r'చ\.గ\.?\s*(\d+)',
    "AREA_SQ_FEET":    r'చ\.అ\.?\s*(\d+)',
    "DOCUMENT_NUMBER": r'దస్తావేజు\s+నెం\.?\s*([\d/]+)',
}


# ── Core chunker ─────────────────────────────────────────────────────────────
def _chunk_text(text: str, max_words: int = 1200) -> list[str]:
    """Split text into chunks of ≤max_words, breaking at paragraph boundaries."""
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks, current, count = [], [], 0
    for para in paragraphs:
        words = len(para.split())
        if count + words > max_words and current:
            chunks.append("\n".join(current))
            current, count = [], 0
        current.append(para)
        count += words
    if current:
        chunks.append("\n".join(current))
    return chunks


# ── Single chunk → Groq call ─────────────────────────────────────────────────
def _extract_from_chunk(chunk: str, fields: list[str], chunk_index: int) -> dict:
    """
    Call Groq with an English prompt to extract fields from one chunk.
    Returns dict of {FIELD_NAME: value_string}.
    """
    fields_list = ", ".join(fields)
    system_prompt = (
        "You are a data extraction assistant for Indian legal documents. "
        "The document text may be in Telugu, English, or mixed. "
        "Extract ONLY the fields listed by the user. "
        "Return ONLY a valid JSON object — no explanation, no markdown, no extra text. "
        "If a field is not found in this chunk, omit it from the JSON. "
        "Extract exact values as they appear in the document. "
        "For Telugu names/places, keep them in Telugu script."
    )

    user_prompt = (
        f"Extract these fields from the document chunk below:\n"
        f"Fields: {fields_list}\n\n"
        f"Document chunk:\n{chunk}\n\n"
        f"Return JSON only."
    )

    try:
        client = _get_client()
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
        # Strip markdown code fences if model adds them
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)
        logger.info("Chunk %d extracted %d fields", chunk_index, len(result))
        return result
    except json.JSONDecodeError as e:
        logger.warning("Chunk %d JSON parse error: %s", chunk_index, e)
        return {}
    except Exception as e:
        logger.error("Chunk %d Groq error: %s", chunk_index, e)
        return {}


# ── Regex fallback extractor ──────────────────────────────────────────────────
def _regex_extract(text: str) -> dict:
    """Extract common Indian legal fields via regex as fallback."""
    found = {}
    pan_matches = re.findall(REGEX_PATTERNS["SELLER_PAN"], text)
    if len(pan_matches) >= 1:
        found["SELLER_PAN"] = pan_matches[0]
    if len(pan_matches) >= 2:
        found["BUYER_PAN"] = pan_matches[1]

    aadhaar_matches = re.findall(REGEX_PATTERNS["SELLER_AADHAAR"], text)
    if len(aadhaar_matches) >= 1:
        found["SELLER_AADHAAR"] = aadhaar_matches[0].replace(" ", "")
    if len(aadhaar_matches) >= 2:
        found["BUYER_AADHAAR"] = aadhaar_matches[1].replace(" ", "")

    for field in ["SALE_AMOUNT", "DATE", "SURVEY_NUMBER", "DOOR_NUMBER",
                  "AREA_SQ_YARDS", "AREA_SQ_FEET", "DOCUMENT_NUMBER"]:
        m = re.search(REGEX_PATTERNS.get(field, ""), text)
        if m:
            found[field] = m.group(1)

    return found


# ── Merger: first non-empty value wins ───────────────────────────────────────
def _merge_results(chunk_results: list[dict]) -> dict:
    """Merge extracted fields across chunks. First found value wins."""
    merged = {}
    for chunk_dict in chunk_results:
        for key, value in chunk_dict.items():
            key = key.upper().replace(" ", "_")
            if key not in merged and value and str(value).strip():
                merged[key] = str(value).strip()
    return merged


# ── Clean extracted values ────────────────────────────────────────────────────
def _clean_value(key: str, value: str) -> str:
    """
    Post-process extracted values to remove common Groq over-extraction issues.
    e.g. VILLAGE should not contain full sentences.
    """
    short_fields = {
        "VILLAGE", "MANDAL", "DISTRICT", "SURVEY_NUMBER",
        "DOOR_NUMBER", "AREA_SQ_YARDS", "AREA_SQ_METERS",
        "SELLER_AGE", "BUYER_AGE", "DATE", "REGISTRATION_DATE",
        "ELECTRICITY_SERVICE_NUMBER", "PANCHAYAT_TAX",
    }
    if key in short_fields and len(value) > 60:
        # Take only up to first comma or 50 chars
        value = value.split(",")[0].strip()[:50]
    return value


# ── Public API ────────────────────────────────────────────────────────────────
def extract_variables(
    document_text: str,
    doc_type: str = "default",
    use_regex_fallback: bool = True,
    max_words_per_chunk: int = 1200,
) -> dict:
    """
    Extract variables from a (potentially long) Telugu/English legal document.

    Args:
        document_text:      Full document text
        doc_type:           One of: sale_deed, gift_deed, rental_agreement,
                            affidavit, default
        use_regex_fallback: Also run regex patterns and merge results
        max_words_per_chunk: Words per Groq call (keep ≤1200 for free tier)

    Returns:
        dict of {VARIABLE_NAME: extracted_value}
    """
    fields = DOC_TYPE_FIELDS.get(doc_type, DOC_TYPE_FIELDS["default"])
    chunks = _chunk_text(document_text, max_words=max_words_per_chunk)
    logger.info("Document split into %d chunks (doc_type=%s)", len(chunks), doc_type)

    chunk_results = []
    for i, chunk in enumerate(chunks):
        result = _extract_from_chunk(chunk, fields, chunk_index=i)
        chunk_results.append(result)

    merged = _merge_results(chunk_results)

    # Regex fallback fills gaps
    if use_regex_fallback:
        regex_found = _regex_extract(document_text)
        for key, value in regex_found.items():
            if key not in merged:
                merged[key] = value
                logger.debug("Regex fallback filled: %s = %s", key, value)

    # Clean values
    merged = {k: _clean_value(k, v) for k, v in merged.items()}

    logger.info("Total extracted variables: %d", len(merged))
    return merged


def detect_doc_type(document_text: str) -> str:
    """
    Detect document type from text using keyword matching.
    Returns one of: sale_deed, gift_deed, rental_agreement, affidavit, default
    """
    text_lower = document_text.lower()
    # Telugu + English keywords
    if any(k in document_text for k in ["విక్రయ దస్తావేజు", "sale deed", "క్రయ విక్రయ"]):
        return "sale_deed"
    if any(k in document_text for k in ["దఖలు దస్తావేజు", "gift deed", "దాన పత్రం"]):
        return "gift_deed"
    if any(k in document_text for k in ["అద్దె ఒప్పందం", "rental agreement", "lease agreement"]):
        return "rental_agreement"
    if any(k in document_text for k in ["అఫిడవిట్", "affidavit", "sworn statement"]):
        return "affidavit"
    return "default"
