from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from auth_utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()

@router.post("/register", response_model=schemas.TokenResponse)
def register(data: schemas.UserRegister, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.mobile == data.mobile).first():
        raise HTTPException(status_code=400, detail="Mobile number already registered")
    user = models.User(
        name=data.name, mobile=data.mobile,
        email=data.email, hashed_password=hash_password(data.password),
    )
    db.add(user); db.commit(); db.refresh(user)
    token = create_access_token({"sub": user.id})
    return schemas.TokenResponse(access_token=token, user_id=user.id, name=user.name, role=user.role.value, credits=user.credits)

@router.post("/login", response_model=schemas.TokenResponse)
def login(data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid mobile or password")
    token = create_access_token({"sub": user.id})
    return schemas.TokenResponse(access_token=token, user_id=user.id, name=user.name, role=user.role.value, credits=user.credits)

@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
