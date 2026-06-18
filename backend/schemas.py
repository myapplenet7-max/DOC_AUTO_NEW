from pydantic import BaseModel
from typing import Optional, Dict, Any
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
    output_path: Optional[str]
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
