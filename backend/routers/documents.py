import os, json, shutil
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import jwt
from database import get_db
from auth_utils import get_current_user, SECRET_KEY, ALGORITHM
import models, schemas
from models import DOC_COST_CREDITS
from services.ocr_service import extract_text, detect_fields
from services.docx_service import generate_docx

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/tmp/docauto_uploads")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/tmp/docauto_outputs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

router = APIRouter()

@router.post("/upload", response_model=schemas.DocumentOut)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.credits < DOC_COST_CREDITS:
        raise HTTPException(status_code=402, detail="Not enough credits. Please recharge.")

    file_path = os.path.join(UPLOAD_DIR, f"{current_user.id}_{file.filename}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    raw_text = extract_text(file_path)
    fields   = detect_fields(raw_text)

    current_user.credits -= DOC_COST_CREDITS
    db.add(current_user)

    doc = models.Document(
        user_id=current_user.id, original_filename=file.filename,
        file_path=file_path, extracted_fields=json.dumps(fields, ensure_ascii=False),
        credits_used=DOC_COST_CREDITS, status="processed",
    )
    db.add(doc); db.commit(); db.refresh(doc)
    return doc

@router.put("/{doc_id}/fields", response_model=schemas.DocumentOut)
def update_fields(
    doc_id: int, data: schemas.ExtractedFieldsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.extracted_fields = json.dumps(data.fields, ensure_ascii=False)
    db.commit(); db.refresh(doc)
    return doc

@router.post("/{doc_id}/generate", response_model=schemas.DocumentOut)
def generate_document(
    doc_id: int, db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    fields      = json.loads(doc.extracted_fields or "{}")
    output_path = os.path.join(OUTPUT_DIR, f"doc_{doc_id}.docx")
    generate_docx(fields, output_path)
    doc.output_path = output_path; doc.status = "downloaded"
    db.commit(); db.refresh(doc)
    return doc

def _get_user_from_query_token(token: str, db: Session) -> models.User:
    credentials_exc = HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exc
    except Exception:
        raise credentials_exc
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exc
    return user

@router.get("/{doc_id}/download")
def download_document(
    doc_id: int,
    token: str = Query(..., description="JWT access token"),
    db: Session = Depends(get_db),
):
    current_user = _get_user_from_query_token(token, db)
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc or not doc.output_path:
        raise HTTPException(status_code=404, detail="Generated file not found")
    return FileResponse(
        doc.output_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"document_{doc_id}.docx",
    )

@router.get("/", response_model=list[schemas.DocumentOut])
def list_documents(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Document).filter(
        models.Document.user_id == current_user.id
    ).order_by(models.Document.created_at.desc()).all()
