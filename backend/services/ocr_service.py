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
        return pytesseract.image_to_string(img, lang="eng")
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
    if reader is None:
        return "[Scanned PDF OCR not available — EasyOCR required for image-based PDFs]"
    try:
        from pdf2image import convert_from_path
        pages = convert_from_path(file_path, dpi=300)
        text_parts = []
        for page_image in pages:
            import numpy as np
            results = reader.readtext(np.array(page_image), detail=0, paragraph=True)
            text_parts.append("\n".join(results))
        return "\n".join(text_parts)
    except Exception as e:
        return f"Scanned PDF OCR error: {str(e)}"


def detect_fields(raw_text: str) -> dict:
    fields = {
        "full_name": "",
        "father_name": "",
        "date_of_birth": "",
        "aadhar_number": "",
        "pan_number": "",
        "mobile": "",
        "email": "",
        "address": "",
        "pincode": "",
        "survey_number": "",
        "village": "",
        "sale_amount": "",
        "registration_date": "",
        "raw_text": raw_text,
    }

    ANCHORS = {
        "full_name":     ["name:", "full name", "applicant name", "పేరు"],
        "father_name":   ["father", "s/o", "d/o", "w/o", "తండ్రి పేరు", "భర్త పేరు"],
        "survey_number": ["survey", "sy.no", "సర్వే నంబర్", "సర్వే నం"],
        "village":       ["village", "గ్రామం", "ఊరు"],
        "address":       ["address:", "చిరునామా"],
    }

    lines = raw_text.split("\n")

    for line in lines:
        line_lower = line.lower()

        if any(k in line_lower or k in line for k in ANCHORS["full_name"]):
            fields["full_name"] = _after_separator(line)
        if any(k in line_lower or k in line for k in ANCHORS["father_name"]):
            fields["father_name"] = _after_separator(line)
        if any(k in line_lower or k in line for k in ANCHORS["village"]):
            fields["village"] = _after_separator(line)
        if any(k in line_lower or k in line for k in ANCHORS["address"]):
            fields["address"] = _after_separator(line)

        dob_match = re.search(r'\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b', line)
        if dob_match and not fields["date_of_birth"]:
            fields["date_of_birth"] = dob_match.group(1)

        aadhaar_match = re.search(r'\b(\d{4}\s?\d{4}\s?\d{4})\b', line)
        if aadhaar_match and not fields["aadhar_number"]:
            fields["aadhar_number"] = aadhaar_match.group(1).replace(" ", "")

        pan_match = re.search(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b', line)
        if pan_match and not fields["pan_number"]:
            fields["pan_number"] = pan_match.group(1)

        mobile_match = re.search(r'\b([6-9]\d{9})\b', line)
        if mobile_match and not fields["mobile"]:
            fields["mobile"] = mobile_match.group(1)

        email_match = re.search(r'[\w\.\-]+@[\w\.\-]+\.\w+', line)
        if email_match and not fields["email"]:
            fields["email"] = email_match.group(0)

        pin_match = re.search(r'\b(\d{6})\b', line)
        if pin_match and not fields["pincode"]:
            fields["pincode"] = pin_match.group(1)

        if any(k in line_lower or k in line for k in ANCHORS["survey_number"]):
            fields["survey_number"] = _after_separator(line)

        amount_match = re.search(r'(?:rs\.?|₹|రూ\.?)\s*([\d,]+)', line, re.IGNORECASE)
        if amount_match and not fields["sale_amount"]:
            fields["sale_amount"] = amount_match.group(1)

        reg_date_match = re.search(
            r'\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b',
            line, re.IGNORECASE
        )
        if reg_date_match and not fields["registration_date"]:
            fields["registration_date"] = reg_date_match.group(1)

    return fields


def _after_separator(line: str) -> str:
    if ":" in line:
        return line.split(":", 1)[1].strip()
    return line.strip()
