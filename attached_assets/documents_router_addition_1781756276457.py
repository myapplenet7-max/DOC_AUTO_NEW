# ── Add these routes to backend/routers/documents.py ─────────────────────────
# Paste below the existing routes. Imports needed at top of documents.py:
#   from fastapi.responses import FileResponse
#   from services.image_processing import load_and_clean, save_cleaned_image, clean_document
#   import cv2, numpy as np

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
import os

router = APIRouter()  # already exists in documents.py — don't redeclare


@router.post("/documents/{document_id}/clean")
async def clean_document_image(document_id: str, background_tasks: BackgroundTasks):
    """
    Run the full cleaning pipeline (tiled levels → denoise → threshold)
    on the original uploaded image for this document.

    Returns the path and dimensions of the cleaned image.
    The cleaned file is saved to CLEANED_OUTPUT_DIR and can be downloaded
    via GET /documents/{id}/download/cleaned.

    Called automatically after upload+OCR, and also on-demand if the user
    wants to re-clean with different settings (Phase 2).
    """
    # Look up original file path from DB
    # doc = db.query(Document).filter(Document.id == document_id).first()
    # if not doc:
    #     raise HTTPException(status_code=404, detail="Document not found")
    # original_path = doc.original_file

    # Placeholder until DB is wired — swap the line above in
    original_path = f"/tmp/uploads/{document_id}_original"

    if not os.path.exists(original_path):
        raise HTTPException(status_code=404, detail="Original file not found")

    from services.image_processing import load_and_clean
    result = load_and_clean(original_path, document_id=document_id, save_fmt="png")

    return {
        "document_id": document_id,
        "cleaned_path": result["cleaned_path"],
        "width": result["width"],
        "height": result["height"],
        "download_url": f"/api/documents/{document_id}/download/cleaned",
    }


@router.get("/documents/{document_id}/download/cleaned")
async def download_cleaned_image(document_id: str):
    """
    Stream the cleaned (whitened background) document image as a download.

    The file is a lossless PNG — clean black text on white background,
    suitable for printing, sharing, or re-OCR.

    Frontend: wire this to a Download button on the Review & Edit page.
    The button should appear after the clean endpoint returns successfully.
    """
    from services.image_processing import CLEANED_OUTPUT_DIR

    # Try PNG first, fall back to JPG
    for ext in ("png", "jpg"):
        file_path = os.path.join(CLEANED_OUTPUT_DIR, f"{document_id}_cleaned.{ext}")
        if os.path.exists(file_path):
            return FileResponse(
                path=file_path,
                media_type=f"image/{ext}",
                filename=f"cleaned_document_{document_id[:8]}.{ext}",
                headers={
                    "Content-Disposition":
                        f'attachment; filename="cleaned_document_{document_id[:8]}.{ext}"'
                },
            )

    raise HTTPException(
        status_code=404,
        detail="Cleaned image not found. Call POST /documents/{id}/clean first."
    )


@router.post("/documents/{document_id}/clean/preview")
async def preview_cleaned_image(document_id: str):
    """
    Phase 2 hook — returns a base64-encoded thumbnail of the cleaned image
    for live preview in the browser before the user commits to downloading.

    Currently returns the full cleaned image URL; Phase 2 will add
    the mask + slider values to the request body for selection-based levels.
    """
    import base64
    from services.image_processing import CLEANED_OUTPUT_DIR

    file_path = os.path.join(CLEANED_OUTPUT_DIR, f"{document_id}_cleaned.png")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Run /clean first")

    # Resize to thumbnail for fast preview transfer
    import cv2
    img = cv2.imread(file_path, cv2.IMREAD_GRAYSCALE)
    thumb = cv2.resize(img, (400, int(400 * img.shape[0] / img.shape[1])))
    _, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 85])
    b64 = base64.b64encode(buf).decode("utf-8")

    return {
        "document_id": document_id,
        "preview_b64": f"data:image/jpeg;base64,{b64}",
        "download_url": f"/api/documents/{document_id}/download/cleaned",
    }
