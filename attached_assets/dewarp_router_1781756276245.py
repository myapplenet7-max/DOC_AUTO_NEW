"""
dewarp_router.py — Add these routes to backend/routers/documents.py

Flow:
  POST /documents/{id}/detect-corners
      → runs auto_detect_corners() on the original upload
      → if auto_ok: dewarp silently, save, return dewarped=True
      → if not auto_ok: return corners + show_manual_ui=True
        frontend shows CornerDragUI

  POST /documents/{id}/dewarp
      → accepts user-confirmed corners from CornerDragUI
      → runs dewarp(), saves result
      → continues to tiled-levels + OCR pipeline
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import cv2
import os

router = APIRouter()


class CornersPayload(BaseModel):
    # [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] in original image pixel coords
    corners: list[list[float]]


# ── Step 1: auto-detect ───────────────────────────────────────────────────────

@router.post("/documents/{document_id}/detect-corners")
async def detect_corners(document_id: str):
    """
    Run automatic corner detection on the original uploaded image.

    Returns corner coordinates + confidence.
    Frontend uses this to decide whether to show the drag UI or proceed
    silently.

    Response shape:
    {
      "document_id": "uuid",
      "corners":     [[x0,y0],[x1,y1],[x2,y2],[x3,y3]],
      "confidence":  0.85,
      "auto_ok":     true,
      "curl_detected": false,
      "curl_severity": 0.05,
      "curled_edges":  [],
      "show_manual_ui": false,
      "message":     "Auto-corrected (confidence 85%)",
      "dewarped":    true,   # only true if auto_ok and dewarp was applied
    }
    """
    original_path = _get_original_path(document_id)

    img = cv2.imread(original_path, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=404, detail="Original image not found")

    from services.dewarp import detect_and_dewarp, save_dewarped
    result = detect_and_dewarp(img)

    response = {
        "document_id":   document_id,
        "corners":       result["corners"],
        "confidence":    result["confidence"],
        "auto_ok":       result["auto_ok"],
        "curl_detected": result["curl_detected"],
        "curl_severity": result["curl_severity"],
        "curled_edges":  result["curled_edges"],
        "show_manual_ui": result["show_manual_ui"],
        "message":       result["message"],
        "dewarped":      False,
    }

    if result["auto_ok"]:
        # Save the dewarped image so the pipeline can use it
        dewarped_path = save_dewarped(result["image"], document_id)
        response["dewarped"] = True
        response["dewarped_path"] = dewarped_path

    return JSONResponse(content=response)


# ── Step 2: apply user-confirmed corners ──────────────────────────────────────

@router.post("/documents/{document_id}/dewarp")
async def apply_dewarp(document_id: str, payload: CornersPayload):
    """
    Apply perspective correction using user-confirmed corners from CornerDragUI.

    Called after the user drags the corner handles and taps Apply.
    Saves the dewarped image, then the OCR pipeline picks it up from there.

    Response:
    {
      "document_id":   "uuid",
      "dewarped":      true,
      "dewarped_path": "/tmp/docauto_dewarped/uuid_dewarped.png",
      "width":  2480,
      "height": 3508,
    }
    """
    original_path = _get_original_path(document_id)

    img = cv2.imread(original_path, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=404, detail="Original image not found")

    from services.dewarp import dewarp, save_dewarped
    dewarped_img  = dewarp(img, payload.corners)
    dewarped_path = save_dewarped(dewarped_img, document_id)

    h, w = dewarped_img.shape[:2]
    return {
        "document_id":   document_id,
        "dewarped":      True,
        "dewarped_path": dewarped_path,
        "width":         w,
        "height":        h,
    }


# ── Helper: get original upload path from DB ──────────────────────────────────

def _get_original_path(document_id: str) -> str:
    """
    Look up the original file path for this document.
    Replace the placeholder below with a real DB lookup:
        doc = db.query(Document).filter(Document.id == document_id).first()
        return doc.original_file
    """
    path = f"/tmp/uploads/{document_id}_original"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Document not found")
    return path


# ── Save helper (add to services/dewarp.py) ───────────────────────────────────

DEWARP_OUTPUT_DIR = os.environ.get("DEWARP_OUTPUT_DIR", "/tmp/docauto_dewarped")

def save_dewarped(img, document_id: str) -> str:
    os.makedirs(DEWARP_OUTPUT_DIR, exist_ok=True)
    path = os.path.join(DEWARP_OUTPUT_DIR, f"{document_id}_dewarped.png")
    cv2.imwrite(path, img, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    return path
