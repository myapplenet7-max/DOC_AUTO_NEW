import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, documents, payments, admin
from database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="DocAuto API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])

@app.get("/api/healthz")
def healthz():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"message": "DocAuto API is running"}
