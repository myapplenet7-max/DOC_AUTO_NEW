import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, documents, payments, admin, templates, resumes
from database import engine, Base, SessionLocal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("docauto")

ADMIN_MOBILE   = os.getenv("ADMIN_MOBILE",   "9999999999")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD",  "Admin@123")
ADMIN_NAME     = os.getenv("ADMIN_NAME",      "Admin")

app = FastAPI(title="DocAuto API", version="2.0.0")


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    _ensure_admin_exists()


def _ensure_admin_exists():
    import models as m
    from auth_utils import hash_password
    db = SessionLocal()
    try:
        existing_admin = db.query(m.User).filter(
            m.User.role == m.UserRole.admin
        ).first()
        if existing_admin:
            logger.info("✅ Admin exists: mobile=%s name=%s", existing_admin.mobile, existing_admin.name)
            return
        logger.warning("⚠️  No admin — creating default admin account")
        by_mobile = db.query(m.User).filter(m.User.mobile == ADMIN_MOBILE).first()
        if by_mobile:
            by_mobile.role = m.UserRole.admin
            by_mobile.is_active = True
            db.commit()
            logger.info("✅ Promoted existing user to admin: mobile=%s", ADMIN_MOBILE)
        else:
            new_admin = m.User(
                name=ADMIN_NAME,
                mobile=ADMIN_MOBILE,
                email="admin@docauto.in",
                hashed_password=hash_password(ADMIN_PASSWORD),
                role=m.UserRole.admin,
                credits=9999,
                is_active=True,
            )
            db.add(new_admin)
            db.commit()
            logger.info("✅ Default admin created: mobile=%s password=%s", ADMIN_MOBILE, ADMIN_PASSWORD)
    except Exception as exc:
        logger.error("❌ Failed to ensure admin: %s", exc)
    finally:
        db.close()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(payments.router,  prefix="/api/payments",  tags=["Payments"])
app.include_router(admin.router,     prefix="/api/admin",     tags=["Admin"])
app.include_router(templates.router, prefix="/api/templates", tags=["Templates"])
app.include_router(resumes.router,   prefix="/api/resumes",   tags=["Resumes"])


@app.get("/api/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "DocAuto API v2 is running"}
