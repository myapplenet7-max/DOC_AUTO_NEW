import os
import uuid
import math

import cv2
import numpy as np

CLEANED_OUTPUT_DIR = os.environ.get("CLEANED_OUTPUT_DIR", "/tmp/docauto_cleaned")


def _tile_black_white_points(tile, black_clip_pct=0.5, white_clip_pct=0.5):
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
    if white_point - black_point < 10:
        return 0, 255
    return int(black_point), int(white_point)


def _apply_levels_to_tile(tile, black_point, white_point):
    lut = np.zeros(256, dtype=np.uint8)
    span = white_point - black_point
    for i in range(256):
        val = (i - black_point) * 255.0 / span
        lut[i] = int(np.clip(val, 0, 255))
    return cv2.LUT(tile, lut)


def apply_tiled_levels(grey, cols=4, rows=6, black_clip_pct=0.5, white_clip_pct=0.5):
    h, w = grey.shape
    result = np.zeros_like(grey, dtype=np.float32)
    weight_sum = np.zeros((h, w), dtype=np.float32)
    tile_h = math.ceil(h / rows)
    tile_w = math.ceil(w / cols)
    for row in range(rows):
        for col in range(cols):
            y0 = row * tile_h; y1 = min(y0 + tile_h, h)
            x0 = col * tile_w; x1 = min(x0 + tile_w, w)
            tile = grey[y0:y1, x0:x1]
            if tile.size == 0:
                continue
            bp, wp = _tile_black_white_points(tile, black_clip_pct, white_clip_pct)
            corrected = _apply_levels_to_tile(tile, bp, wp).astype(np.float32)
            tile_actual_h = y1 - y0; tile_actual_w = x1 - x0
            gauss_y = np.exp(-0.5 * ((np.linspace(-1, 1, tile_actual_h)) ** 2) / 0.4)
            gauss_x = np.exp(-0.5 * ((np.linspace(-1, 1, tile_actual_w)) ** 2) / 0.4)
            weight = np.outer(gauss_y, gauss_x).astype(np.float32)
            result[y0:y1, x0:x1] += corrected * weight
            weight_sum[y0:y1, x0:x1] += weight
    weight_sum = np.where(weight_sum == 0, 1.0, weight_sum)
    result = result / weight_sum
    return np.clip(result, 0, 255).astype(np.uint8)


def clean_document(img, tile_cols=4, tile_rows=6):
    if img.ndim == 3:
        if img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        grey = img.copy()
    levelled = apply_tiled_levels(grey, cols=tile_cols, rows=tile_rows)
    denoised = cv2.fastNlMeansDenoising(levelled, h=10, templateWindowSize=7, searchWindowSize=21)
    binary = cv2.adaptiveThreshold(
        denoised, maxValue=255,
        adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        thresholdType=cv2.THRESH_BINARY,
        blockSize=31, C=15,
    )
    return binary


def save_cleaned_image(img, document_id, fmt="png"):
    os.makedirs(CLEANED_OUTPUT_DIR, exist_ok=True)
    ext = "png" if fmt == "png" else "jpg"
    filename = f"{document_id}_cleaned.{ext}"
    out_path = os.path.join(CLEANED_OUTPUT_DIR, filename)
    if fmt == "png":
        cv2.imwrite(out_path, img, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    else:
        cv2.imwrite(out_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return out_path


def load_and_clean(file_path, document_id=None, save_fmt="png"):
    raw = cv2.imread(file_path, cv2.IMREAD_COLOR)
    if raw is None:
        raise ValueError(f"Cannot read image: {file_path!r}")
    cleaned = clean_document(raw)
    doc_id = document_id or str(uuid.uuid4())
    out_path = save_cleaned_image(cleaned, doc_id, fmt=save_fmt)
    h, w = cleaned.shape[:2]
    return {"cleaned_path": out_path, "document_id": doc_id, "width": w, "height": h}
