import os, json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from auth_utils import get_current_user, get_user_from_token_string
import models, schemas
from services.template_service import (
    extract_placeholder_keys,
    fill_template,
    generate_filled_docx,
    generate_template_docx_preview,
    build_field_schema,
)

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/tmp/docauto_outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

router = APIRouter()


@router.get("/categories")
def get_categories():
    return {"categories": models.TEMPLATE_CATEGORIES}


@router.get("/", response_model=list[schemas.TemplateOut])
def list_templates(
    category: str = Query(None),
    search: str = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Template).filter(models.Template.user_id == current_user.id)
    if category:
        q = q.filter(models.Template.category == category)
    if search:
        q = q.filter(
            models.Template.name.ilike(f"%{search}%") |
            models.Template.description.ilike(f"%{search}%")
        )
    return q.order_by(models.Template.updated_at.desc()).all()


@router.post("/", response_model=schemas.TemplateOut)
def create_template(
    data: schemas.TemplateCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    field_schema = data.field_schema or build_field_schema(data.template_content)
    tmpl = models.Template(
        user_id=current_user.id,
        name=data.name,
        category=data.category or "Custom Templates",
        description=data.description,
        template_content=data.template_content,
        field_schema=field_schema,
        source_doc_id=data.source_doc_id,
    )
    db.add(tmpl); db.commit(); db.refresh(tmpl)
    return tmpl


@router.get("/{tmpl_id}", response_model=schemas.TemplateOut)
def get_template(
    tmpl_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tmpl = db.query(models.Template).filter(
        models.Template.id == tmpl_id,
        models.Template.user_id == current_user.id,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.put("/{tmpl_id}", response_model=schemas.TemplateOut)
def update_template(
    tmpl_id: int,
    data: schemas.TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tmpl = db.query(models.Template).filter(
        models.Template.id == tmpl_id,
        models.Template.user_id == current_user.id,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if data.name is not None:
        tmpl.name = data.name
    if data.category is not None:
        tmpl.category = data.category
    if data.description is not None:
        tmpl.description = data.description
    if data.template_content is not None:
        tmpl.template_content = data.template_content
        tmpl.field_schema = build_field_schema(data.template_content)
    if data.is_favorite is not None:
        tmpl.is_favorite = data.is_favorite
    db.commit(); db.refresh(tmpl)
    return tmpl


@router.delete("/{tmpl_id}")
def delete_template(
    tmpl_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tmpl = db.query(models.Template).filter(
        models.Template.id == tmpl_id,
        models.Template.user_id == current_user.id,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tmpl); db.commit()
    return {"ok": True}


@router.post("/{tmpl_id}/duplicate", response_model=schemas.TemplateOut)
def duplicate_template(
    tmpl_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a copy of a template with '(Copy)' suffix."""
    tmpl = db.query(models.Template).filter(
        models.Template.id == tmpl_id,
        models.Template.user_id == current_user.id,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    copy = models.Template(
        user_id=current_user.id,
        name=f"{tmpl.name} (Copy)",
        category=tmpl.category,
        description=tmpl.description,
        template_content=tmpl.template_content,
        field_schema=tmpl.field_schema,
        source_doc_id=tmpl.source_doc_id,
        use_count=0,
    )
    db.add(copy); db.commit(); db.refresh(copy)
    return copy


@router.patch("/{tmpl_id}/favorite")
def toggle_favorite(
    tmpl_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tmpl = db.query(models.Template).filter(
        models.Template.id == tmpl_id,
        models.Template.user_id == current_user.id,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    tmpl.is_favorite = not tmpl.is_favorite
    db.commit()
    return {"is_favorite": tmpl.is_favorite}


@router.get("/{tmpl_id}/fields")
def get_template_fields(
    tmpl_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tmpl = db.query(models.Template).filter(
        models.Template.id == tmpl_id,
        models.Template.user_id == current_user.id,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    keys = extract_placeholder_keys(tmpl.template_content)
    return {"keys": keys, "field_schema": tmpl.field_schema}


@router.post("/{tmpl_id}/fill")
def fill_and_generate(
    tmpl_id: int,
    data: schemas.TemplateFill,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tmpl = db.query(models.Template).filter(
        models.Template.id == tmpl_id,
        models.Template.user_id == current_user.id,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    output_path = os.path.join(OUTPUT_DIR, f"tmpl_{tmpl_id}_filled_{current_user.id}.docx")
    generate_filled_docx(tmpl.template_content, data.fields, output_path, tmpl.name)

    tmpl.use_count += 1
    db.commit()

    return {"output_path": output_path, "tmpl_id": tmpl_id, "ok": True}


@router.get("/{tmpl_id}/download-filled")
def download_filled(
    tmpl_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    current_user = get_user_from_token_string(token, db)
    output_path = os.path.join(OUTPUT_DIR, f"tmpl_{tmpl_id}_filled_{current_user.id}.docx")
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="No filled document found. Please fill the template first.")
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"filled_template_{tmpl_id}.docx",
    )


@router.get("/{tmpl_id}/download-template")
def download_template_docx(
    tmpl_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    current_user = get_user_from_token_string(token, db)
    tmpl = db.query(models.Template).filter(
        models.Template.id == tmpl_id,
        models.Template.user_id == current_user.id,
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    output_path = os.path.join(OUTPUT_DIR, f"tmpl_{tmpl_id}_preview.docx")
    generate_template_docx_preview(tmpl.template_content, output_path, tmpl.name)
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"template_{tmpl.name.replace(' ', '_')}.docx",
    )
