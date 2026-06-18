---
name: DocAuto Python Backend
description: Key decisions and constraints for the DocAuto FastAPI backend running on Replit
---

# DocAuto Backend Setup

## JWT / Auth
- Use `PyJWT` (import as `import jwt as pyjwt`) — NOT `python-jose` (403 blocked by package firewall)
- Use `bcrypt` directly — NOT `passlib` (403 blocked)
- `auth_utils.py` exports `get_user_from_token_string(token, db)` for query-param auth (used by image/download endpoints)
- Admin bypass: in `documents.py`, check `current_user.role == UserRole.admin` before deducting credits

## OCR
- `easyocr` cannot be installed — PyTorch dependency is too large / fails silently
- `pdfplumber` works for text-based PDFs (most use case)
- `ocr_service.py` has graceful fallback: checks `_EASYOCR_AVAILABLE` before using easyocr
- Image uploads and scanned PDFs will return placeholder text; user fills fields manually

## Artifact / Workflow
- api-server: `cd /home/runner/workspace/backend && uvicorn main:app --host 0.0.0.0 --port 8080 --reload`
- `localPort = 8080`, path = `/api`
- Database tables auto-created on startup via `Base.metadata.create_all(bind=engine)`

## Admin User
- Default admin: mobile `9999999999`, password `Admin@123` (created via `python create_admin.py`)
- Admin accounts bypass credit deduction in documents.py
- Admin role visible via purple banner in dashboard and sidebar
- Admin credit adjust endpoint: `PUT /api/admin/users/{id}/credits` with `{"delta": N}`

## Schemas
- `PaymentOut` now includes `user_id` field (needed by admin panel to show which user submitted)
- `CreditAdjust` schema: `{"delta": int}` — used by admin credit adjustment endpoint

**Why PyJWT over python-jose:**
Replit package firewall blocks python-jose with HTTP 403. PyJWT provides equivalent JWT encode/decode and is allowed. The API is identical for HS256 tokens.
