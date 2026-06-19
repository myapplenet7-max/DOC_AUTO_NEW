---
name: DocAuto Template System
description: Template model, CRUD API, placeholder detection flow, frontend library page, and V3 improvements.
---

# DocAuto Template System

**Why:** The app needed a full template lifecycle — detect variable fields from docs, let users approve/rename placeholders, save reusable templates, and fill them unlimited times.

## Architecture

- `models.py` — `Template` model: user_id, name, category, template_content ({{KEY}} tokens), field_schema JSON, use_count, is_favorite; `AppSettings` model: key/value store with DEFAULT_SETTINGS dict
- `services/ocr_service.py` — `detect_placeholders()` returns confidence-ranked suggestions; `generate_template_from_text()` replaces values with tokens
- `services/template_service.py` — `fill_template()`, `generate_filled_docx()`, `build_field_schema()`, `extract_placeholder_keys()`
- `routers/templates.py` — GET /templates, POST, PUT, DELETE, POST /{id}/fill, POST /{id}/duplicate, PATCH /{id}/favorite, GET /{id}/download-filled, GET /{id}/download-template
- `routers/documents.py` — POST /{id}/approve-placeholders, POST /{id}/save-template, POST /{id}/create-template (auto-add to library, dedup by source_doc_id), DELETE /{id}
- `routers/admin.py` — GET/PUT /admin/settings (configurable: starting_credits, doc_cost_credits, preview_watermark_enabled/text, similarity_auto_reuse/ask_user, max_upload_mb, upi_id)

## DB Migration Notes

New columns added via ALTER TABLE (not in original create_all):
- `templates.is_favorite` — added manually; create_all does NOT auto-add columns to existing tables
- `app_settings` table — created via create_all (new table, works fine)

**How to apply:** If deploying to new DB, create_all handles everything. If migrating existing DB, run: `ALTER TABLE templates ADD COLUMN is_favorite BOOLEAN DEFAULT FALSE`

## Frontend Pages

### TemplateLibraryPage
- Sort: recent / most_used / favorites
- Favorites toggle (star button, persisted in DB)
- Duplicate button (creates copy with "(Copy)" suffix)
- Source badge: "AI" label when source_doc_id is set
- Fill form scrollable up to 40vh; list scrollable 70vh

### DocumentsPage
- Expandable cards: click to reveal Original / Template / Output panels
- Each panel shows Preview link (eye icon) + status
- Actions per doc: Download DOCX, Save to Library, Reuse Template, Delete
- Auto-dedup: "Save to Library" checks source_doc_id first

### AdminPage Settings Tab
- Configurable: starting_credits, doc_cost_credits, upi_id, preview_watermark (toggle+text), similarity thresholds, max_upload_mb
- Backed by AppSettings DB table with DEFAULT_SETTINGS fallback

## Template Categories (V3)

Affidavit, Sale Deed, Agricultural Sale Deed, Court Documents, Agreements, Rental Agreements, GPA, Will, Gift Deed, Legal Notices, Certificates, Government Forms, Custom Templates
