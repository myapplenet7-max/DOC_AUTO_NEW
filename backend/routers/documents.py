import os, json, shutil, base64
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, Body
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from database import get_db
from auth_utils import get_current_user, get_user_from_token_string
import models, schemas
from models import DOC_COST_CREDITS
from services.ocr_service import extract_text, detect_fields, detect_placeholders, generate_template_from_text
from services.docx_service import generate_docx
from services.template_service import build_field_schema, generate_filled_docx
from services.format_service import (
    create_template_from_docx,
    fill_template_docx,
    docx_to_preview_html,
    highlight_placeholders_html,
    get_placeholder_keys_from_docx,
    pdf_to_preview_images,
    image_to_preview_html,
)

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/tmp/docauto_uploads")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/tmp/docauto_outputs")
PREVIEW_DIR = os.environ.get("PREVIEW_DIR", "/tmp/docauto_previews")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)

router = APIRouter()

DOCX_EXTS = {".docx", ".doc"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}


def _ext(path: str) -> str:
    return os.path.splitext(path)[1].lower()


@router.post("/from-text", response_model=schemas.DocumentOut)
async def create_document_from_text(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a document record directly from pasted text, bypassing OCR."""
    is_admin = current_user.role == models.UserRole.admin

    if not is_admin and current_user.credits < DOC_COST_CREDITS:
        raise HTTPException(status_code=402, detail="Not enough credits. Please recharge.")

    raw_text = (body.get("text") or "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    filename = body.get("filename") or "pasted_text.txt"
    fields = detect_fields(raw_text)

    if not is_admin:
        current_user.credits -= DOC_COST_CREDITS
        db.add(current_user)

    doc = models.Document(
        user_id=current_user.id,
        original_filename=filename,
        file_path="",
        extracted_fields=json.dumps(fields, ensure_ascii=False),
        credits_used=0 if is_admin else DOC_COST_CREDITS,
        status="processed",
    )
    db.add(doc); db.commit(); db.refresh(doc)
    return doc


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
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    fields = json.loads(doc.extracted_fields or "{}")
    raw_text = fields.get("raw_text", "")
    placeholders = detect_placeholders(raw_text, fields)
    is_docx = _ext(doc.file_path) in DOCX_EXTS

    from services.ocr_service import detect_document_type
    doc_type_info = detect_document_type(raw_text)

    return {
        "doc_id": doc_id,
        "placeholders": placeholders,
        "raw_text": raw_text,
        "source_is_docx": is_docx,
        "doc_type": doc_type_info,
    }


@router.post("/{doc_id}/rescan")
def rescan_placeholders(
    doc_id: int,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Second pass: find missing variables not in current placeholder list."""
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    fields = json.loads(doc.extracted_fields or "{}")
    raw_text = fields.get("raw_text", "")
    existing = body.get("existing_placeholders", [])

    from services.ocr_service import rescan_for_missing
    new_ph = rescan_for_missing(raw_text, existing)
    return {"new_placeholders": new_ph, "count": len(new_ph)}


@router.post("/{doc_id}/approve-placeholders")
def approve_placeholders(
    doc_id: int,
    data: schemas.PlaceholderApproval,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    fields = json.loads(doc.extracted_fields or "{}")
    raw_text = fields.get("raw_text", "")
    approved = [p for p in data.approved_placeholders if p.get("approved")]

    # ── Format-preserving path: DOCX source ──────────────────────────────────
    ext = _ext(doc.file_path)
    template_path = None

    if ext in DOCX_EXTS and approved:
        detected_values = {p["key"]: p["value"] for p in approved}
        template_path = os.path.join(OUTPUT_DIR, f"doc_{doc_id}_template.docx")
        try:
            create_template_from_docx(doc.file_path, detected_values, template_path)
        except Exception as e:
            template_path = None

    # Text-based template (always generated as fallback / for non-DOCX)
    template_content = generate_template_from_text(raw_text, approved)
    doc.template_content = template_content
    if template_path:
        doc.template_path = template_path
    db.commit(); db.refresh(doc)

    return {
        "doc_id": doc_id,
        "template_content": template_content,
        "has_format_preserved_template": template_path is not None,
        "placeholder_count": len(approved),
    }


# ── Preview endpoints ─────────────────────────────────────────────────────────

@router.get("/{doc_id}/preview-original")
def preview_original(
    doc_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Return HTML preview of the original uploaded document."""
    current_user = get_user_from_token_string(token, db)
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    ext = _ext(doc.file_path)
    if ext in DOCX_EXTS:
        html = docx_to_preview_html(doc.file_path)
    elif ext == ".pdf":
        preview_subdir = os.path.join(PREVIEW_DIR, f"doc_{doc_id}_orig")
        imgs = pdf_to_preview_images(doc.file_path, preview_subdir)
        if imgs:
            html = "\n".join(image_to_preview_html(p) for p in imgs)
            html = f'<div style="background:#f8fafc;padding:16px;">{html}</div>'
        else:
            fields = json.loads(doc.extracted_fields or "{}")
            raw = fields.get("raw_text", "(No text extracted)")
            html = f'<pre style="white-space:pre-wrap;font-family:sans-serif;padding:16px;font-size:13px;">{raw}</pre>'
    elif ext in IMAGE_EXTS:
        html = image_to_preview_html(doc.file_path)
    else:
        fields = json.loads(doc.extracted_fields or "{}")
        raw = fields.get("raw_text", "(No text extracted)")
        html = f'<pre style="white-space:pre-wrap;font-family:sans-serif;padding:16px;">{raw}</pre>'

    return HTMLResponse(content=html)


@router.get("/{doc_id}/preview-template")
def preview_template(
    doc_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Return HTML preview of the template (placeholders highlighted)."""
    current_user = get_user_from_token_string(token, db)
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Use format-preserved template DOCX if available
    if doc.template_path and os.path.exists(doc.template_path):
        html = highlight_placeholders_html(doc.template_path)
    elif doc.template_content:
        import html as html_module
        escaped = html_module.escape(doc.template_content)
        highlighted = _highlight_placeholders_in_text(escaped)
        html = f"""
<style>
  .tmpl-preview {{ font-family:'Nirmala UI',Arial,sans-serif;font-size:13px;line-height:1.8;
    padding:24px 32px;max-width:680px;margin:0 auto;white-space:pre-wrap; }}
  mark.ph {{ background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;
    border-radius:4px;padding:1px 4px;font-weight:600;font-size:0.85em; }}
</style>
<div class="tmpl-preview">{highlighted}</div>"""
    else:
        html = "<div style='padding:24px;color:#94a3b8;'>No template generated yet. Complete the placeholder review step first.</div>"

    return HTMLResponse(content=html)


@router.get("/{doc_id}/preview-output")
def preview_output(
    doc_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Return HTML preview of the generated output document."""
    current_user = get_user_from_token_string(token, db)
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc or not doc.output_path:
        raise HTTPException(status_code=404, detail="Output not generated yet")

    ext = _ext(doc.output_path)
    if ext in DOCX_EXTS:
        html = docx_to_preview_html(doc.output_path)
    else:
        html = "<div style='padding:24px;'>Output preview not available.</div>"

    return HTMLResponse(content=html)


def _highlight_placeholders_in_text(escaped_text: str) -> str:
    """Replace escaped {{PLACEHOLDER}} with highlighted HTML."""
    return re.sub(
        r'\{\{([A-Z0-9_]+)\}\}',
        lambda m: (
            f'<mark class="ph">{{{{{m.group(1)}}}}}</mark>'
        ),
        escaped_text
    )

import re


# ── Field / template update endpoints ────────────────────────────────────────

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
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    fields = json.loads(doc.extracted_fields or "{}")
    output_path = os.path.join(OUTPUT_DIR, f"doc_{doc_id}.docx")

    # ── Format-preserving path ────────────────────────────────────────────────
    if doc.template_path and os.path.exists(doc.template_path):
        keys = get_placeholder_keys_from_docx(doc.template_path)
        fill_values = {}
        for key in keys:
            # Support both uppercase keys (DEPONENT_NAME) and lowercase (deponent_name)
            value = fields.get(key, "") or fields.get(key.lower(), "") or ""
            fill_values[key] = value
        fill_template_docx(doc.template_path, fill_values, output_path)
    else:
        # Fallback: generate from scratch (existing behavior)
        generate_docx(fields, output_path)

    doc.output_path = output_path
    doc.status = "downloaded"
    db.commit(); db.refresh(doc)
    return doc


@router.post("/{doc_id}/save-template")
def save_as_template(
    doc_id: int,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    template_content = doc.template_content or body.get("template_content", "")
    if not template_content:
        raise HTTPException(status_code=400, detail="No template content. Complete placeholder review first.")

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
    token: str = Query(...),
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
def list_documents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Document).filter(
        models.Document.user_id == current_user.id
    ).order_by(models.Document.created_at.desc()).all()


@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc); db.commit()
    return {"ok": True}


@router.post("/{doc_id}/create-template")
def auto_create_template(
    doc_id: int,
    body: dict = Body(default={}),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Auto-create a template from an already-generated document, adding it to the library."""
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id, models.Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.template_content:
        raise HTTPException(status_code=400, detail="No template content. Complete placeholder review first.")

    from services.template_service import build_field_schema
    name     = body.get("name", f"{doc.original_filename} Template")
    category = body.get("category", doc.doc_type or "Custom Templates")
    desc     = body.get("description", "")

    # Avoid duplicates: check if a template from this doc already exists
    existing = db.query(models.Template).filter(
        models.Template.source_doc_id == doc_id,
        models.Template.user_id == current_user.id,
    ).first()
    if existing:
        return {"template_id": existing.id, "name": existing.name, "already_existed": True}

    field_schema = build_field_schema(doc.template_content)
    tmpl = models.Template(
        user_id=current_user.id,
        name=name,
        category=category,
        description=desc,
        template_content=doc.template_content,
        field_schema=field_schema,
        source_doc_id=doc_id,
    )
    db.add(tmpl); db.commit(); db.refresh(tmpl)
    return {"template_id": tmpl.id, "name": tmpl.name, "already_existed": False}
