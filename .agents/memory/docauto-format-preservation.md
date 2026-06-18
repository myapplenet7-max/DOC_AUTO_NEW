---
name: DocAuto Format Preservation
description: Format-preserving DOCX processing, preview endpoints, and three-panel comparison UI
---

## Core principle
For DOCX inputs: clone original file, replace text **in-place** using python-docx run-level replacement, preserving ALL formatting. Never generate a new DOCX from scratch for DOCX sources.

## How it works
1. `services/format_service.py` — `create_template_from_docx()` copies original DOCX, replaces detected values with `{{TOKEN}}` in-place. `fill_template_docx()` copies template DOCX, replaces tokens with values. Both preserve fonts, tables, headers, footers, images, margins.
2. Cross-run text replacement: if old text spans multiple runs, merges affected runs into first run (preserves first run's format).
3. `mammoth` library converts DOCX→HTML for browser preview. pdftoppm (poppler) converts PDF→PNG images for preview.

**Why:** The old approach generated a brand-new generic DOCX from scratch — losing all Telugu/legal document formatting. Format preservation requires working in-place on the original file.

## Database
- `Document.template_path` column stores path to format-preserved template DOCX (added via `ALTER TABLE documents ADD COLUMN IF NOT EXISTS template_path VARCHAR`).

## Preview endpoints (all need `?token=` query param for auth)
- `GET /api/documents/{id}/preview-original` → HTML of original doc
- `GET /api/documents/{id}/preview-template` → HTML with `{{PLACEHOLDERS}}` highlighted in blue
- `GET /api/documents/{id}/preview-output` → HTML of filled output

## Frontend (ComparisonPanel in App.tsx)
- Desktop: 3 columns side-by-side at 64vh height, each with header bar and iframe
- Mobile: tab switcher (Original / Template / Fill Form or Output)
- Step 2 "Compare & Fill" = panels + fill form in right panel
- Step 3 "Download" = panels with output in right panel + download/save buttons
