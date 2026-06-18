import re
import os

_READER = None
_READER_LANGS = ["en", "te"]
_EASYOCR_AVAILABLE = None


def _get_reader():
    global _READER, _EASYOCR_AVAILABLE
    if _EASYOCR_AVAILABLE is None:
        try:
            import easyocr  # noqa
            _EASYOCR_AVAILABLE = True
        except ImportError:
            _EASYOCR_AVAILABLE = False
    if not _EASYOCR_AVAILABLE:
        return None
    if _READER is None:
        import easyocr
        _READER = easyocr.Reader(_READER_LANGS, gpu=False)
    return _READER


def extract_text(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        text = _extract_from_pdf(file_path)
        if text and text.strip():
            return text
        return _extract_from_scanned_pdf(file_path)
    elif ext in (".docx", ".doc"):
        return _extract_from_docx(file_path)
    elif ext == ".odt":
        return _extract_from_odt(file_path)
    else:
        return _extract_from_image(file_path)


def _extract_from_docx(file_path: str) -> str:
    try:
        from docx import Document
        doc = Document(file_path)
        parts = []
        for para in doc.paragraphs:
            text = para.text.strip()
            if text:
                parts.append(text)
        for table in doc.tables:
            for row in table.rows:
                row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_texts:
                    parts.append("  |  ".join(row_texts))
        return "\n".join(parts)
    except Exception as e:
        return f"DOCX extraction error: {str(e)}"


def _extract_from_odt(file_path: str) -> str:
    try:
        from odf.opendocument import load
        from odf.text import P
        from odf import teletype
        doc = load(file_path)
        parts = []
        for para in doc.getElementsByType(P):
            text = teletype.extractText(para).strip()
            if text:
                parts.append(text)
        return "\n".join(parts)
    except ImportError:
        return _extract_odt_fallback(file_path)
    except Exception as e:
        return f"ODT extraction error: {str(e)}"


def _extract_odt_fallback(file_path: str) -> str:
    try:
        import zipfile
        from xml.etree import ElementTree as ET
        with zipfile.ZipFile(file_path) as z:
            with z.open("content.xml") as f:
                tree = ET.parse(f)
                root = tree.getroot()
                texts = []
                for elem in root.iter():
                    if elem.text and elem.text.strip():
                        texts.append(elem.text.strip())
                return "\n".join(texts)
    except Exception as e:
        return f"ODT fallback error: {str(e)}"


def _extract_from_image(file_path: str) -> str:
    reader = _get_reader()
    if reader is None:
        return _fallback_image_text(file_path)
    try:
        results = reader.readtext(file_path, detail=0, paragraph=True)
        return "\n".join(results)
    except Exception as e:
        return f"OCR error: {str(e)}"


def _fallback_image_text(file_path: str) -> str:
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(file_path)
        result = ""
        # Try Telugu + English first
        try:
            result = pytesseract.image_to_string(img, lang="tel+eng")
        except Exception:
            try:
                result = pytesseract.image_to_string(img, lang="eng")
            except Exception:
                result = pytesseract.image_to_string(img)
        return result
    except Exception:
        return "[OCR not available — EasyOCR or Tesseract required]"


def _extract_from_pdf(file_path: str) -> str:
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n".join(text_parts)
    except Exception as e:
        return f"PDF extraction error: {str(e)}"


def _extract_from_scanned_pdf(file_path: str) -> str:
    reader = _get_reader()
    try:
        from pdf2image import convert_from_path
        pages = convert_from_path(file_path, dpi=300)
        text_parts = []
        for page_image in pages:
            if reader:
                import numpy as np
                results = reader.readtext(np.array(page_image), detail=0, paragraph=True)
                text_parts.append("\n".join(results))
            else:
                text_parts.append(_fallback_image_text_from_pil(page_image))
        return "\n".join(text_parts)
    except Exception as e:
        return f"Scanned PDF OCR error: {str(e)}"


def _fallback_image_text_from_pil(pil_image):
    try:
        import pytesseract
        try:
            return pytesseract.image_to_string(pil_image, lang="tel+eng")
        except Exception:
            return pytesseract.image_to_string(pil_image, lang="eng")
    except Exception:
        return ""


# ── Field Detection ──────────────────────────────────────────────────────────

ANCHORS = {
    "full_name":           ["name:", "full name", "applicant name", "పేరు", "నా పేరు", "i,", "i am"],
    "father_name":         ["father", "s/o", "d/o", "తండ్రి పేరు", "తండ్రి"],
    "husband_name":        ["husband", "w/o", "భర్త పేరు", "భర్త"],
    "deponent_name":       ["deponent", "i, the deponent", "deponent name"],
    "advocate_name":       ["advocate", "counsel", "through advocate", "through counsel", "lawyer"],
    "survey_number":       ["survey", "sy.no", "sy no", "s.no", "సర్వే నంబర్", "సర్వే నం", "survey no"],
    "door_number":         ["door no", "door number", "d.no", "d no", "house no", "h.no", "మకాన్ నంబర్"],
    "plot_number":         ["plot no", "plot number", "plot", "ప్లాట్ నంబర్"],
    "village":             ["village", "గ్రామం", "ఊరు", "vill.", "vill:"],
    "mandal":              ["mandal", "మండలం", "mandal:"],
    "district":            ["district", "dist", "జిల్లా", "dist:"],
    "state":               ["state", "రాష్ట్రం"],
    "address":             ["address:", "చిరునామా", "residing at", "resident of", "r/o"],
    "court_case_number":   ["case no", "case number", "o.p no", "o.p.", "c.c no", "c.s no", "writ petition", "petition no"],
    "registration_number": ["reg no", "reg. no", "registration no", "registration number", "రిజిస్ట్రేషన్ నంబర్"],
    "boundaries":          ["boundaries", "bounded by", "east:", "west:", "north:", "south:", "నాలుగు హద్దులు"],
    "property_details":    ["property", "land", "extent", "area", "acres", "guntas", "sq.yards", "sq yards"],
}


def detect_fields(raw_text: str) -> dict:
    fields = {
        "full_name":           "",
        "father_name":         "",
        "husband_name":        "",
        "deponent_name":       "",
        "advocate_name":       "",
        "date_of_birth":       "",
        "aadhar_number":       "",
        "pan_number":          "",
        "mobile":              "",
        "email":               "",
        "address":             "",
        "pincode":             "",
        "survey_number":       "",
        "door_number":         "",
        "plot_number":         "",
        "village":             "",
        "mandal":              "",
        "district":            "",
        "state":               "",
        "court_case_number":   "",
        "registration_number": "",
        "boundaries":          "",
        "property_details":    "",
        "sale_amount":         "",
        "registration_date":   "",
        "raw_text":            raw_text,
    }

    lines = raw_text.split("\n")

    for i, line in enumerate(lines):
        line_lower = line.lower()

        for field, keywords in ANCHORS.items():
            if not fields[field] and any(k in line_lower or k in line for k in keywords):
                fields[field] = _after_separator(line)

        # Aadhaar: 12-digit in groups of 4
        if not fields["aadhar_number"]:
            aadhaar_match = re.search(r'\b(\d{4}\s?\d{4}\s?\d{4})\b', line)
            if aadhaar_match:
                fields["aadhar_number"] = aadhaar_match.group(1).replace(" ", "")

        # PAN
        if not fields["pan_number"]:
            pan_match = re.search(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b', line)
            if pan_match:
                fields["pan_number"] = pan_match.group(1)

        # Mobile (Indian: starts with 6-9, 10 digits)
        if not fields["mobile"]:
            mobile_match = re.search(r'\b([6-9]\d{9})\b', line)
            if mobile_match:
                fields["mobile"] = mobile_match.group(1)

        # Email
        if not fields["email"]:
            email_match = re.search(r'[\w\.\-]+@[\w\.\-]+\.\w+', line)
            if email_match:
                fields["email"] = email_match.group(0)

        # PIN code (6 digits, but not Aadhaar)
        if not fields["pincode"]:
            pin_match = re.search(r'\b([1-9]\d{5})\b', line)
            if pin_match and not re.search(r'\b\d{4}\s?\d{4}\s?\d{4}\b', line):
                val = pin_match.group(1)
                if len(val) == 6:
                    fields["pincode"] = val

        # Date of birth / dates
        if not fields["date_of_birth"]:
            dob_match = re.search(r'\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b', line)
            if dob_match:
                fields["date_of_birth"] = dob_match.group(1)

        # Sale amount
        if not fields["sale_amount"]:
            amount_match = re.search(r'(?:rs\.?|₹|రూ\.?)\s*([\d,]+)', line, re.IGNORECASE)
            if amount_match:
                fields["sale_amount"] = amount_match.group(1)

        # Registration date
        if not fields["registration_date"]:
            reg_date_match = re.search(
                r'\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b',
                line, re.IGNORECASE
            )
            if reg_date_match:
                fields["registration_date"] = reg_date_match.group(1)

        # Boundaries multi-line collection
        if "bounded by" in line_lower or "boundaries" in line_lower or "నాలుగు హద్దులు" in line:
            boundary_lines = []
            for j in range(i, min(i + 8, len(lines))):
                bl = lines[j].strip()
                if bl:
                    boundary_lines.append(bl)
            if boundary_lines and not fields["boundaries"]:
                fields["boundaries"] = " | ".join(boundary_lines[:5])

    return fields


def detect_placeholders(raw_text: str, detected_fields: dict) -> list:
    """
    Returns a list of detected variable placeholders with confidence and suggested names.
    Each item: {key, placeholder, value, confidence, category, approved}
    """
    placeholders = []

    FIELD_META = {
        "full_name":           ("FULL_NAME",           "Person Details", 0.9),
        "father_name":         ("FATHER_NAME",          "Person Details", 0.9),
        "husband_name":        ("HUSBAND_NAME",         "Person Details", 0.85),
        "deponent_name":       ("DEPONENT_NAME",        "Person Details", 0.9),
        "advocate_name":       ("ADVOCATE_NAME",        "Legal",          0.85),
        "date_of_birth":       ("DATE_OF_BIRTH",        "Dates",          0.95),
        "aadhar_number":       ("AADHAAR_NUMBER",       "Identity",       0.99),
        "pan_number":          ("PAN_NUMBER",           "Identity",       0.99),
        "mobile":              ("MOBILE_NUMBER",        "Contact",        0.95),
        "email":               ("EMAIL_ADDRESS",        "Contact",        0.95),
        "address":             ("ADDRESS",              "Location",       0.8),
        "pincode":             ("PINCODE",              "Location",       0.95),
        "survey_number":       ("SURVEY_NUMBER",        "Property",       0.9),
        "door_number":         ("DOOR_NUMBER",          "Property",       0.85),
        "plot_number":         ("PLOT_NUMBER",          "Property",       0.85),
        "village":             ("VILLAGE",              "Location",       0.85),
        "mandal":              ("MANDAL",               "Location",       0.85),
        "district":            ("DISTRICT",             "Location",       0.85),
        "state":               ("STATE",                "Location",       0.8),
        "court_case_number":   ("COURT_CASE_NUMBER",    "Legal",          0.9),
        "registration_number": ("REGISTRATION_NUMBER",  "Legal",          0.9),
        "boundaries":          ("BOUNDARIES",           "Property",       0.75),
        "property_details":    ("PROPERTY_DETAILS",     "Property",       0.75),
        "sale_amount":         ("SALE_AMOUNT",          "Financial",      0.9),
        "registration_date":   ("REGISTRATION_DATE",    "Dates",          0.85),
    }

    for key, (placeholder, category, confidence) in FIELD_META.items():
        value = detected_fields.get(key, "")
        if value and key != "raw_text":
            placeholders.append({
                "key":         key,
                "placeholder": placeholder,
                "value":       value,
                "confidence":  confidence,
                "category":    category,
                "approved":    confidence >= 0.9,
            })

    return placeholders


def generate_template_from_text(raw_text: str, approved_placeholders: list) -> str:
    """
    Replace detected field values with {{PLACEHOLDER}} tokens in the raw text.
    """
    template = raw_text
    # Sort by value length descending to replace longer values first (avoid partial matches)
    sorted_ph = sorted(approved_placeholders, key=lambda x: len(x.get("value", "")), reverse=True)
    for ph in sorted_ph:
        value = ph.get("value", "").strip()
        placeholder = ph.get("placeholder", "")
        if value and placeholder:
            template = template.replace(value, f"{{{{{placeholder}}}}}")
    return template


def _after_separator(line: str) -> str:
    for sep in [":", "-", "–"]:
        if sep in line:
            part = line.split(sep, 1)[1].strip()
            if part and len(part) > 1:
                return part
    return line.strip()
