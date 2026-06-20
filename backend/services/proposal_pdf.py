"""
Branded Lead Proposal PDF generator (v2 — dynamic sections).

The proposal template is a flexible, admin-editable document:
  - company header (address/contact/CIN + uploaded logo)
  - title (text template + font + size)
  - an ordered list of `sections`, each with its own heading text, heading
    font/size and body font/size. Section types: paragraph, list, category,
    pricing_table (auto-filled from the lead), image.

Only the customer name + pricing table merge per lead. Stored in the
`proposal_templates` collection (one document per tenant).
"""
import os
import io
import base64
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, ListFlowable, ListItem,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from database import db  # master_skus are global

ASSETS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "proposal")

# ── Fonts ────────────────────────────────────────────────────────────────────
_DEJAVU_OK = False
try:
    pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(ASSETS, "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", os.path.join(ASSETS, "DejaVuSans-Bold.ttf")))
    _DEJAVU_OK = True
except Exception:
    pass

# Font key -> (regular, bold). 'dejavu' supports the ₹ glyph.
FONTS = {
    "helvetica": ("Helvetica", "Helvetica-Bold"),
    "times": ("Times-Roman", "Times-Bold"),
    "courier": ("Courier", "Courier-Bold"),
    "dejavu": ("DejaVu", "DejaVu-Bold") if _DEJAVU_OK else ("Helvetica", "Helvetica-Bold"),
}
_MONEY_FONT = "DejaVu" if _DEJAVU_OK else "Helvetica"


def _font(key, bold=False):
    pair = FONTS.get(key or "dejavu", FONTS["dejavu"])
    return pair[1] if bold else pair[0]


ACCENT = colors.HexColor("#00AEEF")
OFFER_RED = colors.HexColor("#EA2C1F")
DARK = colors.HexColor("#0f172a")
GREY = colors.HexColor("#64748b")


def _rs(v):
    try:
        f = float(v)
        n = int(f) if f == int(f) else round(f, 2)
        return f"₹{n:,}" if _DEJAVU_OK else f"Rs. {n:,}"
    except Exception:
        return "-"


# ── Default template (v2) ────────────────────────────────────────────────────
def _sec(id, type, heading="", **kw):
    base = {
        "id": id, "type": type, "heading": heading,
        "heading_font": "dejavu", "heading_size": 13,
        "body_font": "dejavu", "body_size": 10,
        "page_break_before": False,
    }
    base.update(kw)
    return base


DEFAULT_TEMPLATE = {
    "company": {
        "address_lines": [
            "Sri Lakshmi Towers, Plot No# 78, 3rd Floor",
            "CBI Colony, Kavuri Hills, Madhapur,",
            "Telangana 500033",
        ],
        "email": "Contactus@nylalife.com",
        "website": "www.nylaairwater.earth",
        "cin": "CIN: U41000TG2022PTC159206",
        "logo_data": None,
        "logo_content_type": None,
    },
    "title": {
        "text_template": "Nyla Air Water Proposal For {company}",
        "font": "dejavu", "size": 19,
    },
    "sections": [
        _sec("intro", "paragraph", "",
             content=("Nyla gently transforms pure air into exceptionally smooth, beautifully balanced "
                      "water — where thoughtful innovation meets quiet, responsible luxury. Poured with "
                      "care, Nyla elevates everyday hydration into a refined and sustainable experience. "
                      "Nyla: The essential amenity that ensures guests leave better than they arrived.")),
        _sec("pricing", "pricing_table", "Commercial Proposal & Pricing", body_size=9,
             disclaimer="GST 5% extra. Logistics charges apply outside primary service cities, if applicable."),
        _sec("reverse_logistics", "list", "Reverse Logistics (Fully Managed by Nyla)", heading_size=11,
             items=[
                 "Bottles supplied in custom reusable crates",
                 "Empties collected during each delivery cycle",
                 "Credits applied in subsequent invoice",
                 "Damaged or missing-closure bottles not eligible for credit",
                 "Circular glass system ensuring sustainability, accountability, and inventory efficiency",
             ]),
        _sec("commercial_terms", "list", "Commercial Terms", heading_size=11,
             items=[
                 "Lead Time: 2 working days from order confirmation",
                 "Suggested Minimum Order: 20 crates per call-off",
                 "Billing Cycle: Weekly / Fortnightly / Monthly",
                 "Payment Terms: NET 15 days Credit.",
                 "Pricing Confidentiality: Exclusive",
             ]),
        _sec("category", "category", "Category Placement", heading_size=11,
             intro="Nyla must be listed under one of the following sections:",
             allowed=["Curated Waters", "Premium Waters", "Artisanal Waters", "Signature Hydration"],
             not_allowed=["Packaged Drinking Water", "Mineral Water (Generic Section)", "Regular Water"]),
        _sec("listing_format", "list", "Listing format for Nyla in the beverage menu",
             page_break_before=True,
             items=[
                 "Nyla – 8.5 pH Alkaline | Crafted from Air",
                 "Purified from air and precisely mineral-balanced",
                 "Nyla – pH Balanced | Crafted from Air",
                 "Purified from air and carefully mineral-balanced",
             ]),
        _sec("brand_onboarding", "list", "Brand Onboarding & Experience Support",
             intro="As part of our partnership model, Nyla supports seamless brand integration through:",
             items=[
                 "Staff onboarding & product education sessions",
                 "Talking points for service teams",
                 "Menu placement advisory",
                 "Premium POS support for table and display visibility",
             ]),
        _sec("product_image", "image", ""),
    ],
}


