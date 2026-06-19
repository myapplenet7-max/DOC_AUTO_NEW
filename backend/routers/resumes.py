"""
Resume CRUD + preview + download router.

Routes:
  GET    /api/resumes/                    list user's resume versions
  POST   /api/resumes/                    create / save a new version (no credit)
  PUT    /api/resumes/{id}               update version data (no credit)
  DELETE /api/resumes/{id}               delete version
  POST   /api/resumes/{id}/preview       generate watermarked preview (no credit)
  POST   /api/resumes/{id}/download      generate final DOCX + deduct credit
  GET    /api/resumes/{id}/download-file serve the final DOCX file (token auth)
  GET    /api/resumes/{id}/preview-file  serve the preview DOCX file  (token auth)
"""
import os, json, logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from auth_utils import get_current_user, get_user_from_token_string
import models, schemas
from services.resume_service import generate_resume_docx

logger = logging.getLogger("docauto.resumes")

OUTPUT_DIR  = os.environ.get("OUTPUT_DIR",  "/tmp/docauto_outputs")
PREVIEW_DIR = os.environ.get("PREVIEW_DIR", "/tmp/docauto_previews")
os.makedirs(OUTPUT_DIR,  exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)

router = APIRouter()

VALID_TYPES = {"fresher", "experienced", "creative"}

def _resume_cost(db: Session) -> int:
    row = db.query(models.AppSettings).filter(
        models.AppSettings.key == "resume_cost_credits"
    ).first()
    return int(row.value) if row else 1


def _own_or_404(db: Session, resume_id: int, user_id: int) -> models.Resume:
    r = db.query(models.Resume).filter(
        models.Resume.id == resume_id,
        models.Resume.user_id == user_id,
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Resume not found")
    return r


# ── List ──────────────────────────────────────────────────────────────────────
@router.get("/", response_model=list[schemas.ResumeOut])
def list_resumes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Resume)
        .filter(models.Resume.user_id == current_user.id)
        .order_by(models.Resume.updated_at.desc())
        .all()
    )


