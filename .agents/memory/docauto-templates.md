---
name: DocAuto Template System
description: Template model, CRUD API, placeholder detection flow, and frontend library page.
---

# DocAuto Template System

**Why:** The app needed a full template lifecycle — detect variable fields from docs, let users approve/rename placeholders, save reusable templates, and fill them later.

## Architecture

- `models.py` — `Template` model (user_id, name, category, template_content with {{KEY}} tokens, field_schema JSON, use_count)
- `services/ocr_service.py` — `detect_placeholders()` returns confidence-ranked suggestions; `generate_template_from_text()` replaces values with tokens
- `services/template_service.py` — `fill_template()`, `generate_filled_docx()`, `build_field_schema()`, `extract_placeholder_keys()`
- `routers/templates.py` — GET /templates, POST, PUT, DELETE, POST /{id}/fill, GET /{id}/download-filled, GET /{id}/download-template
- `routers/documents.py` — POST /{id}/approve-placeholders, POST /{id}/save-template, GET /{id}/placeholders

## Frontend Multi-Step Flow

1. Upload → 2. Review AI placeholders (approve/rename each) → 3. Edit fields → 4. Generate & optionally save template

## Template Categories

Affidavit, Sale Deed, Court Documents, Agreements, Rental Agreements, GPA, Legal Notices, Certificates, Government Forms, Custom Templates

## How to Apply

- Placeholder tokens are `{{UPPER_SNAKE_CASE}}` format
- `build_field_schema()` auto-generates JSON schema for the fill form
- Confidence ≥ 0.9 → auto-approved; lower → user must manually approve
