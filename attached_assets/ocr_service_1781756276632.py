"""
ocr_service.py — OCR pipeline for Telugu / English Indian legal documents.

Pre-processing pipeline (applied before every OCR call):
  1. Normalise colour  — convert to greyscale
  2. Deskew            — detect skew via Hough lines, rotate to correct it
  3. Denoise           — fast non-local means denoising (good for phone photos)
  4. Adaptive threshold — Gaussian adaptive binarisation; produces clean
                          black-on-white text even under uneven illumination

The pre-processing lives in preprocess_image(np.ndarray) → np.ndarray so it
can be unit-tested independently and also called from the image-enhancement
module in Phase 2.
"""

import re
import os
import math

import cv2
import numpy as np


# ── EasyOCR reader cache ──────────────────────────────────────────────────────
# EasyOCR's Reader() loads model weights from disk on every instantiation,
# which takes several seconds.  Re-create it only when the language list
# changes, and cache it globally for the process lifetime.
_READER = None
_READER_LANGS = ["en", "te"]  # English + Telugu


def _get_reader():
    global _READER
    if _READER is None:
        import easyocr
        # gpu=False is correct for most Replit/small-VPS deployments that
        # don't have a CUDA GPU available.  Set gpu=True only if you've
        # confirmed a GPU is present and torch was installed with CUDA support.
        _READER = easyocr.Reader(_READER_LANGS, gpu=False)
    return _READER


# ── Image pre-processing ─────────────────────────────────────────────────────

