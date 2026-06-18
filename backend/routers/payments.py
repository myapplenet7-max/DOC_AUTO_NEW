import os, shutil
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth_utils import get_current_user
import models, schemas
from models import CREDIT_PACKS
from services.whatsapp_service import notify_admin_new_payment

SCREENSHOT_DIR = os.environ.get("SCREENSHOT_DIR", "/tmp/docauto_screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

router = APIRouter()

@router.get("/packs")
def get_packs():
    return [
        {"amount": amt, "credits": credits, "per_doc": round(amt / credits, 2)}
        for amt, credits in CREDIT_PACKS
    ]

@router.post("/submit", response_model=schemas.PaymentOut)
async def submit_payment(
    amount: float = Form(...),
    credits: int  = Form(...),
    upi_ref: str  = Form(None),
    screenshot: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    valid = dict(CREDIT_PACKS)
    if int(amount) not in valid or valid[int(amount)] != credits:
        raise HTTPException(status_code=400, detail="Invalid pack selection")

    screenshot_path = os.path.join(SCREENSHOT_DIR, f"pay_{current_user.id}_{screenshot.filename}")
    with open(screenshot_path, "wb") as f:
        shutil.copyfileobj(screenshot.file, f)

    payment = models.Payment(
        user_id=current_user.id, amount=amount, credits=credits,
        upi_ref=upi_ref, screenshot_path=screenshot_path,
        status=models.PaymentStatus.pending,
    )
    db.add(payment); db.commit(); db.refresh(payment)

    notify_admin_new_payment(
        user_name=current_user.name, user_mobile=current_user.mobile,
        amount=amount, credits=credits, payment_id=payment.id, upi_ref=upi_ref,
    )
    return payment

@router.get("/my", response_model=list[schemas.PaymentOut])
def my_payments(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Payment).filter(
        models.Payment.user_id == current_user.id
    ).order_by(models.Payment.created_at.desc()).all()

@router.post("/bulk-enquiry")
def bulk_enquiry(
    data: schemas.BulkEnquiry,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from services.whatsapp_service import notify_admin_bulk_enquiry
    notify_admin_bulk_enquiry(
        user_name=current_user.name,
        user_mobile=current_user.mobile,
        message=data.message,
    )
    return {"message": "Enquiry sent. We'll contact you on WhatsApp shortly."}
