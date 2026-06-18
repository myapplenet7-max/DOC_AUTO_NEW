"""
image_processing.py — Auto tiled levels + document cleaning pipeline.

Phase 1: apply_tiled_levels()  — automatic per-tile histogram stretch
         with Gaussian-feathered blending across tile boundaries.
         Handles uneven phone-photo illumination without any user input.

Phase 2 hook: apply_selection_levels() signature is defined here as a
         stub so the router/service layer doesn't need to change when
         the brush-select UI lands.

save_cleaned_image() — write the processed image to disk and return
         a download path. Called after the full pipeline so the user
         can download the whitened background document.
"""

import os
import uuid
import math

import cv2
import numpy as np


# ── Tiled levels (Phase 1 — fully automatic) ─────────────────────────────────

def _tile_black_white_points(tile: np.ndarray,
                              black_clip_pct: float = 0.5,
                              white_clip_pct: float = 0.5) -> tuple[int, int]:
    """
    Compute black and white points for a single greyscale tile by
    clipping a small percentage of the histogram at each end.

    black_clip_pct / white_clip_pct: percentage of pixels to clip
    (default 0.5% each end).  Clipping a tiny fraction ignores
    isolated dust specks and ink blobs that would otherwise skew
    the stretch — a standard technique from Photoshop's Auto Levels.

    Returns (black_point, white_point) as uint8 values.
    """
    hist = cv2.calcHist([tile], [0], None, [256], [0, 256]).flatten()
    total = hist.sum()
    if total == 0:
        return 0, 255

    black_thresh = total * black_clip_pct / 100.0
    white_thresh = total * white_clip_pct / 100.0

    cumulative = 0
    black_point = 0
    for i, count in enumerate(hist):
        cumulative += count
        if cumulative >= black_thresh:
            black_point = i
            break

    cumulative = 0
    white_point = 255
    for i in range(255, -1, -1):
        cumulative += hist[i]
        if cumulative >= white_thresh:
            white_point = i
            break

    # Guard: ensure at least 10-level separation to avoid divide-by-zero
    # and over-amplification of near-uniform tiles (blank page margins).
    if white_point - black_point < 10:
        return 0, 255

    return int(black_point), int(white_point)


def _apply_levels_to_tile(tile: np.ndarray,
                           black_point: int,
                           white_point: int) -> np.ndarray:
    """
    Stretch a greyscale tile so black_point → 0 and white_point → 255.
    Uses a precomputed 256-entry LUT for speed (avoids per-pixel Python).
    """
    lut = np.zeros(256, dtype=np.uint8)
    span = white_point - black_point
    for i in range(256):
        val = (i - black_point) * 255.0 / span
        lut[i] = int(np.clip(val, 0, 255))
    return cv2.LUT(tile, lut)


def apply_tiled_levels(grey: np.ndarray,
                        cols: int = 4,
                        rows: int = 6,
                        black_clip_pct: float = 0.5,
                        white_clip_pct: float = 0.5) -> np.ndarray:
    """
    Apply automatic levels correction independently per tile, then blend
    corrections smoothly across tile boundaries using a Gaussian weight map.

    Why tiled?
        A single global levels stretch can't handle a phone photo where
        the top of the document is bright (near a window) and the bottom
        is shadowed — one global setting will either blow out the top or
        leave the bottom grey.  Computing levels per tile then feather-
        blending them gives each region its own correction while avoiding
        hard seams at tile edges.

    Args:
        grey:           Single-channel uint8 greyscale image.
        cols, rows:     Tile grid dimensions. 4×6 works well for A4 at
                        300 DPI. Increase for larger images or more
                        extreme illumination gradients.
        black_clip_pct: % of histogram pixels to clip at the dark end.
        white_clip_pct: % of histogram pixels to clip at the bright end.

    Returns:
        Levels-corrected greyscale image, same shape as input.
    """
    h, w = grey.shape
    result = np.zeros_like(grey, dtype=np.float32)
    weight_sum = np.zeros((h, w), dtype=np.float32)

    tile_h = math.ceil(h / rows)
    tile_w = math.ceil(w / cols)

    for row in range(rows):
        for col in range(cols):
            # Tile boundaries (clamped to image edges)
            y0 = row * tile_h
            y1 = min(y0 + tile_h, h)
            x0 = col * tile_w
            x1 = min(x0 + tile_w, w)

            tile = grey[y0:y1, x0:x1]
            if tile.size == 0:
                continue

            bp, wp = _tile_black_white_points(tile, black_clip_pct, white_clip_pct)
            corrected = _apply_levels_to_tile(tile, bp, wp).astype(np.float32)

            # Build a Gaussian weight map for this tile so corrections
            # blend smoothly rather than hard-edging at tile boundaries.
            # The weight peaks at the tile centre and falls to near-zero
            # at the edges, so adjacent tiles feather into each other.
            tile_actual_h = y1 - y0
            tile_actual_w = x1 - x0
            gauss_y = np.exp(-0.5 * ((np.linspace(-1, 1, tile_actual_h)) ** 2) / 0.4)
            gauss_x = np.exp(-0.5 * ((np.linspace(-1, 1, tile_actual_w)) ** 2) / 0.4)
            weight = np.outer(gauss_y, gauss_x).astype(np.float32)

            result[y0:y1, x0:x1] += corrected * weight
            weight_sum[y0:y1, x0:x1] += weight

    # Normalise by accumulated weights (avoid division by zero at edges)
    weight_sum = np.where(weight_sum == 0, 1.0, weight_sum)
    result = result / weight_sum
    return np.clip(result, 0, 255).astype(np.uint8)


