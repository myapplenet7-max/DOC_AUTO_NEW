# DocAuto — Indian Document Automation Platform

Upload PDFs/images → OCR (Telugu/English) → editable field extraction → DOCX download. Monetized with credits (₹10/doc), UPI payment screenshots reviewed by admin.

## Run & Operate

- Backend (Python): `cd backend && uvicorn main:app --host 0.0.0.0 --port 8080 --reload`
- Frontend (React): managed by `artifacts/docauto: web` workflow (Vite, port from $PORT)
- API Server workflow runs Python uvicorn automatically
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required env: `SESSION_SECRET` — used as JWT secret key fallback

## Stack

- **Frontend**: React + Vite + Tailwind CSS (`artifacts/docauto/`)
- **Backend**: Python 3.11, FastAPI, uvicorn (`backend/`)
- **Auth**: PyJWT + bcrypt (NOT python-jose/passlib — both blocked by Replit package firewall)
- **DB**: PostgreSQL + SQLAlchemy ORM (tables auto-created on startup)
- **OCR**: pdfplumber (text PDFs), easyocr lazy-loaded (image/scanned PDFs — unavailable in env)
- **Output**: python-docx for DOCX generation

## Where things live

- `backend/main.py` — FastAPI app entry point, table creation
- `backend/models.py` — SQLAlchemy models (User, Document, Payment) + CREDIT_PACKS
- `backend/auth_utils.py` — JWT/bcrypt helpers, OAuth2 dependency
- `backend/routers/` — auth, documents, payments, admin
- `backend/services/ocr_service.py` — text extraction + field detection
- `backend/services/docx_service.py` — DOCX generation with Telugu font support
- `artifacts/docauto/src/App.tsx` — full React app (all pages)
- `artifacts/docauto/src/AdminPage.tsx` — admin panel with payment review

## Architecture decisions

- Python backend runs as the `api-server` artifact on port 8080, not the Node.js Express template
- API prefix `/api` — all routes include `/api` prefix, routes through shared proxy
- Screenshot downloads use `?token=` query param auth (needed for `<img>` tags that can't set Authorization header)
- EasyOCR not installed (PyTorch too large); pdfplumber handles text PDFs; image OCR shows placeholder
- Credits: 1 credit = 1 document. Packs: ₹10/1, ₹50/6, ₹100/12, ₹500/15, ₹1000/35

## Product

- **Auth**: Register/Login with mobile + password
- **Upload**: PDF/image upload → OCR → editable field form → DOCX download
- **Credits**: UPI payment + screenshot submission → admin review → credits added
- **Admin**: Pending payment review with screenshot lightbox, user list, stats dashboard

## Gotchas

- **Never use python-jose or passlib** — blocked by Replit package firewall (HTTP 403)
- Use `import jwt` (PyJWT) and `import bcrypt` directly
- api-server artifact.toml dev command: `cd /home/runner/workspace/backend && uvicorn main:app --host 0.0.0.0 --port 8080 --reload`
- Admin user: first user must be manually promoted via SQL: `UPDATE users SET role='admin' WHERE id=1`
- Default admin credentials: mobile `9999999999`, password `admin123`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