def _migrate_legacy(tpl: dict) -> dict:
    """Convert a v1 (flat-key) template into the v2 sections model, preserving edits."""
    out = {
        "company": {**DEFAULT_TEMPLATE["company"], **(tpl.get("company") or {})},
        "title": {
            "text_template": tpl.get("title_template") or DEFAULT_TEMPLATE["title"]["text_template"],
            "font": "dejavu", "size": 19,
        },
        "sections": [],
    }
    s = out["sections"]
    s.append(_sec("intro", "paragraph", "", content=tpl.get("intro_paragraph", DEFAULT_TEMPLATE["sections"][0]["content"])))
    s.append(_sec("pricing", "pricing_table", tpl.get("pricing_heading", "Commercial Proposal & Pricing"),
                  body_size=9, disclaimer=tpl.get("pricing_disclaimer", "")))
    s.append(_sec("reverse_logistics", "list", tpl.get("reverse_logistics_heading", "Reverse Logistics"),
                  heading_size=11, items=tpl.get("reverse_logistics_items", [])))
    s.append(_sec("commercial_terms", "list", tpl.get("commercial_terms_heading", "Commercial Terms"),
                  heading_size=11, items=tpl.get("commercial_terms_items", [])))
    s.append(_sec("category", "category", tpl.get("category_placement_heading", "Category Placement"),
                  heading_size=11, intro=tpl.get("category_placement_intro", ""),
                  allowed=tpl.get("category_placement_allowed", []),
                  not_allowed=tpl.get("category_placement_not_allowed", [])))
    s.append(_sec("listing_format", "list", tpl.get("listing_format_heading", "Listing format"),
                  page_break_before=True, items=tpl.get("listing_format_items", [])))
    s.append(_sec("brand_onboarding", "list", tpl.get("brand_onboarding_heading", "Brand Onboarding & Experience Support"),
                  intro=tpl.get("brand_onboarding_intro", ""), items=tpl.get("brand_onboarding_items", [])))
    if tpl.get("show_product_image", True):
        s.append(_sec("product_image", "image", ""))
    return out


def _normalize(tpl: dict) -> dict:
    if not tpl.get("sections"):
        tpl = _migrate_legacy(tpl)
    tpl["company"] = {**DEFAULT_TEMPLATE["company"], **(tpl.get("company") or {})}
    tpl["title"] = {**DEFAULT_TEMPLATE["title"], **(tpl.get("title") or {})}
    norm = []
    for sec in tpl.get("sections", []):
        base = _sec(sec.get("id") or "sec", sec.get("type") or "paragraph")
        base.update(sec)
        norm.append(base)
    tpl["sections"] = norm
    return tpl


async def get_or_seed_template(tdb) -> dict:
    existing = await tdb.proposal_templates.find_one({}, {"_id": 0})
    if existing:
        return _normalize(existing)
    doc = {k: v for k, v in DEFAULT_TEMPLATE.items()}
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await tdb.proposal_templates.insert_one({**doc})
    return _normalize(doc)


