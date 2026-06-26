# Replit Prompt: TC Letter Generator (DocAuto-style)

## Project Overview
Build a web app called **TC DocAuto** that:
1. Accepts an uploaded Excel file (`master_data.xlsx`) with student records
2. Lets the user pick a student from the list
3. Auto-fills a TC Request Letter template with `{{PLACEHOLDER}}` values
4. Generates and downloads a `.docx` file

---

## Tech Stack
- **Frontend**: React (Vite) with Tailwind CSS
- **Backend**: Node.js + Express
- **Libraries**: `docx` (Word generation), `xlsx` (Excel parsing), `file-saver` (download)

---

## Excel File Structure (`master_data.xlsx`)

The Excel must have these column headers (row 1):

| Column Header | Example Value | Placeholder in Template |
|---|---|---|
| STUDENT_NAME | Chittiboina Kiran Kalyan | `{{STUDENT_NAME}}` |
| STUDENT_NAME_TE | చిట్టిబోయిన కిరణ్ కళ్యాణ్ | `{{STUDENT_NAME_TE}}` |
| DOB | 30/06/2012 | `{{DOB}}` |
| CLASS | VIII | `{{CLASS}}` |
| STUDENT_PEN | 20587719974 | `{{STUDENT_PEN}}` |
| PARENT_NAME | Chittiboina Venkata Ratnamma | `{{PARENT_NAME}}` |
| PARENT_NAME_TE | చిట్టిబోయిన వెంకట రత్నమ్మ | `{{PARENT_NAME_TE}}` |
| MOBILE_NUMBER | 9676804075 | `{{MOBILE_NUMBER}}` |
| ADDRESS | 16/64, Patha Palem, S.Mydukur Mandal, YSR Kadapa District, AP - 516172 | `{{ADDRESS}}` |
| ADDRESS_TE | 16/64, పాతపాలెం, ఎస్.మైదుకూరు మండలం, వైఎస్సార్ కడప జిల్లా, ఆంధ్రప్రదేశ్ - 516172 | `{{ADDRESS_TE}}` |
| SCHOOL_LOCATION | S.Mydukur | `{{SCHOOL_LOCATION}}` |
| MANDAL | S.Mydukur | `{{MANDAL}}` |
| DISTRICT | YSR Kadapa | `{{DISTRICT}}` |
| DATE | (leave blank — auto-filled today) | `{{DATE}}` |

---

## App Features

### Page 1: Upload & Select
- Upload `.xlsx` button
- After upload: show a table of students parsed from Excel
- Each row has a **"Generate TC"** button
- Show student name, class, PEN number in the table

### Page 2: Live Preview + Generate
- After clicking "Generate TC" for a student:
  - Show filled letter preview (all `{{PLACEHOLDERS}}` replaced with green-highlighted values)
  - Show 3 letter sections: Telugu Parent Letter | English Parent Letter | Student Letter
  - "Generate DOCX" button at bottom → downloads the filled `.docx`

### DOCX Output
- 3 letters in one file, each on a new page:
  1. Telugu parent letter (uses `_TE` fields for name/address)
  2. English parent letter
  3. English student letter (signed by student)
- `{{DATE}}` auto-filled with today's date in DD/MM/YYYY format
- `{{STUDENT_PEN}}` shown as `_______________` if empty in Excel

---

## Template Content (3 Letters)

### Letter 1: Telugu Parent Letter
```
కు,
ప్రధానోపాధ్యాయులు గారికి,
జిల్లా పరిషత్ ఉన్నత పాఠశాల (ZPHS), {{SCHOOL_LOCATION}}
మండలం: {{MANDAL}}, జిల్లా: {{DISTRICT}}, ఆంధ్రప్రదేశ్

విషయం: నా కుమారుడు {{STUDENT_NAME_TE}} కోసం ట్రాన్స్‌ఫర్ సర్టిఫికెట్ (TC) జారీ చేయవలసిందిగా అభ్యర్థన.

మహోదయులు గారికి,
నేను {{PARENT_NAME_TE}}, మీ పాఠశాలలో {{CLASS}} చదువుతున్న నా కుమారుడు {{STUDENT_NAME_TE}}
(పుట్టిన తేదీ: {{DOB}}, Student PEN: {{STUDENT_PEN}}) కోసం ఈ లేఖను వినయపూర్వకంగా సమర్పిస్తున్నాను.

మా నివాసం: {{ADDRESS_TE}}

వ్యక్తిగత కారణాల వల్ల మా కుటుంబం వేరే ప్రాంతానికి మారవలసి వచ్చినందున, నా కుమారుడు
ఈ పాఠశాలలో చదువును కొనసాగించలేకపోతున్నాడు.

కావున అతనికి అవసరమైన ట్రాన్స్‌ఫర్ సర్టిఫికెట్ (TC) ను దయచేసి జారీ చేయవలసిందిగా మనవి చేస్తున్నాను.

మీ పాఠశాలలో అందిన విద్యా సహకారం మరియు మార్గనిర్దేశానికి హృదయపూర్వక కృతజ్ఞతలు తెలియజేస్తున్నాను.

ధన్యవాదాలు.

ఇట్లు,
మీ విధేయురాలు,

(సంతకం) _______________________
{{PARENT_NAME_TE}}
మొబైల్: {{MOBILE_NUMBER}}
తేదీ: {{DATE}}
```

