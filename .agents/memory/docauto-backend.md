---
name: DocAuto Python Backend
description: Key decisions and constraints for the DocAuto FastAPI backend running on Replit
---

# DocAuto Backend Setup

## JWT / Auth
- Use `PyJWT` (import as `import jwt`) — NOT `python-jose` (403 blocked by package firewall)
- Use `bcrypt` directly — NOT `passlib` (403 blocked)
- `auth_utils.py` is the source of truth for token creation/verification

## OCR
- `easyocr` cannot be installed — PyTorch dependency is too large / fails silently
- `pdfplumber` works for text-based PDFs (most use case)
- `ocr_service.py` has graceful fallback: checks `_EASYOCR_AVAILABLE` before using easyocr
- Image uploads and scanned PDFs will return placeholder text; user fills fields manually

## Artifact / Workflow
- api-server artifact.toml dev run: `cd /home/runner/workspace/backend && uvicorn main:app --host 0.0.0.0 --port 8080 --reload`
- `localPort = 8080`, path = `/api`
- Database tables auto-created on startup via `Base.metadata.create_all(bind=engine)`

## Admin User
- First registered user (mobile: 9999999999) was manually promoted to admin via SQL: `UPDATE users SET role='admin' WHERE id=1`
- To create a new admin: register via /api/auth/register, then run the SQL above

**Why PyJWT over python-jose:**
Replit package firewall blocks python-jose with HTTP 403. PyJWT provides equivalent JWT encode/decode and is allowed. The API is identical for HS256 tokens.
