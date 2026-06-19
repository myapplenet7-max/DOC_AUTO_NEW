---
name: DocAuto Resume Module
description: Resume builder implementation details — models, service, router, frontend, and python-docx quirks.
---

## Resume Module Architecture

- **Model**: `backend/models.py` — `Resume` table (id, user_id, resume_type, version_name, data_json, output_path, preview_path, credits_used, status, timestamps)
- **Schemas**: `backend/schemas.py` — ResumeCreate, ResumeUpdate, ResumeOut
- **Service**: `backend/services/resume_service.py` — generates DOCX using python-docx for 3 types
- **Router**: `backend/routers/resumes.py` — full CRUD + POST /preview + POST /download + GET file-serve endpoints
- **Admin endpoints**: in `backend/routers/admin.py` — GET /api/admin/resumes, GET /api/admin/resumes/{id}/download-file
- **Frontend**: `ResumePage` component in `artifacts/docauto/src/App.tsx` — list→typeSelect→edit (multi-step)→preview/download flow

## Resume Types

| Type       | Layout Focus |
|------------|-------------|
| fresher    | Education-first, projects, skills. Accent: indigo |
| experienced | Work history, achievements, certifications. Accent: emerald |
| creative   | Bold header, portfolio, skills as tags. Accent: violet |

## Credit Logic

- **Preview**: Always free — generates watermarked DOCX with red warning banner at top/bottom
- **Download**: Deducts `resume_cost_credits` from settings (default 1) — transactional (credits rolled back if generation fails). Admin role: 0 credits.

## python-docx RGBColor Quirk

**Why:** `RGBColor` in python-docx is a `tuple` subclass (not `int`), so `int(accent)` fails.

**How to apply:** When formatting hex for OOXML XML attributes, use `str(accent)` — it returns uppercase hex like `"1A56DB"`.

```python
# WRONG:
"%06X" % int(accent)    # TypeError: int() arg must be string/bytes/number, not 'RGBColor'
accent.red              # AttributeError: 'RGBColor' has no attribute 'red'

# CORRECT:
str(accent)             # "1A56DB" — works as OOXML color attribute
accent[0], accent[1], accent[2]   # red, green, blue components as ints
```

## Data JSON Format (stored in data_json column)

```json
{
  "type": "fresher|experienced|creative",
  "personal": {"name": "", "phone": "", "email": "", "location": "", "linkedin": "", "portfolio": ""},
  "summary": "...",
  "education": [{"institution": "", "degree": "", "field": "", "year": "", "grade": ""}],
  "experience": [{"company": "", "title": "", "start": "", "end": "", "current": false, "description": ""}],
  "skills": ["skill1", "skill2"],
  "certifications": [{"name": "", "issuer": "", "year": ""}],
  "projects": [{"name": "", "description": "", "tech": "", "url": ""}],
  "achievements": ["achievement1"]
}
```

## Admin Panel Tabs (AdminPage.tsx)

Complete rewrite — now has 6 tabs:
1. 💳 Payments — approve/reject pending payments (existing)
2. 👥 Users — list users, adjust credits (existing)
3. 📄 Documents — all documents across all users with download
4. 📚 Templates — all templates across all users with delete
5. 📝 Resumes — all resumes across all users with download
6. ⚙️ Settings — configurable platform settings (existing)
