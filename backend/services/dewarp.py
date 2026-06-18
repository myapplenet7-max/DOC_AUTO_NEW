import math
import cv2
import numpy as np


def _order_corners(pts):
    pts = pts.reshape(4, 2).astype(np.float32)
    ordered = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    ordered[0] = pts[np.argmin(s)]
    ordered[2] = pts[np.argmax(s)]
    d = np.diff(pts, axis=1)
    ordered[1] = pts[np.argmin(d)]
    ordered[3] = pts[np.argmax(d)]
    return ordered


def _score_quad(corners, img_h, img_w):
    tl, tr, br, bl = corners
    top    = np.linalg.norm(tr - tl)
    bottom = np.linalg.norm(br - bl)
    left   = np.linalg.norm(bl - tl)
    right  = np.linalg.norm(br - tr)
    if min(top, bottom, left, right) < 10:
        return 0.0
    quad_area = cv2.contourArea(corners.astype(np.float32))
    area_ratio = quad_area / (img_h * img_w)
    if area_ratio < 0.20 or area_ratio > 0.99:
        return 0.0
    area_score = min(area_ratio / 0.6, 1.0)
    horiz_ratio = min(top, bottom) / max(top, bottom)
    vert_ratio  = min(left, right) / max(left, right)
    parallel_score = (horiz_ratio + vert_ratio) / 2.0
    longer  = max(top + bottom, left + right) / 2
    shorter = min(top + bottom, left + right) / 2
    aspect  = longer / shorter if shorter > 0 else 0
    aspect_score = 1.0 if 0.5 <= aspect <= 2.5 else 0.3
    def angle(a, b, c):
        v1 = a - b; v2 = c - b
        cos_a = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
        return math.degrees(math.acos(np.clip(cos_a, -1, 1)))
    angles = [angle(bl,tl,tr), angle(tl,tr,br), angle(tr,br,bl), angle(br,bl,tl)]
    rect_score = max(0.0, 1.0 - sum(abs(a - 90) for a in angles) / (4 * 45))
    return round(float(area_score*0.30 + parallel_score*0.35 + aspect_score*0.15 + rect_score*0.20), 3)


def auto_detect_corners(img):
    h, w = img.shape[:2]
    WORK_H = 1024
    scale = WORK_H / h
    work_w = int(w * scale)
    small = cv2.resize(img, (work_w, WORK_H), interpolation=cv2.INTER_AREA)
    grey = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY) if small.ndim == 3 else small
    blurred = cv2.GaussianBlur(grey, (7, 7), 0)
    otsu_thresh, _ = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    edges = cv2.Canny(blurred, threshold1=otsu_thresh*0.5, threshold2=otsu_thresh)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    edges = cv2.dilate(edges, kernel, iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    best_corners = None
    best_score = 0.0
    for cnt in contours[:10]:
        if cv2.contourArea(cnt) < (WORK_H * work_w * 0.10):
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        corners_small = _order_corners(approx.reshape(4, 2))
        score = _score_quad(corners_small, WORK_H, work_w)
        if score > best_score:
            best_score = score; best_corners = corners_small
    if best_corners is not None:
        best_corners = (best_corners / scale).astype(np.float32)
    else:
        best_corners = np.array([[0,0],[w-1,0],[w-1,h-1],[0,h-1]], dtype=np.float32)
        best_score = 0.0
    return {"corners": best_corners.tolist(), "confidence": best_score,
            "auto_ok": best_score >= 0.70, "img_w": w, "img_h": h}


def dewarp(img, corners):
    pts = _order_corners(np.array(corners, dtype=np.float32))
    tl, tr, br, bl = pts
    out_w = int(max(np.linalg.norm(tr-tl), np.linalg.norm(br-bl)))
    out_h = int(max(np.linalg.norm(bl-tl), np.linalg.norm(br-tr)))
    dst = np.array([[0,0],[out_w-1,0],[out_w-1,out_h-1],[0,out_h-1]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(pts, dst)
    return cv2.warpPerspective(img, M, (out_w, out_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def detect_and_dewarp(img):
    detection = auto_detect_corners(img)
    corners = detection["corners"]
    auto_ok = detection["auto_ok"]
    if auto_ok:
        dewarped_img = dewarp(img, corners)
        message = f"Auto-corrected (confidence {detection['confidence']:.0%})"
    else:
        dewarped_img = img
        message = f"Low confidence ({detection['confidence']:.0%}) — please adjust corner handles"
    return {
        "image": dewarped_img, "dewarped": auto_ok,
        "corners": corners, "confidence": detection["confidence"],
        "auto_ok": detection["auto_ok"], "show_manual_ui": not auto_ok, "message": message,
    }