# ── Create ────────────────────────────────────────────────────────────────────
@router.post("/", response_model=schemas.ResumeOut)
def create_resume(
    data: schemas.ResumeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if data.resume_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid resume type. Choose from: {', '.join(VALID_TYPES)}")

    resume = models.Resume(
        user_id=current_user.id,
        resume_type=data.resume_type,
        version_name=data.version_name or "My Resume",
        data_json=data.data_json,
        status="draft",
    )
    db.add(resume); db.commit(); db.refresh(resume)
    logger.info("Resume created: id=%s user_id=%s type=%s", resume.id, current_user.id, data.resume_type)
    return resume


# ── Update ────────────────────────────────────────────────────────────────────
@router.put("/{resume_id}", response_model=schemas.ResumeOut)
def update_resume(
    resume_id: int,
    data: schemas.ResumeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    resume = _own_or_404(db, resume_id, current_user.id)
    if data.version_name is not None:
        resume.version_name = data.version_name
    if data.data_json is not None:
        resume.data_json = data.data_json
        # reset generated paths so fresh generation is forced
        resume.output_path  = None
        resume.preview_path = None
        resume.status       = "draft"
    db.commit(); db.refresh(resume)
    return resume


# ── Delete ────────────────────────────────────────────────────────────────────
@router.delete("/{resume_id}")
def delete_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    resume = _own_or_404(db, resume_id, current_user.id)
    for path in (resume.output_path, resume.preview_path):
        if path and os.path.exists(path):
            try: os.remove(path)
            except Exception: pass
    db.delete(resume); db.commit()
    return {"ok": True}


# ── Preview (no credit) ───────────────────────────────────────────────────────
@router.post("/{resume_id}/preview")
def generate_preview(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    resume = _own_or_404(db, resume_id, current_user.id)
    if not resume.data_json:
        raise HTTPException(status_code=400, detail="No resume data. Save your details first.")

    try:
        data = json.loads(resume.data_json)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid resume data format.")

    data["type"] = resume.resume_type.value if hasattr(resume.resume_type, "value") else str(resume.resume_type)
    preview_path = os.path.join(PREVIEW_DIR, f"resume_{resume.id}_preview.docx")

    try:
        generate_resume_docx(data, preview_path, watermark=True)
    except Exception as exc:
        logger.error("Preview generation failed resume_id=%s: %s", resume_id, exc)
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {exc}")

    resume.preview_path = preview_path
    db.commit()
    logger.info("Preview generated: resume_id=%s user_id=%s", resume_id, current_user.id)
    return {"ok": True, "resume_id": resume_id, "preview_ready": True}


# ── Download (deducts credit, transactional) ──────────────────────────────────
@router.post("/{resume_id}/download")
def generate_download(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    resume = _own_or_404(db, resume_id, current_user.id)
    if not resume.data_json:
        raise HTTPException(status_code=400, detail="No resume data. Save your details first.")

    is_admin = current_user.role == models.UserRole.admin
    cost     = 0 if is_admin else _resume_cost(db)

    if not is_admin and current_user.credits < cost:
        raise HTTPException(status_code=402, detail=f"Not enough credits. Resume download costs {cost} credit(s).")

    try:
        data = json.loads(resume.data_json)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid resume data format.")

    data["type"] = resume.resume_type.value if hasattr(resume.resume_type, "value") else str(resume.resume_type)
    output_path  = os.path.join(OUTPUT_DIR, f"resume_{resume.id}_final.docx")

    # Deduct credit BEFORE generating (roll back if generation fails)
    if not is_admin:
        current_user.credits -= cost
        db.add(current_user)
        db.flush()  # write credit deduction, but don't commit yet

    try:
        generate_resume_docx(data, output_path, watermark=False)
    except Exception as exc:
        db.rollback()  # restore credits
        logger.error("Download generation failed resume_id=%s: %s", resume_id, exc)
        raise HTTPException(status_code=500, detail=f"Resume generation failed. Credits NOT deducted. Error: {exc}")

    resume.output_path  = output_path
    resume.credits_used = cost
    resume.status       = "generated"
    db.commit()
    logger.info("Resume downloaded: id=%s user_id=%s credits_deducted=%s", resume_id, current_user.id, cost)
    return {"ok": True, "resume_id": resume_id, "credits_used": cost}


# ── Serve final DOCX (token auth for <a> tags) ────────────────────────────────
@router.get("/{resume_id}/download-file")
def serve_download(
    resume_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    current_user = get_user_from_token_string(token, db)
    is_admin = current_user.role == models.UserRole.admin

    if is_admin:
        resume = db.query(models.Resume).filter(models.Resume.id == resume_id).first()
    else:
        resume = db.query(models.Resume).filter(
            models.Resume.id == resume_id,
            models.Resume.user_id == current_user.id,
        ).first()

    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.output_path or not os.path.exists(resume.output_path):
        raise HTTPException(status_code=404, detail="Resume file not ready. Generate it first.")

    safe_name = resume.version_name.replace(" ", "_").replace("/", "-")
    return FileResponse(
        resume.output_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{safe_name}_{resume.resume_type}.docx",
    )


# ── Serve preview DOCX (token auth) ──────────────────────────────────────────
@router.get("/{resume_id}/preview-file")
def serve_preview(
    resume_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    current_user = get_user_from_token_string(token, db)
    resume = db.query(models.Resume).filter(
        models.Resume.id == resume_id,
        models.Resume.user_id == current_user.id,
    ).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.preview_path or not os.path.exists(resume.preview_path):
        raise HTTPException(status_code=404, detail="Preview not ready. Generate preview first.")

    return FileResponse(
        resume.preview_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{resume.version_name.replace(' ', '_')}_preview.docx",
    )