async def build_pricing_rows(tdb, lead: dict) -> list:
    pricing = lead.get("proposed_sku_pricing") or []
    masters = await db.master_skus.find({}, {"_id": 0}).to_list(1000)
    by_id, by_name = {}, {}
    for m in masters:
        if m.get("id"):
            by_id[m["id"]] = m
        nm = (m.get("sku_name") or m.get("name") or "").strip().lower()
        if nm:
            by_name[nm] = m
    rows = []
    for item in pricing:
        name = item.get("sku") or item.get("sku_name")
        if not name:
            continue
        ms = by_id.get(item.get("sku_id")) or by_name.get(name.strip().lower()) or {}
        standard = item.get("standard_price") or ms.get("standard_price")
        offer = item.get("price_per_unit") or item.get("proposed_price")
        credit = item.get("return_bottle_credit")
        if credit is None:
            credit = ms.get("return_bottle_credit") or 0
        landing = float(offer) - float(credit or 0) if offer is not None else None
        rows.append({"format": name, "standard": standard, "offer": offer,
                     "credit": credit or 0, "landing": landing, "mrp": item.get("mrp") or ms.get("mrp")})
    return rows


# ── Header / footer ──────────────────────────────────────────────────────────
def _draw_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(ACCENT)
    canvas.rect(w - 5 * mm, 0, 5 * mm, h, stroke=0, fill=1)

    company = doc._tpl.get("company", {})
    drawn = False
    logo_b64 = company.get("logo_data")
    if logo_b64:
        try:
            img = ImageReader(io.BytesIO(base64.b64decode(logo_b64)))
            canvas.drawImage(img, 16 * mm, h - 28 * mm, width=38 * mm, height=18 * mm,
                             preserveAspectRatio=True, mask="auto", anchor="sw")
            drawn = True
        except Exception:
            drawn = False
    if not drawn:
        logo = os.path.join(ASSETS, "logo.png")
        if os.path.exists(logo):
            try:
                canvas.drawImage(logo, 16 * mm, h - 26 * mm, width=34 * mm, height=16 * mm,
                                 preserveAspectRatio=True, mask="auto", anchor="sw")
            except Exception:
                pass

    canvas.setFillColor(GREY)
    canvas.setFont(_MONEY_FONT, 8)
    y = h - 14 * mm
    right_x = w - 12 * mm
    lines = list(company.get("address_lines", [])) + [company.get("email", ""), company.get("website", ""), company.get("cin", "")]
    for ln in [l for l in lines if l]:
        canvas.drawRightString(right_x, y, ln)
        y -= 4.2 * mm

    canvas.setFont(_MONEY_FONT, 8)
    canvas.drawRightString(w - 12 * mm, 10 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def build_proposal_pdf(lead: dict, template: dict, pricing_rows: list) -> bytes:
    template = _normalize(template)
    buf = io.BytesIO()
    styles = getSampleStyleSheet()

    def body_style(sec):
        return ParagraphStyle(f"b_{sec['id']}", parent=styles["BodyText"],
                              fontName=_font(sec.get("body_font"), False),
                              fontSize=sec.get("body_size", 10),
                              leading=sec.get("body_size", 10) + 4, textColor=DARK, spaceAfter=4)

    def heading_style(sec):
        return ParagraphStyle(f"h_{sec['id']}", parent=styles["Heading2"],
                              fontName=_font(sec.get("heading_font"), True),
                              fontSize=sec.get("heading_size", 13),
                              leading=sec.get("heading_size", 13) + 4,
                              textColor=ACCENT, spaceBefore=10, spaceAfter=5)

    small = ParagraphStyle("small", parent=styles["BodyText"], fontName=_MONEY_FONT, fontSize=8.5,
                           textColor=GREY, leading=11)
    date_s = ParagraphStyle("date", parent=styles["BodyText"], fontName=_MONEY_FONT, fontSize=10, textColor=GREY)

    company_name = lead.get("company") or "Prospect"
    title_cfg = template.get("title", {})
    title_s = ParagraphStyle("title", parent=styles["Heading1"],
                             fontName=_font(title_cfg.get("font"), True),
                             fontSize=title_cfg.get("size", 19),
                             leading=title_cfg.get("size", 19) + 4, textColor=DARK, spaceAfter=8)
    title = (title_cfg.get("text_template") or "Proposal For {company}").format(company=company_name)

    story = [Paragraph(datetime.now(timezone.utc).strftime("%d-%b-%Y").upper(), date_s),
             Spacer(1, 2 * mm), Paragraph(title, title_s), Spacer(1, 1 * mm)]

    def bullets(items, bstyle):
        bs = ParagraphStyle(f"bl_{id(items)}", parent=bstyle, leftIndent=4, spaceAfter=2)
        return ListFlowable([ListItem(Paragraph(str(i), bs), value="•", leftIndent=14) for i in items],
                            bulletType="bullet", start="•", leftIndent=10)

    for sec in template["sections"]:
        if sec.get("page_break_before"):
            story.append(PageBreak())
        bstyle = body_style(sec)
        if sec.get("heading"):
            story.append(Paragraph(sec["heading"], heading_style(sec)))

        t = sec.get("type")
        if t == "paragraph":
            if sec.get("content"):
                story.append(Paragraph(sec["content"], bstyle))
        elif t == "list":
            if sec.get("intro"):
                story.append(Paragraph(sec["intro"], bstyle))
            story.append(bullets(sec.get("items", []), bstyle))
        elif t == "category":
            if sec.get("intro"):
                story.append(Paragraph(sec["intro"], bstyle))
            if sec.get("allowed"):
                story.append(Paragraph(" | ".join(sec["allowed"]),
                                       ParagraphStyle("ok", parent=bstyle, textColor=colors.HexColor("#166534"))))
            if sec.get("not_allowed"):
                story.append(Paragraph("It must NOT be listed under: " + " | ".join(sec["not_allowed"]),
                                       ParagraphStyle("no", parent=bstyle, textColor=OFFER_RED)))
        elif t == "pricing_table":
            head = ["Format", "Standard Pricing", "Offer Price", "Return Bottle Credit", "Landing Price after Credit"]
            cell = ParagraphStyle("pcell", parent=bstyle, fontName=_MONEY_FONT, fontSize=sec.get("body_size", 9), leading=11)
            data = [[Paragraph(f"<b>{c}</b>", ParagraphStyle("th", parent=cell, textColor=colors.white)) for c in head]]
            if pricing_rows:
                for r in pricing_rows:
                    offer_html = f'<font color="#EA2C1F"><b>{_rs(r["offer"])}</b></font>' if r["offer"] is not None else "-"
                    std_html = f'<strike>{_rs(r["standard"])}</strike>' if r["standard"] else "-"
                    data.append([
                        Paragraph(str(r["format"]), cell),
                        Paragraph(std_html, cell),
                        Paragraph(offer_html, cell),
                        Paragraph(_rs(r["credit"]) if r["credit"] else "-", cell),
                        Paragraph(_rs(r["landing"]) if r["landing"] is not None else "-", cell),
                    ])
            else:
                data.append([Paragraph("Add the proposed SKUs & pricing on the lead to populate this table.", cell), "", "", "", ""])
            tbl = Table(data, colWidths=[58 * mm, 27 * mm, 25 * mm, 28 * mm, 30 * mm], repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d0d5dd")),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(tbl)
            if sec.get("disclaimer"):
                story.append(Spacer(1, 2 * mm))
                story.append(Paragraph(sec["disclaimer"], small))
        elif t == "image":
            src = None
            if sec.get("image_data"):
                try:
                    src = ImageReader(io.BytesIO(base64.b64decode(sec["image_data"])))
                except Exception:
                    src = None
            if src is None:
                prod = os.path.join(ASSETS, "products.png")
                src = prod if os.path.exists(prod) else None
            if src is not None:
                story.append(Spacer(1, 6 * mm))
                try:
                    story.append(Image(src, width=120 * mm, height=102 * mm, kind="proportional", hAlign="CENTER"))
                except Exception:
                    pass

    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
                          topMargin=30 * mm, bottomMargin=16 * mm, title=f"Proposal — {company_name}")
    doc._tpl = template
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width - 3 * mm, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="branded", frames=[frame], onPage=_draw_page)])
    doc.build(story)
    buf.seek(0)
    return buf.read()
