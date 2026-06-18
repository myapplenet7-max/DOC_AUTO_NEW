from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from datetime import datetime


def _set_telugu_capable_font(doc: Document):
    style = doc.styles["Normal"]
    style.font.name = "Nirmala UI"
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    rfonts.set(qn("w:ascii"), "Nirmala UI")
    rfonts.set(qn("w:hAnsi"), "Nirmala UI")
    rfonts.set(qn("w:cs"), "Nirmala UI")


def generate_docx(fields: dict, output_path: str):
    doc = Document()
    _set_telugu_capable_font(doc)

    title = doc.add_heading("DOCUMENT RECORD", level=1)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph(f"Generated on: {datetime.now().strftime('%d-%m-%Y %H:%M')}")
    doc.add_paragraph("")

    doc.add_heading("Applicant Details", level=2)
    _add_field_table(doc, {
        "Full Name":      fields.get("full_name", ""),
        "Father's Name":  fields.get("father_name", ""),
        "Date of Birth":  fields.get("date_of_birth", ""),
        "Aadhaar Number": fields.get("aadhar_number", ""),
        "PAN Number":     fields.get("pan_number", ""),
        "Mobile":         fields.get("mobile", ""),
        "Email":          fields.get("email", ""),
        "Pincode":        fields.get("pincode", ""),
    })

    if fields.get("survey_number") or fields.get("sale_amount") or fields.get("village"):
        doc.add_paragraph("")
        doc.add_heading("Property Details", level=2)
        _add_field_table(doc, {
            "Survey Number":     fields.get("survey_number", ""),
            "Village":           fields.get("village", ""),
            "Sale Amount (₹)":   fields.get("sale_amount", ""),
            "Registration Date": fields.get("registration_date", ""),
        })

    if fields.get("address"):
        doc.add_paragraph("")
        doc.add_heading("Address", level=2)
        doc.add_paragraph(fields["address"])

    doc.add_paragraph("")
    doc.add_heading("Raw Extracted Text", level=3)
    p = doc.add_paragraph(fields.get("raw_text", ""))
    if p.runs:
        p.runs[0].font.size = Pt(8)

    doc.save(output_path)


def _add_field_table(doc: Document, data: dict):
    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    for label, value in data.items():
        if not value:
            continue
        row = table.add_row().cells
        row[0].text = label
        row[1].text = str(value)
        for para in row[0].paragraphs:
            for run in para.runs:
                run.bold = True
