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
- Step 2 "Fill & Generate" = panels + dynamic fill form (only approved placeholders, not fixed 25 fields)
- Step 3 "Download" = panels with output in right panel + download/save buttons
- `fillValues` state holds `{ PLACEHOLDER_KEY: value }` (uppercase) — generate endpoint accepts both uppercase and lowercase

## Variable detection engine (ocr_service.py)
- `detect_document_type()` — keyword-scoring, picks from 10 doc types
- `detect_placeholders()` — 3-pass: (1) regex for IDs/dates/amounts, (2) keyword anchors, (3) ALL_CAPS proper noun scan
- `_detect_all_caps_phrases()` — finds Indian legal name sequences in ALL CAPS, skips ~80 common excluded words
- `_extract_value_after_keyword()` — stops at age/date/address markers + strips leading "by/the/of/a"
- `rescan_for_missing()` — second pass ignoring already-tagged values
- No fixed field list; output is purely what was detected for that specific document

## Step 1 UI (UploadPage in App.tsx)
- `InteractiveDocText` component: native browser selection → popup → "Convert to Variable" → name input → adds placeholder
- Doc type badge with confidence score
- Approved variables section (green, with rename+remove)
- AI Suggestions section (checkboxes, not auto-approved items)
- "Scan Again" button → POST /rescan endpoint
- Manual add form (text + key input)
- Step 2 fill form uses `approvedPhs` array (dynamic), not FIELD_LABELS (fixed 25)