# ── Phase 2 stub — selection-based levels ────────────────────────────────────

def apply_selection_levels(grey: np.ndarray,
                            mask: np.ndarray,
                            black_point: int,
                            white_point: int) -> np.ndarray:
    """
    Phase 2: apply manual levels to a user-selected region only.

    Args:
        grey:        Full greyscale image.
        mask:        uint8 mask, same H×W as grey. 255 = selected, 0 = unselected.
                     Generated from the browser brush/lasso tool and sent
                     to the backend as a base64-encoded PNG.
        black_point: User-set black point (0–255) from the levels slider.
        white_point: User-set white point (0–255) from the levels slider.

    Returns:
        Image with levels applied inside the mask, original outside.

    Note: This is a complete implementation, not just a stub — the Phase 2
    UI just needs to send the mask + slider values to POST /api/documents/{id}/enhance.
    """
    corrected_full = _apply_levels_to_tile(grey, black_point, white_point)
    mask_f = (mask / 255.0).astype(np.float32)
    blended = (corrected_full.astype(np.float32) * mask_f +
               grey.astype(np.float32) * (1.0 - mask_f))
    return np.clip(blended, 0, 255).astype(np.uint8)


# ── Full cleaning pipeline ────────────────────────────────────────────────────

def clean_document(img: np.ndarray,
                   tile_cols: int = 4,
                   tile_rows: int = 6) -> np.ndarray:
    """
    Full document cleaning pipeline:
        greyscale → tiled levels → denoise → adaptive threshold

    Returns a binary (black text / white background) uint8 image
    ready for OCR and/or download.

    This is called by ocr_service.preprocess_image() and also directly
    by the /api/documents/{id}/clean endpoint for the download feature.
    """
    # Greyscale
    if img.ndim == 3:
        if img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        grey = img.copy()

    # Tiled levels — handles uneven phone-photo illumination
    levelled = apply_tiled_levels(grey, cols=tile_cols, rows=tile_rows)

    # Denoise — remove grain without blurring Telugu strokes
    denoised = cv2.fastNlMeansDenoising(levelled, h=10,
                                         templateWindowSize=7,
                                         searchWindowSize=21)

    # Adaptive threshold — final binarisation
    binary = cv2.adaptiveThreshold(
        denoised,
        maxValue=255,
        adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        thresholdType=cv2.THRESH_BINARY,
        blockSize=31,
        C=15,
    )
    return binary


# ── Save / download ───────────────────────────────────────────────────────────

CLEANED_OUTPUT_DIR = os.environ.get("CLEANED_OUTPUT_DIR", "/tmp/docauto_cleaned")


def save_cleaned_image(img: np.ndarray,
                        document_id: str,
                        fmt: str = "png") -> str:
    """
    Save a cleaned (whitened background) document image to disk.

    Args:
        img:         The processed greyscale or binary image array.
        document_id: UUID of the parent document record — used as the
                     filename stem so it's traceable back to the DB row.
        fmt:         Output format: "png" (lossless, recommended for OCR
                     source files) or "jpg" (smaller, fine for display).

    Returns:
        Absolute file path of the saved image.

    The saved file is served by GET /api/documents/{id}/download/cleaned
    which streams it with Content-Disposition: attachment.
    """
    os.makedirs(CLEANED_OUTPUT_DIR, exist_ok=True)

    ext = "png" if fmt == "png" else "jpg"
    filename = f"{document_id}_cleaned.{ext}"
    out_path = os.path.join(CLEANED_OUTPUT_DIR, filename)

    if fmt == "png":
        # PNG lossless — best for documents that will be OCR'd again
        cv2.imwrite(out_path, img, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    else:
        # JPEG quality 95 — small file, still very clean for display
        cv2.imwrite(out_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    return out_path


def load_and_clean(file_path: str,
                   document_id: str | None = None,
                   save_fmt: str = "png") -> dict:
    """
    Convenience function: load an image, run the full cleaning pipeline,
    save the result, and return paths + metadata.

    Returns:
        {
          "cleaned_path": "/tmp/docauto_cleaned/uuid_cleaned.png",
          "document_id":  "uuid-string",
          "width": 2480,
          "height": 3508,
        }
    """
    raw = cv2.imread(file_path, cv2.IMREAD_COLOR)
    if raw is None:
        raise ValueError(f"Cannot read image: {file_path!r}")

    cleaned = clean_document(raw)

    doc_id = document_id or str(uuid.uuid4())
    out_path = save_cleaned_image(cleaned, doc_id, fmt=save_fmt)

    h, w = cleaned.shape[:2]
    return {
        "cleaned_path": out_path,
        "document_id": doc_id,
        "width": w,
        "height": h,
    }
