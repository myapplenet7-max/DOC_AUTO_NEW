import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db
from auth_utils import require_admin, get_user_from_token_string
import models, schemas, os

router = APIRouter()
logger = logging.getLogger("docauto.admin")

try:
    from services.whatsapp_service import notify_user_payment_approved, notify_user_payment_rejected
except Exception:
    def notify_user_payment_approved(*a, **kw): pass
    def notify_user_payment_rejected(*a, **kw): pass


def get_setting(db: Session, key: str) -> str:
    row = db.query(models.AppSettings).filter(models.AppSettings.key == key).first()
    if row:
        return row.value
    return models.DEFAULT_SETTINGS.get(key, "")


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/settings")
def get_all_settings(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = db.query(models.AppSettings).all()
    result = dict(models.DEFAULT_SETTINGS)
    for row in rows:
        result[row.key] = row.value
    return result


@router.put("/settings")
def update_settings(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    allowed = set(models.DEFAULT_SETTINGS.keys())
    updated = []
    for key, value in data.items():
        if key not in allowed:
            continue
        row = db.query(models.AppSettings).filter(models.AppSettings.key == key).first()
        if row:
            row.value = str(value)
        else:
            row = models.AppSettings(key=key, value=str(value))
            db.add(row)
        updated.append(key)
    db.commit()
    logger.info("Settings updated: %s", updated)
    return {"updated": updated}


# ── Test Document Generation ───────────────────────────────────────────────────

@router.post("/test-generate")
def test_generate_document(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Generate a sample document using a built-in template to verify the pipeline."""
    import json, tempfile
    from services.ocr_service import detect_fields
    from services.docx_service import generate_docx

    sample_text = (
        "I, RAVI KUMAR, S/O NARAYANA RAO, aged 35 years, residing at H.No. 5-123, "
        "MG Road, Vijayawada, Krishna District, Andhra Pradesh - 520001, do hereby "
        "solemnly affirm and sincerely state as follows:\n\n"
        "That my date of birth is 15-08-1988 as per school records.\n"
        "My Aadhaar Number is 1234 5678 9012.\n"
        "My PAN Number is ABCDE1234F.\n"
        "Mobile: 9876543210. Email: ravi.kumar@example.com.\n\n"
        "Solemnly affirmed at Vijayawada on this 19th day of June, 2026."
    )

    sample_fields = {
        "full_name": "RAVI KUMAR",
        "father_name": "NARAYANA RAO",
        "age": "35",
        "address": "H.No. 5-123, MG Road, Vijayawada, Krishna District, Andhra Pradesh - 520001",
        "date_of_birth": "15-08-1988",
        "aadhar_number": "1234 5678 9012",
        "pan_number": "ABCDE1234F",
        "mobile": "9876543210",
        "email": "ravi.kumar@example.com",
        "place": "Vijayawada",
        "date": "19-06-2026",
        "raw_text": sample_text,
    }

    output_path = os.path.join(
        os.environ.get("OUTPUT_DIR", "/tmp/docauto_outputs"),
        "admin_test_document.docx"
    )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    steps = []
    try:
        steps.append("✓ Sample data prepared")
        generate_docx(sample_fields, output_path)
        steps.append("✓ DOCX generated via docx_service")
        if not os.path.exists(output_path):
            return {"ok": False, "steps": steps, "error": "Output file was not created"}
        size = os.path.getsize(output_path)
        steps.append(f"✓ File saved ({size} bytes)")
        steps.append("✓ Pipeline OK — download available at /api/admin/test-generate/download")
        return {"ok": True, "steps": steps, "output_path": output_path, "file_size_bytes": size}
    except Exception as e:
        steps.append(f"✗ FAILED: {e}")
        logger.exception("Test document generation failed: %s", e)
        return {"ok": False, "steps": steps, "error": str(e)}


@router.get("/test-generate/download")
def download_test_document(token: str = Query(...), db: Session = Depends(get_db)):
    """Download the last test-generated document."""
    from fastapi.responses import FileResponse
    user = get_user_from_token_string(token, db)
    if user.role != models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    output_path = os.path.join(
        os.environ.get("OUTPUT_DIR", "/tmp/docauto_outputs"),
        "admin_test_document.docx"
    )
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="No test document yet. Run test first.")
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename="test_document.docx",
    )


# ── Payments ──────────────────────────────────────────────────────────────────

@router.get("/payments/pending", response_model=list[schemas.PaymentOut])
def pending_payments(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(models.Payment).filter(
        models.Payment.status == models.PaymentStatus.pending
    ).order_by(models.Payment.created_at.asc()).all()


@router.get("/payments/screenshot/{payment_id}")
def get_screenshot(
    payment_id: int,
    token: str = Query(None),
    db: Session = Depends(get_db),
):
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    user = get_user_from_token_string(token, db)
    if user.role != models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if not payment.screenshot_path or not os.path.exists(payment.screenshot_path):
        raise HTTPException(status_code=404, detail="Screenshot file not found")
    ext = os.path.splitext(payment.screenshot_path)[1].lower()
    media_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    return FileResponse(payment.screenshot_path, media_type=media_types.get(ext, "image/jpeg"))


@router.put("/payments/{payment_id}/review", response_model=schemas.PaymentOut)
def review_payment(
    payment_id: int, data: schemas.PaymentReview,
    db: Session = Depends(get_db), _=Depends(require_admin),
):
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status != models.PaymentStatus.pending:
        raise HTTPException(status_code=400, detail="Already reviewed")

    user = db.query(models.User).filter(models.User.id == payment.user_id).first()
    if data.status == "approved":
        payment.status = models.PaymentStatus.approved
        user.credits += payment.credits
        db.add(user)
        logger.info("Payment approved: id=%s user_id=%s credits=%s", payment_id, user.id, payment.credits)
        try:
            notify_user_payment_approved(
                user_whatsapp=user.mobile, user_name=user.name,
                amount=payment.amount, credits=payment.credits, new_balance=user.credits,
            )
        except Exception:
            pass
    elif data.status == "rejected":
        payment.status = models.PaymentStatus.rejected
        logger.info("Payment rejected: id=%s user_id=%s note=%s", payment_id, user.id, data.admin_note)
        try:
            notify_user_payment_rejected(
                user_whatsapp=user.mobile, user_name=user.name,
                amount=payment.amount, note=data.admin_note,
            )
        except Exception:
            pass
    else:
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")

    payment.admin_note = data.admin_note
    payment.reviewed_at = datetime.utcnow()
    db.commit(); db.refresh(payment)
    return payment


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


@router.put("/users/{user_id}/credits")
def adjust_credits(
    user_id: int, data: schemas.CreditAdjust,
    db: Session = Depends(get_db), _=Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old = user.credits
    user.credits = max(0, user.credits + data.delta)
    db.commit(); db.refresh(user)
    logger.info("Credits adjusted: user_id=%s %d→%d", user_id, old, user.credits)
    return {"id": user.id, "name": user.name, "credits": user.credits}


@router.put("/users/{user_id}/toggle-active")
def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db), _=Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    logger.info("User active toggled: user_id=%s is_active=%s", user_id, user.is_active)
    return {"id": user.id, "is_active": user.is_active}


# ── Stats ─────────────────────────────────────────────────────────────────────

TRAINING_READY_THRESHOLD = 500

@router.get("/stats")
def stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    total_users  = db.query(models.User).count()
    total_docs   = db.query(models.Document).count()
    total_tmpls  = db.query(models.Template).count()
    total_resumes = db.query(models.Resume).count()
    pending      = db.query(models.Payment).filter(models.Payment.status == models.PaymentStatus.pending).count()
    revenue_rows = db.query(models.Payment).filter(
        models.Payment.status == models.PaymentStatus.approved
    ).with_entities(models.Payment.amount).all()

    training_count = 0
    try:
        training_count = db.query(models.OCRTrainingData).count()
    except Exception:
        pass

    return {
        "total_users":        total_users,
        "total_documents":    total_docs,
        "total_templates":    total_tmpls,
        "total_resumes":      total_resumes,
        "pending_payments":   pending,
        "total_revenue":      sum(r[0] for r in revenue_rows),
        "training_data_count":    training_count,
        "training_ready_threshold": TRAINING_READY_THRESHOLD,
        "training_ready":     training_count >= TRAINING_READY_THRESHOLD,
    }


# ── Admin: All Documents ──────────────────────────────────────────────────────

@router.get("/documents")
def list_all_documents(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = (
        db.query(models.Document, models.User.name, models.User.mobile)
        .join(models.User, models.Document.user_id == models.User.id)
        .order_by(models.Document.created_at.desc())
        .all()
    )
    result = []
    for doc, user_name, user_mobile in rows:
        result.append({
            "id":                doc.id,
            "user_id":           doc.user_id,
            "user_name":         user_name,
            "user_mobile":       user_mobile,
            "original_filename": doc.original_filename,
            "doc_type":          doc.doc_type,
            "status":            doc.status,
            "credits_used":      doc.credits_used,
            "has_output":        bool(doc.output_path and os.path.exists(doc.output_path)),
            "created_at":        doc.created_at.isoformat() if doc.created_at else None,
        })
    return result


@router.get("/documents/{doc_id}/download")
def admin_download_document(
    doc_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    user = get_user_from_token_string(token, db)
    if user.role != models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.output_path or not os.path.exists(doc.output_path):
        raise HTTPException(status_code=404, detail="Generated file not available")
    return FileResponse(
        doc.output_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"document_{doc_id}.docx",
    )


# ── Admin: All Templates ──────────────────────────────────────────────────────

@router.get("/templates")
def list_all_templates(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = (
        db.query(models.Template, models.User.name, models.User.mobile)
        .join(models.User, models.Template.user_id == models.User.id)
        .order_by(models.Template.created_at.desc())
        .all()
    )
    result = []
    for tmpl, user_name, user_mobile in rows:
        result.append({
            "id":          tmpl.id,
            "user_id":     tmpl.user_id,
            "user_name":   user_name,
            "user_mobile": user_mobile,
            "name":        tmpl.name,
            "category":    tmpl.category,
            "description": tmpl.description,
            "use_count":   tmpl.use_count,
            "is_favorite": tmpl.is_favorite,
            "created_at":  tmpl.created_at.isoformat() if tmpl.created_at else None,
        })
    return result


@router.delete("/templates/{tmpl_id}")
def admin_delete_template(
    tmpl_id: int,
    db: Session = Depends(get_db), _=Depends(require_admin),
):
    tmpl = db.query(models.Template).filter(models.Template.id == tmpl_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tmpl); db.commit()
    logger.info("Admin deleted template: id=%s name=%s", tmpl_id, tmpl.name)
    return {"ok": True}


# ── Admin: All Resumes ────────────────────────────────────────────────────────

@router.get("/resumes")
def list_all_resumes(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = (
        db.query(models.Resume, models.User.name, models.User.mobile)
        .join(models.User, models.Resume.user_id == models.User.id)
        .order_by(models.Resume.created_at.desc())
        .all()
    )
    result = []
    for resume, user_name, user_mobile in rows:
        result.append({
            "id":           resume.id,
            "user_id":      resume.user_id,
            "user_name":    user_name,
            "user_mobile":  user_mobile,
            "resume_type":  resume.resume_type.value if hasattr(resume.resume_type, "value") else str(resume.resume_type),
            "version_name": resume.version_name,
            "status":       resume.status,
            "credits_used": resume.credits_used,
            "has_output":   bool(resume.output_path and os.path.exists(resume.output_path)),
            "created_at":   resume.created_at.isoformat() if resume.created_at else None,
        })
    return result


@router.get("/resumes/{resume_id}/download-file")
def admin_download_resume(
    resume_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    user = get_user_from_token_string(token, db)
    if user.role != models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    resume = db.query(models.Resume).filter(models.Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.output_path or not os.path.exists(resume.output_path):
        raise HTTPException(status_code=404, detail="Resume file not available")
    safe_name = resume.version_name.replace(" ", "_").replace("/", "-")
    return FileResponse(
        resume.output_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{safe_name}_{resume.resume_type}.docx",
    )
