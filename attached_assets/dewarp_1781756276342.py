"""
dewarp.py — Automatic document corner detection + perspective correction.

Pipeline position: runs FIRST, before tiled levels and threshold.

    detect_and_dewarp(img)
        ├── auto_detect_corners()   — finds 4 document corners via contours
        │       returns corners + confidence score
        ├── if confidence >= 0.7:   — good detection
        │       dewarp(img, corners) silently
        └── if confidence < 0.7:    — bad detection
                return img unchanged + flag for frontend to show drag UI
                frontend POSTs user-corrected corners back
                backend calls dewarp(img, user_corners)
"""

import math
import cv2
import numpy as np


# ── Corner detection ──────────────────────────────────────────────────────────

def _order_corners(pts: np.ndarray) -> np.ndarray:
    """
    Order 4 points as [top-left, top-right, bottom-right, bottom-left].
    Works regardless of what order the contour gave them.
    """
    pts = pts.reshape(4, 2).astype(np.float32)
    ordered = np.zeros((4, 2), dtype=np.float32)

    # Top-left has smallest sum, bottom-right has largest sum
    s = pts.sum(axis=1)
    ordered[0] = pts[np.argmin(s)]   # top-left
    ordered[2] = pts[np.argmax(s)]   # bottom-right

    # Top-right has smallest diff, bottom-left has largest diff
    d = np.diff(pts, axis=1)
    ordered[1] = pts[np.argmin(d)]   # top-right
    ordered[3] = pts[np.argmax(d)]   # bottom-left

    return ordered


def _score_quad(corners: np.ndarray, img_h: int, img_w: int) -> float:
    """
    Score a candidate quadrilateral 0.0–1.0.
    Penalises quads that are too small, too square for a document,
    or have very unequal opposite sides (badly curved edges).

    A score >= 0.7 is treated as a confident auto-detection.
    """
    tl, tr, br, bl = corners

    # Side lengths
    top    = np.linalg.norm(tr - tl)
    bottom = np.linalg.norm(br - bl)
    left   = np.linalg.norm(bl - tl)
    right  = np.linalg.norm(br - tr)

    if min(top, bottom, left, right) < 10:
        return 0.0

    img_area = img_h * img_w

    # 1. Area coverage — document should fill at least 20% of the frame
    #    and not exceed 99% (that would mean we grabbed the whole image)
    quad_area = cv2.contourArea(corners.astype(np.float32))
    area_ratio = quad_area / img_area
    if area_ratio < 0.20 or area_ratio > 0.99:
        return 0.0
    area_score = min(area_ratio / 0.6, 1.0)   # peaks at 60% coverage

    # 2. Parallelism — opposite sides should be roughly equal length
    #    (a badly curled page gives very unequal top vs bottom)
    horiz_ratio = min(top, bottom) / max(top, bottom)
    vert_ratio  = min(left, right) / max(left, right)
    parallel_score = (horiz_ratio + vert_ratio) / 2.0

    # 3. Aspect ratio — A4 is ~1:1.41; accept 0.5–2.5 range
    longer  = max(top + bottom, left + right) / 2
    shorter = min(top + bottom, left + right) / 2
    aspect  = longer / shorter if shorter > 0 else 0
    aspect_score = 1.0 if 0.5 <= aspect <= 2.5 else 0.3

    # 4. Rectangularity — all interior angles should be near 90°
    def angle(a, b, c):
        v1 = a - b
        v2 = c - b
        cos_a = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
        return math.degrees(math.acos(np.clip(cos_a, -1, 1)))

    angles = [
        angle(bl, tl, tr),
        angle(tl, tr, br),
        angle(tr, br, bl),
        angle(br, bl, tl),
    ]
    angle_deviations = [abs(a - 90) for a in angles]
    rect_score = max(0.0, 1.0 - (sum(angle_deviations) / (4 * 45)))

    score = (
        area_score      * 0.30 +
        parallel_score  * 0.35 +
        aspect_score    * 0.15 +
        rect_score      * 0.20
    )
    return round(float(score), 3)


