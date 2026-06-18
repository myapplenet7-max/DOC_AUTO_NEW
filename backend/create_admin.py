import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from models import User, UserRole
from auth_utils import hash_password

db = SessionLocal()

mobile = "9999999999"   # ← change to your number
password = "Admin@123"  # ← change to your password
name = "Admin"

existing = db.query(User).filter(User.mobile == mobile).first()
if existing:
    existing.role = UserRole.admin
    db.commit()
    print(f"✅ Promoted {mobile} to admin")
else:
    admin = User(
        name=name,
        mobile=mobile,
        email="admin@docauto.com",
        hashed_password=hash_password(password),
        role=UserRole.admin,
        credits=9999,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    print(f"✅ Admin created: {mobile} / {password}")

db.close()