from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db
from auth_utils import require_admin, get_user_from_token_string
import models, schemas, os

router = APIRouter()

try:
    from services.whatsapp_service import notify_user_payment_approved, notify_user_payment_rejected
except Exception:
    def notify_user_payment_approved(*a, **kw): pass
    def notify_user_payment_rejected(*a, **kw): pass


# ── Helper: get a setting value with fallback to DEFAULT_SETTINGS ─────────────
def get_setting(db: Session, key: str) -> str:
    row = db.query(models.AppSettings).filter(models.AppSettings.key == key).first()
    if row:
        return row.value
    return models.DEFAULT_SETTINGS.get(key, "")


# ── Settings endpoints ────────────────────────────────────────────────────────

@router.get("/settings")
def get_all_settings(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = db.query(models.AppSettings).all()
    result = dict(models.DEFAULT_SETTINGS)  # start with defaults
    for row in rows:
        result[row.key] = row.value
    return result


@router.put("/settings")
def update_settings(
    data: dict,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
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
    return {"updated": updated}


# ── Payment endpoints ─────────────────────────────────────────────────────────

@router.get("/payments/pending", response_model=list[schemas.PaymentOut])
def pending_payments(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(models.Payment).filter(
        models.Payment.status == models.PaymentStatus.pending
    ).order_by(models.Payment.created_at.asc()).all()


@router.get("/payments/screenshot/{payment_id}")
def get_screenshot(
    payment_id: int,
    token: str = Query(None, description="JWT token for img-tag auth"),
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
    media_type = media_types.get(ext, "image/jpeg")
    return FileResponse(payment.screenshot_path, media_type=media_type)


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
        try:
            notify_user_payment_approved(
                user_whatsapp=user.mobile, user_name=user.name,
                amount=payment.amount, credits=payment.credits, new_balance=user.credits,
            )
        except Exception:
            pass
    elif data.status == "rejected":
        payment.status = models.PaymentStatus.rejected
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
    user.credits = max(0, user.credits + data.delta)
    db.commit(); db.refresh(user)
    return {"id": user.id, "name": user.name, "credits": user.credits}


@router.get("/stats")
def stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    total_users  = db.query(models.User).count()
    total_docs   = db.query(models.Document).count()
    total_tmpls  = db.query(models.Template).count()
    pending      = db.query(models.Payment).filter(models.Payment.status == models.PaymentStatus.pending).count()
    revenue_rows = db.query(models.Payment).filter(models.Payment.status == models.PaymentStatus.approved).with_entities(models.Payment.amount).all()
    return {
        "total_users": total_users,
        "total_documents": total_docs,
        "total_templates": total_tmpls,
        "pending_payments": pending,
        "total_revenue": sum(r[0] for r in revenue_rows),
    }