def auto_detect_corners(img: np.ndarray) -> dict:
    """
    Automatically detect the 4 corners of a document in a photo.

    Strategy:
      1. Downscale for speed (detection at full 12MP is wasteful)
      2. Greyscale → blur → Canny edges
      3. Dilate edges to close gaps from shadows / folds
      4. Find contours, keep only large closed quadrilaterals
      5. Score each candidate, pick the best
      6. Scale corners back to original resolution

    Returns:
        {
          "corners": [[x0,y0],[x1,y1],[x2,y2],[x3,y3]],  # TL TR BR BL
          "confidence": 0.85,   # 0.0–1.0
          "auto_ok": True,      # True if confidence >= 0.70
          "img_w": 3024,
          "img_h": 4032,
        }

    If no quad is found, corners defaults to the full image rectangle
    so the caller always has something to work with.
    """
    h, w = img.shape[:2]

    # --- Downscale for speed ---
    WORK_H = 1024
    scale = WORK_H / h
    work_w = int(w * scale)
    small = cv2.resize(img, (work_w, WORK_H), interpolation=cv2.INTER_AREA)

    # --- Greyscale + blur ---
    grey = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY) if small.ndim == 3 else small
    blurred = cv2.GaussianBlur(grey, (7, 7), 0)

    # --- Canny edges ---
    # Use Otsu threshold as a guide for Canny thresholds
    otsu_thresh, _ = cv2.threshold(blurred, 0, 255,
                                   cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    edges = cv2.Canny(blurred,
                      threshold1=otsu_thresh * 0.5,
                      threshold2=otsu_thresh)

    # --- Dilate to close shadow gaps along document edge ---
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    edges = cv2.dilate(edges, kernel, iterations=2)

    # --- Find contours ---
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    best_corners = None
    best_score   = 0.0

    for cnt in contours[:10]:   # only check top 10 largest contours
        # Skip tiny contours
        if cv2.contourArea(cnt) < (WORK_H * work_w * 0.10):
            continue

        # Approximate to a polygon
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)

        if len(approx) != 4:
            continue

        corners_small = _order_corners(approx.reshape(4, 2))
        score = _score_quad(corners_small, WORK_H, work_w)

        if score > best_score:
            best_score   = score
            best_corners = corners_small

    # Scale corners back to original resolution
    if best_corners is not None:
        best_corners = (best_corners / scale).astype(np.float32)
    else:
        # Fallback: use the full image rectangle
        best_corners = np.array([
            [0,   0  ],
            [w-1, 0  ],
            [w-1, h-1],
            [0,   h-1],
        ], dtype=np.float32)
        best_score = 0.0

    return {
        "corners":    best_corners.tolist(),
        "confidence": best_score,
        "auto_ok":    best_score >= 0.70,
        "img_w":      w,
        "img_h":      h,
    }


# ── Perspective correction ────────────────────────────────────────────────────

def dewarp(img: np.ndarray, corners: list | np.ndarray) -> np.ndarray:
    """
    Apply perspective correction given 4 corners [TL, TR, BR, BL].

    The output width and height are computed from the average of the
    top/bottom and left/right side lengths — so the output aspect ratio
    matches the physical document rather than the photo frame.

    Args:
        img:     Original BGR image (full resolution).
        corners: [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] TL TR BR BL.
                 Can be list-of-lists or np.ndarray.

    Returns:
        Dewarped BGR image.
    """
    pts = _order_corners(np.array(corners, dtype=np.float32))
    tl, tr, br, bl = pts

    # Compute output dimensions from average side lengths
    width_top    = np.linalg.norm(tr - tl)
    width_bottom = np.linalg.norm(br - bl)
    out_w = int(max(width_top, width_bottom))

    height_left  = np.linalg.norm(bl - tl)
    height_right = np.linalg.norm(br - tr)
    out_h = int(max(height_left, height_right))

    dst = np.array([
        [0,       0      ],
        [out_w-1, 0      ],
        [out_w-1, out_h-1],
        [0,       out_h-1],
    ], dtype=np.float32)

    M = cv2.getPerspectiveTransform(pts, dst)
    warped = cv2.warpPerspective(img, M, (out_w, out_h),
                                 flags=cv2.INTER_CUBIC,
                                 borderMode=cv2.BORDER_REPLICATE)
    return warped


# ── Curl detection ────────────────────────────────────────────────────────────

