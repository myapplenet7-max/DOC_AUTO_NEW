import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from auth_utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()
logger = logging.getLogger("docauto.auth")


@router.post("/register", response_model=schemas.TokenResponse)
def register(data: schemas.UserRegister, db: Session = Depends(get_db)):
    logger.info("REGISTER attempt: mobile=%s name=%s", data.mobile, data.name)
    if db.query(models.User).filter(models.User.mobile == data.mobile).first():
        logger.warning("REGISTER failed: mobile=%s already registered", data.mobile)
        raise HTTPException(status_code=400, detail="Mobile number already registered")
    user = models.User(
        name=data.name, mobile=data.mobile,
        email=data.email, hashed_password=hash_password(data.password),
    )
    db.add(user); db.commit(); db.refresh(user)
    logger.info("REGISTER success: mobile=%s user_id=%s", data.mobile, user.id)
    token = create_access_token({"sub": user.id})
    return schemas.TokenResponse(
        access_token=token, user_id=user.id,
        name=user.name, role=user.role.value, credits=user.credits,
    )


@router.post("/login", response_model=schemas.TokenResponse)
def login(data: schemas.UserLogin, db: Session = Depends(get_db)):
    logger.info("LOGIN attempt: mobile=%s", data.mobile)

    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()

    if not user:
        logger.warning("LOGIN failed: mobile=%s — user not found", data.mobile)
        raise HTTPException(
            status_code=401,
            detail="No account found with this mobile number. Please register first.",
        )

    if not user.is_active:
        logger.warning("LOGIN failed: mobile=%s — account deactivated", data.mobile)
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Contact support.")

    if not verify_password(data.password, user.hashed_password):
        logger.warning("LOGIN failed: mobile=%s — wrong password", data.mobile)
        raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")

    token = create_access_token({"sub": user.id})
    logger.info("LOGIN success: mobile=%s user_id=%s role=%s", data.mobile, user.id, user.role.value)
    return schemas.TokenResponse(
        access_token=token, user_id=user.id,
        name=user.name, role=user.role.value, credits=user.credits,
    )


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
