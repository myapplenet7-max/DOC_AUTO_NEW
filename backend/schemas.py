from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class UserRegister(BaseModel):
    name: str
    mobile: str
    email: Optional[str] = None
    password: str

class UserLogin(BaseModel):
    mobile: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    name: str
    role: str
    credits: int

class UserOut(BaseModel):
    id: int
    name: str
    mobile: str
    email: Optional[str]
    credits: int
    role: str
    created_at: datetime
    class Config:
        from_attributes = True

class ExtractedFieldsUpdate(BaseModel):
    fields: Dict[str, Any]

class DocumentOut(BaseModel):
    id: int
    original_filename: str
    doc_type: Optional[str]
    extracted_fields: Optional[str]
    template_content: Optional[str]
    template_path: Optional[str]
    output_path: Optional[str]
    pdf_output_path: Optional[str]
    credits_used: int
    status: str
    created_at: datetime
    class Config:
        from_attributes = True

class PaymentCreate(BaseModel):
    amount: float
    credits: int
    upi_ref: Optional[str] = None

class PaymentOut(BaseModel):
    id: int
    user_id: int
    amount: float
    credits: int
    upi_ref: Optional[str]
    screenshot_path: Optional[str]
    status: str
    admin_note: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True

class PaymentReview(BaseModel):
    status: str
    admin_note: Optional[str] = None

class BulkEnquiry(BaseModel):
    message: Optional[str] = None

class CreditAdjust(BaseModel):
    delta: int

class TemplateCreate(BaseModel):
    name: str
    category: Optional[str] = "Custom Templates"
    description: Optional[str] = None
    template_content: str
    field_schema: Optional[str] = None
    source_doc_id: Optional[int] = None

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    template_content: Optional[str] = None
    field_schema: Optional[str] = None
    is_favorite: Optional[bool] = None

class TemplateOut(BaseModel):
    id: int
    user_id: int
    name: str
    category: Optional[str]
    description: Optional[str]
    template_content: str
    field_schema: Optional[str]
    source_doc_id: Optional[int]
    use_count: int
    is_favorite: bool = False
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class TemplateFill(BaseModel):
    fields: Dict[str, str]

class PlaceholderApproval(BaseModel):
    approved_placeholders: List[Dict[str, Any]]

# ── Resume schemas ────────────────────────────────────────────────────────────

class ResumeCreate(BaseModel):
    resume_type: str = "fresher"    # fresher | experienced | creative
    version_name: str = "My Resume"
    data_json: Optional[str] = None  # JSON string of resume form data

class ResumeUpdate(BaseModel):
    version_name: Optional[str] = None
    data_json: Optional[str] = None

class ResumeOut(BaseModel):
    id: int
    user_id: int
    resume_type: str
    version_name: str
    data_json: Optional[str]
    output_path: Optional[str]
    preview_path: Optional[str]
    credits_used: int
    status: str
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True
