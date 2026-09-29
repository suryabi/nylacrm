"""Thumbnail and PDF helpers for physical-sample design request logos."""

from __future__ import annotations

from datetime import datetime, timezone
from html import escape
import io
import os
import zipfile

from PIL import Image, ImageDraw, ImageFont, ImageOps
import pypdfium2 as pdfium
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image as RLImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from utils.storage import get_object


PREVIEW_SIZE = (720, 480)
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff")


def _font(size: int = 24):
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except Exception:
        return ImageFont.load_default()


def _placeholder(filename: str, message: str) -> Image.Image:
    canvas = Image.new("RGB", PREVIEW_SIZE, "white")
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((18, 18, PREVIEW_SIZE[0] - 18, PREVIEW_SIZE[1] - 18), 18, fill="#f8fafc", outline="#cbd5e1", width=3)
    ext = (os.path.splitext(filename or "")[1].lstrip(".") or "FILE").upper()[:8]
    draw.rounded_rectangle((52, 62, 190, 142), 12, fill="#064e3b")
    draw.text((121, 102), ext, anchor="mm", fill="white", font=_font(25))
    draw.text((52, 190), (filename or "Logo file")[:48], fill="#0f172a", font=_font(25))
    draw.text((52, 236), message, fill="#64748b", font=_font(20))
    return canvas


def _contain(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGBA")
    background = Image.new("RGBA", PREVIEW_SIZE, "white")
    fitted = ImageOps.contain(image, (PREVIEW_SIZE[0] - 48, PREVIEW_SIZE[1] - 48), Image.Resampling.LANCZOS)
    x = (PREVIEW_SIZE[0] - fitted.width) // 2
    y = (PREVIEW_SIZE[1] - fitted.height) // 2
    background.alpha_composite(fitted, (x, y))
    return background.convert("RGB")


def _open_pdf(data: bytes) -> Image.Image:
    pdf = pdfium.PdfDocument(data)
    try:
        if len(pdf) == 0:
            raise ValueError("PDF has no pages")
        page = pdf[0]
        try:
            return page.render(scale=2.0).to_pil()
        finally:
            page.close()
    finally:
        pdf.close()


def _open_zip(data: bytes) -> Image.Image | None:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = [n for n in archive.namelist() if not n.endswith("/") and not n.startswith("__MACOSX/")]
        names.sort(key=lambda n: (0 if n.lower().endswith(".pdf") else 1, n.lower()))
        for name in names:
            lower = name.lower()
            try:
                payload = archive.read(name)
                if lower.endswith(".pdf"):
                    return _open_pdf(payload)
                if lower.endswith(IMAGE_EXTENSIONS):
                    return Image.open(io.BytesIO(payload))
            except Exception:
                continue
    return None


def render_logo_thumbnail(data: bytes, filename: str, content_type: str | None = None) -> bytes:
    """Return a consistent PNG preview for images, PDFs, and ZIP logo packs."""
    lower = (filename or "").lower()
    ctype = (content_type or "").lower()
    try:
        if ctype == "application/pdf" or lower.endswith(".pdf"):
            image = _open_pdf(data)
        elif ctype in {"application/zip", "application/x-zip-compressed"} or lower.endswith(".zip"):
            image = _open_zip(data)
            if image is None:
                image = _placeholder(filename, "Logo pack · no previewable image")
        elif ctype.startswith("image/") or lower.endswith(IMAGE_EXTENSIONS):
            image = Image.open(io.BytesIO(data))
        else:
            image = _placeholder(filename, "Preview unavailable for this file type")
        canvas = _contain(image)
    except Exception:
        canvas = _placeholder(filename, "Preview could not be generated")
    out = io.BytesIO()
    canvas.save(out, format="PNG", optimize=True)
    return out.getvalue()


async def thumbnail_for_file(file_row: dict) -> bytes:
    data, detected_type = await get_object(file_row["path"])
    return render_logo_thumbnail(
        data,
        file_row.get("filename") or "logo",
        file_row.get("content_type") or detected_type,
    )


def _fitted_reportlab_image(png: bytes, max_width: float, max_height: float) -> RLImage:
    with Image.open(io.BytesIO(png)) as image:
        width, height = image.size
    scale = min(max_width / width, max_height / height)
    return RLImage(io.BytesIO(png), width=width * scale, height=height * scale)


async def build_physical_sample_logo_pdf(requests: list[dict], file_rows: dict[str, dict]) -> bytes:
    """Build a printable A4 logo list with one thumbnail per physical-sample request."""
    output = io.BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Physical Sample Logo Sheet",
        author="Nyla Air & Water CRM",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "LogoSheetTitle", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=18, leading=22, textColor=colors.HexColor("#111827"), alignment=TA_LEFT,
    )
    meta_style = ParagraphStyle(
        "LogoSheetMeta", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=8.5, leading=12, textColor=colors.HexColor("#64748b"),
    )
    name_style = ParagraphStyle(
        "LogoName", parent=styles["BodyText"], fontName="Helvetica-Bold",
        fontSize=11, leading=14, textColor=colors.HexColor("#0f172a"),
    )
    right_style = ParagraphStyle(
        "LogoRight", parent=meta_style, alignment=TA_RIGHT,
    )

    story = [
        Paragraph("Physical Sample Logo Sheet", title_style),
        Paragraph(
            f"{len(requests)} request{'s' if len(requests) != 1 else ''} · generated {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}",
            meta_style,
        ),
        Spacer(1, 5 * mm),
    ]

    table_data = [[
        Paragraph("LOGO", meta_style),
        Paragraph("CUSTOMER / FILE", meta_style),
        Paragraph("REQUEST", right_style),
    ]]
    for request in requests:
        logo = request.get("logo") or {}
        file_row = file_rows.get(logo.get("id"))
        if file_row:
            try:
                preview = await thumbnail_for_file(file_row)
            except Exception:
                preview = render_logo_thumbnail(b"", logo.get("filename") or "logo", None)
        else:
            preview = render_logo_thumbnail(b"", logo.get("filename") or "No logo", None)
        image = _fitted_reportlab_image(preview, 35 * mm, 23 * mm)
        customer = request.get("lead_company") or request.get("lead_name") or request.get("title") or "Unassigned customer"
        filename = logo.get("filename") or "No original logo attached"
        status = request.get("current_state_label") or request.get("current_state_key") or "—"
        due = request.get("requested_due_date") or "—"
        table_data.append([
            image,
            [Paragraph(escape(str(customer)), name_style), Spacer(1, 1.2 * mm), Paragraph(escape(str(filename)), meta_style)],
            [Paragraph(escape(str(request.get("request_number") or "—")), right_style), Spacer(1, 1.2 * mm), Paragraph(f"{escape(str(status))}<br/>Due {escape(str(due))}", right_style)],
        ])

    if not requests:
        table_data.append([
            "",
            Paragraph("No physical sample requests match the selected filters.", name_style),
            "",
        ])

    table = Table(table_data, colWidths=[43 * mm, 91 * mm, 46 * mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#475569")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#cbd5e1")),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, 0), 2.5 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2.5 * mm),
        ("TOPPADDING", (0, 1), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3 * mm),
    ]))
    story.append(table)
    document.build(story)
    return output.getvalue()