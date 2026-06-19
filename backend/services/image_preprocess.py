"""
Image preprocessing pipeline for OCR enhancement.

Implements the same steps as the TensorFlow spec using PIL + numpy + OpenCV
(classical operations — TF adds no accuracy benefit here):

  1. Grayscale conversion
  2. Auto levels (histogram stretch)
  3. Brightness + contrast adjustment
  4. Sharpening via convolution kernel
  5. Background whitening (remove yellow/grey tones)
  6. Binarization (pure black/white)

All steps accept float params so UI sliders map directly to pipeline params.
"""

from __future__ import annotations
import hashlib
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance


# ── Default preprocessing parameters ─────────────────────────────────────────

DEFAULT_PARAMS = {
    "brightness":        0.1,    # delta  (–0.5 … +0.5)
    "contrast":          2.0,    # factor (0.5 … 4.0)
    "white_point":       0.85,   # threshold for bg whitening (0.5 … 0.99)
    "black_point":       0.0,    # min clamp for auto-levels  (0.0 … 0.3)
    "sharpness":         5,      # centre weight of 3×3 kernel (3 … 9)
    "binarize_threshold": 0.5,   # final B/W split             (0.3 … 0.7)
}


# ── Pipeline ──────────────────────────────────────────────────────────────────

def preprocess_image(image_path: str, params: dict | None = None) -> Image.Image:
    """
    Load image from *image_path*, run full preprocessing pipeline,
    return a PIL Image ready for Tesseract (mode 'L', uint8).

    *params* keys match DEFAULT_PARAMS — only provided keys are overridden.
    """
    p = {**DEFAULT_PARAMS, **(params or {})}

    # ── Load ──────────────────────────────────────────────────────────────────
    img = Image.open(image_path).convert("RGB")
    arr = np.array(img, dtype=np.float32) / 255.0

    # ── Step 1: Grayscale ─────────────────────────────────────────────────────
    gray = np.dot(arr, [0.299, 0.587, 0.114])          # (H, W) float32

    # ── Step 2: Auto levels (histogram stretch) ───────────────────────────────
    lo = max(float(np.min(gray)), float(p["black_point"]))
    hi = float(np.max(gray))
    denom = hi - lo + 1e-7
    leveled = np.clip((gray - lo) / denom, 0.0, 1.0)

    # ── Step 3: Contrast + brightness ─────────────────────────────────────────
    # contrast: stretch around 0.5
    factor = float(p["contrast"])
    adjusted = np.clip((leveled - 0.5) * factor + 0.5, 0.0, 1.0)
    # brightness: additive delta
    adjusted = np.clip(adjusted + float(p["brightness"]), 0.0, 1.0)

    # ── Step 4: Sharpening via 3×3 kernel ────────────────────────────────────
    #   [ 0  -1   0 ]
    #   [-1   c  -1 ]    where c = sharpness centre weight
    #   [ 0  -1   0 ]
    # Note: Pillow 10+ requires size as a 2-tuple (w, h) — NOT a plain int
    c = float(p["sharpness"])
    img_pil_gray = Image.fromarray((adjusted * 255).astype(np.uint8), mode="L")
    kernel_data = [0, -1, 0, -1, int(c), -1, 0, -1, 0]
    scale = max(1, int(c) - 4)           # keep output in range
    try:
        sharpen_filter = ImageFilter.Kernel(size=(3, 3), kernel=kernel_data, scale=scale, offset=0)
        img_sharp = img_pil_gray.filter(sharpen_filter)
    except TypeError:
        # Fallback for older Pillow API (size as int)
        sharpen_filter = ImageFilter.Kernel(size=3, kernel=kernel_data, scale=scale, offset=0)
        img_sharp = img_pil_gray.filter(sharpen_filter)
    sharp = np.array(img_sharp, dtype=np.float32) / 255.0
    sharp = np.clip(sharp, 0.0, 1.0)

    # ── Step 5: Background whitening ─────────────────────────────────────────
    wt = float(p["white_point"])
    whitened = np.where(sharp > wt, 1.0, sharp)

    # ── Step 6: Binarization ──────────────────────────────────────────────────
    bt = float(p["binarize_threshold"])
    binary = np.where(whitened > bt, 1.0, 0.0)

    # ── Step 7: Region brightening (optional) ────────────────────────────────
    reg = p.get("brighten_region")
    if reg and isinstance(reg, dict):
        h, w = binary.shape
        rx1 = max(0, int(float(reg.get("x", 0)) * w))
        ry1 = max(0, int(float(reg.get("y", 0)) * h))
        rx2 = min(w, int((float(reg.get("x", 0)) + float(reg.get("w", 0))) * w))
        ry2 = min(h, int((float(reg.get("y", 0)) + float(reg.get("h", 0))) * h))
        if rx2 > rx1 and ry2 > ry1:
            # Apply extra brightening: re-binarize shadow region with lower threshold
            # (grey shadows → white background, but dark text ink stays dark)
            region_slice = whitened[ry1:ry2, rx1:rx2]
            lower_bt = bt * 0.6  # lower threshold = more pixels become white
            binary[ry1:ry2, rx1:rx2] = np.where(region_slice > lower_bt, 1.0, 0.0)

    # ── Return uint8 PIL image ─────────────────────────────────────────────────
    out = (binary * 255).astype(np.uint8)
    return Image.fromarray(out, mode="L")


# ── Text-region detection ─────────────────────────────────────────────────────

def detect_text_region(image_path: str, padding: int = 20) -> dict:
    """
    Auto-detect the bounding box of text content on a large A4 scan.

    Uses dark-pixel projection — finds rows and columns that contain
    enough dark pixels (likely text) and returns their extent.

    Returns a dict: { top, bottom, left, right } in pixel coordinates,
    or None if no region could be detected.
    """
    try:
        img = Image.open(image_path).convert("RGB")
        arr = np.array(img, dtype=np.float32) / 255.0

        # Grayscale + auto-level
        gray = np.dot(arr, [0.299, 0.587, 0.114])
        lo, hi = float(np.min(gray)), float(np.max(gray))
        norm = np.clip((gray - lo) / (hi - lo + 1e-7), 0.0, 1.0)

        # Binary mask of dark pixels (text)
        binary = (norm < 0.5).astype(np.float32)

        # Row and column projections
        row_sums = binary.sum(axis=1)   # shape (H,)
        col_sums = binary.sum(axis=0)   # shape (W,)

        rows_with_text = np.where(row_sums > 5)[0]
        cols_with_text = np.where(col_sums > 5)[0]

        if rows_with_text.size == 0 or cols_with_text.size == 0:
            return None

        h, w = gray.shape
        top    = max(0, int(rows_with_text.min()) - padding)
        bottom = min(h, int(rows_with_text.max()) + padding)
        left   = max(0, int(cols_with_text.min()) - padding)
        right  = min(w, int(cols_with_text.max()) + padding)

        return {"top": top, "bottom": bottom, "left": left, "right": right}
    except Exception:
        return None


# ── Image hashing (for deduplication / training pairs) ────────────────────────

def image_hash(image_path: str) -> str:
    """Return a stable SHA-256 hex digest of the raw file bytes."""
    try:
        h = hashlib.sha256()
        with open(image_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ""