def _to_greyscale(img: np.ndarray) -> np.ndarray:
    """Convert BGR or BGRA image to greyscale.  No-op if already single-channel."""
    if img.ndim == 2:
        return img
    if img.shape[2] == 4:           # BGRA (e.g. PNG with alpha)
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _deskew(grey: np.ndarray) -> np.ndarray:
    """
    Detect and correct document skew using a Hough-line approach.

    Strategy:
      • Binarise with a fast global Otsu threshold (only for skew detection;
        the final threshold is applied later with the adaptive method).
      • Find edges with Canny.
      • Run Probabilistic Hough on the edges to get line segments.
      • Cluster line angles near horizontal (±45°) and take the median angle.
      • Rotate the *greyscale* image by that angle around its centre,
        filling the background with white (255) so thresholding still works.

    Returns the rotated greyscale image.  If fewer than 10 lines are found
    the image is returned unchanged (safer than rotating on noise).
    """
    _, binary = cv2.threshold(grey, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    edges = cv2.Canny(binary, 50, 150, apertureSize=3)

    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=100,
        minLineLength=max(grey.shape[1] // 8, 80),   # at least 1/8 of image width
        maxLineGap=20,
    )

    if lines is None or len(lines) < 10:
        return grey  # not enough evidence — leave image as-is

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
        # Keep only near-horizontal lines (within ±45°) to avoid
        # vertical text or border lines from corrupting the estimate.
        if -45 <= angle <= 45:
            angles.append(angle)

    if not angles:
        return grey

    skew_angle = float(np.median(angles))

    # Anything less than 0.4° is noise — skip the rotation to avoid
    # introducing interpolation artefacts on an already-straight scan.
    if abs(skew_angle) < 0.4:
        return grey

    h, w = grey.shape
    centre = (w / 2.0, h / 2.0)
    M = cv2.getRotationMatrix2D(centre, skew_angle, 1.0)

    # Expand the canvas so corners don't get clipped after rotation.
    cos_a = abs(M[0, 0])
    sin_a = abs(M[0, 1])
    new_w = int(h * sin_a + w * cos_a)
    new_h = int(h * cos_a + w * sin_a)
    M[0, 2] += (new_w - w) / 2
    M[1, 2] += (new_h - h) / 2

    rotated = cv2.warpAffine(
        grey, M, (new_w, new_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=255,    # white background
    )
    return rotated


def _denoise(grey: np.ndarray) -> np.ndarray:
    """
    Fast non-local means denoising — removes grain from phone-camera photos
    without blurring text strokes as much as Gaussian blur does.

    h=10 is the filter strength.  Higher values remove more noise but can
    start to eat into thin Telugu character strokes.  10 is a safe default
    for 300 DPI scans and typical phone photos.
    """
    return cv2.fastNlMeansDenoising(grey, h=10, templateWindowSize=7, searchWindowSize=21)


def _adaptive_threshold(grey: np.ndarray) -> np.ndarray:
    """
    Gaussian adaptive thresholding.

    Why adaptive instead of global Otsu?
      Phone photos of documents almost always have uneven illumination —
      bright near a window, shadowed near the spine, yellowish under
      fluorescent light.  A single global threshold inevitably loses
      either the bright or the dark region.  Adaptive thresholding
      computes a local threshold for each pixel based on its neighbourhood,
      which handles illumination gradients gracefully.

    Block size: 31 pixels — large enough to include a few characters'
    worth of context, small enough to track local illumination changes.
    Constant C: 15 — subtracted from the local mean before thresholding;
    increases the local contrast and makes thin strokes more robust.
    Both values can be tuned per-document in the Phase 2 UI slider
    (blockSize ↔ "black text density" slider, C ↔ "white background" slider).
    """
    return cv2.adaptiveThreshold(
        grey,
        maxValue=255,
        adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        thresholdType=cv2.THRESH_BINARY,
        blockSize=31,
        C=15,
    )


def preprocess_image(img: np.ndarray) -> np.ndarray:
    """
    Full pre-processing pipeline for a single document image.

    Input:  any OpenCV image array (BGR, BGRA, or greyscale).
    Output: binary (black text on white) greyscale ndarray ready for OCR.

    Steps:
      greyscale → deskew → denoise → adaptive threshold

    The output is kept as a single-channel uint8 array because EasyOCR
    accepts it directly, and keeping it greyscale avoids an unnecessary
    colour round-trip.
    """
    grey = _to_greyscale(img)
    grey = _deskew(grey)
    grey = _denoise(grey)
    binary = _adaptive_threshold(grey)
    return binary


def preprocess_file(file_path: str) -> np.ndarray:
    """
    Load an image from disk and run preprocess_image() on it.
    Raises FileNotFoundError if the path doesn't exist.
    Raises ValueError if OpenCV can't decode the file.
    """
    raw = cv2.imread(file_path, cv2.IMREAD_COLOR)
    if raw is None:
        raise ValueError(f"OpenCV could not read image: {file_path!r}")
    return preprocess_image(raw)


# ── OCR text extraction ───────────────────────────────────────────────────────

def extract_text(file_path: str) -> str:
    """
    Extract text from image or PDF using EasyOCR (English + Telugu).

    For PDFs: try pdfplumber first (text-layer PDFs).  If that returns
    nothing meaningful the PDF is a scan, so render each page to a 300 DPI
    image and OCR it with pre-processing.

    For images: pre-process then OCR.
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        text = _extract_from_pdf(file_path)
        if text and text.strip():
            return text
        return _extract_from_scanned_pdf(file_path)
    else:
        return _extract_from_image(file_path)


def _ocr_array(arr: np.ndarray) -> str:
    """Run EasyOCR on a numpy array and return joined text."""
    reader = _get_reader()
    results = reader.readtext(arr, detail=0, paragraph=True)
    return "\n".join(results)


def _extract_from_image(file_path: str) -> str:
    try:
        processed = preprocess_file(file_path)
        return _ocr_array(processed)
    except Exception as e:
        return f"OCR error: {e}"


def _extract_from_pdf(file_path: str) -> str:
    try:
        import pdfplumber
        parts = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    parts.append(page_text)
        return "\n".join(parts)
    except Exception as e:
        return f"PDF extraction error: {e}"


def _extract_from_scanned_pdf(file_path: str) -> str:
    """Render each PDF page to a 300 DPI image, pre-process, then OCR."""
    try:
        from pdf2image import convert_from_path
        pages = convert_from_path(file_path, dpi=300)
        parts = []
        for pil_page in pages:
            # PIL → BGR numpy array → pre-process → OCR
            arr = cv2.cvtColor(np.array(pil_page), cv2.COLOR_RGB2BGR)
            processed = preprocess_image(arr)
            parts.append(_ocr_array(processed))
        return "\n".join(parts)
    except Exception as e:
        return f"Scanned PDF OCR error: {e}"


# ── Field detection ───────────────────────────────────────────────────────────

def detect_fields(raw_text: str) -> dict:
    """
    Detect common Indian legal document fields from OCR text.
    Supports English and Telugu anchor keywords.
    Returns a dict of field_name → value.
    """
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
        "full_name":      ["name:", "full name", "applicant name", "పేరు"],
        "father_name":    ["father", "s/o", "d/o", "w/o", "తండ్రి పేరు", "భర్త పేరు"],
        "survey_number":  ["survey", "sy.no", "సర్వే నంబర్", "సర్వే నం"],
        "village":        ["village", "గ్రామం", "ఊరు"],
        "address":        ["address:", "చిరునామా"],
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

    return fields


def _after_separator(line: str) -> str:
    """Return text after the first colon or Telugu-style separator, stripped."""
    if ":" in line:
        return line.split(":", 1)[1].strip()
    return line.strip()
