import os, json, shutil
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, Body
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from auth_utils import get_current_user, get_user_from_token_string
import models, schemas
from models import DOC_COST_CREDITS
from services.ocr_service import extract_text, detect_fields, detect_placeholders, generate_template_from_text
from services.docx_service import generate_docx
from services.template_service import build_field_schema, generate_filled_docx

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
    is_admin = current_user.role == models.UserRole.admin

    if not is_admin and current_user.credits < DOC_COST_CREDITS:
        raise HTTPException(status_code=402, detail="Not enough credits. Please recharge.")

    safe_name = file.filename.replace(" ", "_")
    file_path = os.path.join(UPLOAD_DIR, f"{current_user.id}_{safe_name}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    raw_text = extract_text(file_path)
    fields   = detect_fields(raw_text)

    if not is_admin:
        current_user.credits -= DOC_COST_CREDITS
        db.add(current_user)

    doc = models.Document(
        user_id=current_user.id,
        original_filename=file.filename,
        file_path=file_path,
        extracted_fields=json.dumps(fields, ensure_ascii=False),
        credits_used=0 if is_admin else DOC_COST_CREDITS,
        status="processed",
    )
    db.add(doc); db.commit(); db.refresh(doc)
    return doc


@router.get("/{doc_id}/placeholders")
def get_placeholders(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return AI-detected placeholder suggestions for user review."""
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    fields = json.loads(doc.extracted_fields or "{}")
    raw_text = fields.get("raw_text", "")
    placeholders = detect_placeholders(raw_text, fields)
    return {"doc_id": doc_id, "placeholders": placeholders, "raw_text": raw_text}


@router.post("/{doc_id}/approve-placeholders")
def approve_placeholders(
    doc_id: int,
    data: schemas.PlaceholderApproval,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """After user reviews placeholders, generate template content and save it."""
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    fields = json.loads(doc.extracted_fields or "{}")
    raw_text = fields.get("raw_text", "")
    approved = [p for p in data.approved_placeholders if p.get("approved")]

    template_content = generate_template_from_text(raw_text, approved)
    doc.template_content = template_content
    db.commit(); db.refresh(doc)

    return {
        "doc_id": doc_id,
        "template_content": template_content,
        "placeholder_count": len(approved),
    }


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


@router.post("/{doc_id}/save-template")
def save_as_template(
    doc_id: int,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Save the reviewed template to the template library."""
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    template_content = doc.template_content or body.get("template_content", "")
    if not template_content:
        raise HTTPException(status_code=400, detail="No template content found. Please approve placeholders first.")

    name        = body.get("name", doc.original_filename)
    category    = body.get("category", "Custom Templates")
    description = body.get("description", "")

    field_schema = build_field_schema(template_content)

    tmpl = models.Template(
        user_id=current_user.id,
        name=name,
        category=category,
        description=description,
        template_content=template_content,
        field_schema=field_schema,
        source_doc_id=doc_id,
    )
    db.add(tmpl); db.commit(); db.refresh(tmpl)
    return {"template_id": tmpl.id, "name": tmpl.name, "category": tmpl.category}


@router.get("/{doc_id}/download")
def download_document(
    doc_id: int,
    token: str = Query(..., description="JWT access token"),
    db: Session = Depends(get_db),
):
    current_user = get_user_from_token_string(token, db)
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
