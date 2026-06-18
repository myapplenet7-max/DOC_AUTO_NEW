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
    "Court Documents",
    "Agreements",
    "Rental Agreements",
    "GPA",
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


class Document(Base):
    __tablename__ = "documents"

    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey("users.id"), nullable=False)
    original_filename = Column(String, nullable=False)
    file_path         = Column(String, nullable=False)
    doc_type          = Column(String, nullable=True)
    extracted_fields  = Column(Text,   nullable=True)
    template_content  = Column(Text,   nullable=True)
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