### Letter 2: English Parent Letter
```
To,
The Head Master,
ZPHS (Zilla Parishad High School), {{SCHOOL_LOCATION}}
Mandal: {{MANDAL}}, District: {{DISTRICT}}, Andhra Pradesh

Subject: Request for issuance of Transfer Certificate (TC) for my son {{STUDENT_NAME}}.

Respected Sir/Madam,
I, {{PARENT_NAME}}, am writing this letter to kindly request a Transfer Certificate (TC) for my son
{{STUDENT_NAME}} (Date of Birth: {{DOB}}, Student PEN: {{STUDENT_PEN}}), currently studying in
{{CLASS}} in your school.

Our address: {{ADDRESS}}

Due to personal family reasons, we are relocating to another place, and therefore my son is unable
to continue his studies in your school.

I kindly request you to issue his Transfer Certificate (TC) at the earliest.

I sincerely thank the school management and teachers for the education and support provided to my son.

Kindly do the needful.

Thank you.

Yours faithfully,

(Signature) _______________________
{{PARENT_NAME}}
Mobile: {{MOBILE_NUMBER}}
Date: {{DATE}}
```

### Letter 3: English Student Letter
```
To,
The Head Master,
ZPHS (Zilla Parishad High School), {{SCHOOL_LOCATION}}
Mandal: {{MANDAL}}, District: {{DISTRICT}}, Andhra Pradesh

Subject: Request for Transfer Certificate (TC).

Respected Sir/Madam,
I am {{STUDENT_NAME}}, Date of Birth {{DOB}}, a student of {{CLASS}} in your school
(Student PEN: {{STUDENT_PEN}}).

I am residing at {{ADDRESS}}.

Due to personal family relocation, I am unable to continue my studies in your school.

I kindly request you to issue my Transfer Certificate (TC) at the earliest.

I sincerely thank all the teachers and school management for their guidance and support.

Kindly consider my request and do the needful.

Thank you.

Yours faithfully,

(Signature) _______________________
{{STUDENT_NAME}}
Class: {{CLASS}}
Date: {{DATE}}
```

---

## UI Design
- Purple/teal color theme (like DocAuto in the screenshots)
- Mobile-first (works on 380px mobile screens)
- Live preview: filled values shown with **green background highlight** (like DocAuto)
- Empty/unfilled placeholders shown with **red underline**
- Sticky "Generate DOCX" button at bottom

---

## Folder Structure
```
/
├── client/          (React + Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── UploadStep.jsx
│   │   │   ├── StudentTable.jsx
│   │   │   ├── LivePreview.jsx
│   │   │   └── GenerateButton.jsx
│   │   └── utils/
│   │       ├── excelParser.js   (uses xlsx library)
│   │       └── docxGenerator.js (uses docx library)
├── server/          (Express — optional, can be client-only)
└── package.json
```

---

## Key Implementation Notes
1. Use `xlsx` npm package to parse the uploaded Excel file in the browser (no server needed)
2. Use `docx` npm package to generate the Word file client-side
3. Use `file-saver` to trigger download
4. Telugu text needs UTF-8 support — `docx` handles this fine
5. `{{STUDENT_PEN}}` → if blank in Excel, output `_______________` in the letter
6. `{{DATE}}` → always auto-fill with `new Date().toLocaleDateString('en-IN')` (DD/MM/YYYY)
