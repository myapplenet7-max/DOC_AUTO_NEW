from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class UserRole(str, enum.Enum):
    user  = "user"
    admin = "admin"

class PaymentStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"

class ResumeType(str, enum.Enum):
    fresher     = "fresher"
    experienced = "experienced"
    creative    = "creative"

CREDIT_PACKS = [
    (10,    1),
    (50,    6),
    (100,  15),
    (500, 100),
]

DOC_COST_CREDITS = 1

TEMPLATE_CATEGORIES = [
    "Affidavit",
    "Sale Deed",
    "Agricultural Sale Deed",
    "Court Documents",
    "Agreements",
    "Rental Agreements",
    "GPA",
    "Will",
    "Gift Deed",
    "Legal Notices",
    "Certificates",
    "Government Forms",
    "Custom Templates",
]

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String, nullable=False)
    mobile          = Column(String, unique=True, index=True, nullable=False)
    email           = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    credits         = Column(Integer, default=0)
    role            = Column(Enum(UserRole), default=UserRole.user)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    documents = relationship("Document", back_populates="owner")
    payments  = relationship("Payment",  back_populates="user")
    templates = relationship("Template", back_populates="creator")
    resumes   = relationship("Resume",   back_populates="owner")


class Document(Base):
    __tablename__ = "documents"

    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey("users.id"), nullable=False)
    original_filename = Column(String, nullable=False)
    file_path         = Column(String, nullable=False)
    doc_type          = Column(String, nullable=True)
    extracted_fields  = Column(Text,   nullable=True)
    template_content  = Column(Text,   nullable=True)
    template_path     = Column(String, nullable=True)
    output_path       = Column(String, nullable=True)
    pdf_output_path   = Column(String, nullable=True)
    credits_used      = Column(Integer, default=1)
    status            = Column(String,  default="uploaded")
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="documents")


class Template(Base):
    __tablename__ = "templates"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id"), nullable=False)
    name             = Column(String, nullable=False)
    category         = Column(String, nullable=True, default="Custom Templates")
    description      = Column(String, nullable=True)
    template_content = Column(Text,   nullable=False)
    field_schema     = Column(Text,   nullable=True)
    source_doc_id    = Column(Integer, ForeignKey("documents.id"), nullable=True)
    use_count        = Column(Integer, default=0)
    is_favorite      = Column(Boolean, default=False)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("User", back_populates="templates")


class Payment(Base):
    __tablename__ = "payments"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount          = Column(Float,  nullable=False)
    credits         = Column(Integer, nullable=False)
    upi_ref         = Column(String, nullable=True)
    screenshot_path = Column(String, nullable=True)
    status          = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    admin_note      = Column(String, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at     = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="payments")


class Resume(Base):
    __tablename__ = "resumes"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    resume_type  = Column(Enum(ResumeType), nullable=False, default=ResumeType.fresher)
    version_name = Column(String, nullable=False, default="My Resume")
    data_json    = Column(Text, nullable=True)      # JSON blob of resume form data
    output_path  = Column(String, nullable=True)    # final DOCX
    preview_path = Column(String, nullable=True)    # watermarked DOCX
    credits_used = Column(Integer, default=0)
    status       = Column(String, default="draft")  # draft | generated
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="resumes")


class AppSettings(Base):
    """Admin-configurable platform settings stored as key/value pairs."""
    __tablename__ = "app_settings"

    key        = Column(String, primary_key=True)
    value      = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


DEFAULT_SETTINGS = {
    "starting_credits":          "5",
    "doc_cost_credits":          "1",
    "resume_cost_credits":       "1",
    "resume_types_enabled":      "fresher,experienced,creative",
    "preview_watermark_enabled": "true",
    "preview_watermark_text":    "PREVIEW - DocAuto",
    "similarity_auto_reuse":     "95",
    "similarity_ask_user":       "75",
    "max_upload_mb":             "20",
    "upi_id":                    "docauto@upi",
}