def detect_curl(img: np.ndarray, corners: list) -> dict:
    """
    Detect whether a document edge is curved (book spine / page curl).

    Strategy: for each of the 4 edges defined by the corners, sample
    points along that edge in the actual image and measure how much
    the detected edge deviates from the straight line between corners.
    High deviation = curl present on that edge.

    Returns:
        {
          "curl_detected": True/False,
          "curl_severity": 0.0–1.0,   # 0 = flat, 1 = severe curl
          "curled_edges": ["left"],    # which edges are curled
        }
    """
    pts = _order_corners(np.array(corners, dtype=np.float32))
    tl, tr, br, bl = pts

    grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    edges_img = cv2.Canny(cv2.GaussianBlur(grey, (5,5), 0), 50, 150)

    edge_pairs = {
        "top":    (tl, tr),
        "bottom": (bl, br),
        "left":   (tl, bl),
        "right":  (tr, br),
    }

    SAMPLES = 20
    SEARCH  = 30    # pixels to search perpendicular to expected edge
    curled_edges = []
    max_deviation = 0.0

    for edge_name, (p1, p2) in edge_pairs.items():
        deviations = []
        for i in range(1, SAMPLES):
            t = i / SAMPLES
            # Point along the straight line between corners
            px = int(p1[0] + t * (p2[0] - p1[0]))
            py = int(p1[1] + t * (p2[1] - p1[1]))

            # Perpendicular direction to this edge
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            length = math.sqrt(dx*dx + dy*dy) + 1e-6
            nx, ny = -dy/length, dx/length   # normal

            # Search along the normal for an edge pixel
            best_dev = 0
            for d in range(-SEARCH, SEARCH):
                sx = int(px + d * nx)
                sy = int(py + d * ny)
                if 0 <= sy < edges_img.shape[0] and 0 <= sx < edges_img.shape[1]:
                    if edges_img[sy, sx] > 0:
                        best_dev = abs(d)
                        break
            deviations.append(best_dev)

        mean_dev = float(np.mean(deviations)) if deviations else 0.0
        edge_len = float(np.linalg.norm(p2 - p1))
        severity = mean_dev / (edge_len * 0.1 + 1e-6)   # relative to edge length

        if severity > 0.25:
            curled_edges.append(edge_name)
        max_deviation = max(max_deviation, severity)

    return {
        "curl_detected": len(curled_edges) > 0,
        "curl_severity": round(min(max_deviation, 1.0), 3),
        "curled_edges":  curled_edges,
    }


# ── Main entry point ──────────────────────────────────────────────────────────

def detect_and_dewarp(img: np.ndarray) -> dict:
    """
    Full auto pipeline:
      1. Detect corners
      2. Check for curl on detected edges
      3. If auto_ok and no severe curl → dewarp silently
      4. Otherwise → return original img + flags for frontend manual UI

    Returns:
        {
          "image":          np.ndarray,   # dewarped if auto_ok, else original
          "dewarped":       True/False,   # whether correction was applied
          "corners":        [[...], ...], # detected corners (for drag UI)
          "confidence":     0.85,
          "auto_ok":        True,
          "curl_detected":  False,
          "curl_severity":  0.1,
          "curled_edges":   [],
          "show_manual_ui": False,        # True = frontend should show drag handles
          "message":        "...",        # human-readable reason
        }
    """
    detection = auto_detect_corners(img)
    corners   = detection["corners"]

    curl = detect_curl(img, corners)

    severe_curl = curl["curl_severity"] > 0.4

    auto_ok = detection["auto_ok"] and not severe_curl

    if auto_ok:
        dewarped_img = dewarp(img, corners)
        message = f"Auto-corrected (confidence {detection['confidence']:.0%})"
    else:
        dewarped_img = img
        if not detection["auto_ok"]:
            message = (f"Low confidence ({detection['confidence']:.0%}) — "
                       "please adjust the corner handles")
        elif severe_curl:
            message = (f"Page curl detected on {curl['curled_edges']} edge(s) — "
                       "drag the curve handles to correct")
        else:
            message = "Manual adjustment needed"

    return {
        "image":          dewarped_img,
        "dewarped":       auto_ok,
        "corners":        corners,
        "confidence":     detection["confidence"],
        "auto_ok":        detection["auto_ok"],
        "curl_detected":  curl["curl_detected"],
        "curl_severity":  curl["curl_severity"],
        "curled_edges":   curl["curled_edges"],
        "show_manual_ui": not auto_ok,
        "message":        message,
    }
