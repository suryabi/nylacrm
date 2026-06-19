"""
Branded Lead Proposal PDF generator.

Mirrors the Nyla "Daily Rituals" proposal template: branded header (logo +
address/contact/CIN) and right-edge accent bar on every page, a customer-specific
title and pricing table, and admin-editable boilerplate sections.

Static boilerplate is stored (and editable) in the `proposal_templates` collection
(one document per tenant). Only the customer name + pricing table merge per lead.
"""
import os
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, ListFlowable, ListItem,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from database import db  # master_skus are global

ASSETS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "proposal")

# ── Fonts (DejaVu supports the ₹ glyph; Helvetica does not) ──────────────────
FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
try:
    pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(ASSETS, "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", os.path.join(ASSETS, "DejaVuSans-Bold.ttf")))
    FONT, FONT_BOLD = "DejaVu", "DejaVu-Bold"
except Exception:
    pass

ACCENT = colors.HexColor("#00AEEF")
OFFER_RED = colors.HexColor("#EA2C1F")
DARK = colors.HexColor("#0f172a")
GREY = colors.HexColor("#64748b")


def _rs(v):
    try:
        f = float(v)
        return f"₹{int(f) if f == int(f) else round(f, 2):,}" if FONT == "DejaVu" else f"Rs. {round(f, 2):,}"
    except Exception:
        return "-"


# ── Default (seed) template ──────────────────────────────────────────────────
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
    },
    "title_template": "Nyla Air Water Proposal For {company}",
    "intro_paragraph": (
        "Nyla gently transforms pure air into exceptionally smooth, beautifully balanced "
        "water — where thoughtful innovation meets quiet, responsible luxury. Poured with "
        "care, Nyla elevates everyday hydration into a refined and sustainable experience. "
        "Nyla: The essential amenity that ensures guests leave better than they arrived."
    ),
    "pricing_heading": "Commercial Proposal & Pricing",
    "pricing_disclaimer": "GST 5% extra. Logistics charges apply outside primary service cities, if applicable.",
    "reverse_logistics_heading": "Reverse Logistics (Fully Managed by Nyla)",
    "reverse_logistics_items": [
        "Bottles supplied in custom reusable crates",
        "Empties collected during each delivery cycle",
        "Credits applied in subsequent invoice",
        "Damaged or missing-closure bottles not eligible for credit",
        "Circular glass system ensuring sustainability, accountability, and inventory efficiency",
    ],
    "commercial_terms_heading": "Commercial Terms",
    "commercial_terms_items": [
        "Lead Time: 2 working days from order confirmation",
        "Suggested Minimum Order: 20 crates per call-off",
        "Billing Cycle: Weekly / Fortnightly / Monthly",
        "Payment Terms: NET 15 days Credit.",
        "Pricing Confidentiality: Exclusive",
    ],
    "category_placement_heading": "Category Placement",
    "category_placement_intro": "Nyla must be listed under one of the following sections:",
    "category_placement_allowed": ["Curated Waters", "Premium Waters", "Artisanal Waters", "Signature Hydration"],
    "category_placement_not_allowed": ["Packaged Drinking Water", "Mineral Water (Generic Section)", "Regular Water"],
    "listing_format_heading": "Listing format for Nyla in the beverage menu",
    "listing_format_items": [
        "Nyla – 8.5 pH Alkaline | Crafted from Air",
        "Purified from air and precisely mineral-balanced",
        "Nyla – pH Balanced | Crafted from Air",
        "Purified from air and carefully mineral-balanced",
    ],
    "brand_onboarding_heading": "Brand Onboarding & Experience Support",
    "brand_onboarding_intro": "As part of our partnership model, Nyla supports seamless brand integration through:",
    "brand_onboarding_items": [
        "Staff onboarding & product education sessions",
        "Talking points for service teams",
        "Menu placement advisory",
        "Premium POS support for table and display visibility",
    ],
    "show_product_image": True,
}


async def get_or_seed_template(tdb) -> dict:
    """Return the tenant's editable proposal template, seeding defaults if absent."""
    existing = await tdb.proposal_templates.find_one({}, {"_id": 0})
    if existing:
        merged = {**DEFAULT_TEMPLATE, **existing}
        merged["company"] = {**DEFAULT_TEMPLATE["company"], **(existing.get("company") or {})}
        return merged
    doc = {**DEFAULT_TEMPLATE, "created_at": datetime.now(timezone.utc).isoformat()}
    await tdb.proposal_templates.insert_one({**doc})
    return doc


async def build_pricing_rows(tdb, lead: dict) -> list:
    """Build pricing table rows from the lead's proposed SKUs, joined with the
    master SKU catalog for Standard Price / MRP / default return credit."""
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
        landing = None
        if offer is not None:
            landing = float(offer) - float(credit or 0)
        rows.append({
            "format": name,
            "standard": standard,
            "offer": offer,
            "credit": credit or 0,
            "landing": landing,
            "mrp": item.get("mrp") or ms.get("mrp"),
        })
    return rows


# ── Header / footer (drawn on every page) ────────────────────────────────────
def _draw_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    # Right-edge accent bar
    canvas.setFillColor(ACCENT)
    canvas.rect(w - 5 * mm, 0, 5 * mm, h, stroke=0, fill=1)

    tpl = doc._tpl
    company = tpl.get("company", {})

    # Logo top-left
    logo = os.path.join(ASSETS, "logo.png")
    if os.path.exists(logo):
        try:
            canvas.drawImage(logo, 16 * mm, h - 26 * mm, width=34 * mm, height=16 * mm,
                             preserveAspectRatio=True, mask="auto", anchor="sw")
        except Exception:
            pass

    # Address / contact / CIN top-right
    canvas.setFillColor(GREY)
    canvas.setFont(FONT, 8)
    y = h - 14 * mm
    right_x = w - 12 * mm
    lines = list(company.get("address_lines", [])) + [
        company.get("email", ""), company.get("website", ""), company.get("cin", ""),
    ]
    for ln in [l for l in lines if l]:
        canvas.drawRightString(right_x, y, ln)
        y -= 4.2 * mm

    # Footer page number
    canvas.setFillColor(GREY)
    canvas.setFont(FONT, 8)
    canvas.drawRightString(w - 12 * mm, 10 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def build_proposal_pdf(lead: dict, template: dict, pricing_rows: list) -> bytes:
    import io
    buf = io.BytesIO()

    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName=FONT, fontSize=10,
                          leading=14, textColor=DARK, spaceAfter=4)
    small = ParagraphStyle("small", parent=body, fontSize=8.5, textColor=GREY, leading=11)
    date_s = ParagraphStyle("date", parent=body, fontSize=10, textColor=GREY)
    title_s = ParagraphStyle("title", parent=styles["Heading1"], fontName=FONT_BOLD,
                             fontSize=19, leading=23, textColor=DARK, spaceAfter=8)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName=FONT_BOLD, fontSize=13.5,
                        leading=17, textColor=ACCENT, spaceBefore=10, spaceAfter=5)
    h3 = ParagraphStyle("h3", parent=styles["Heading3"], fontName=FONT_BOLD, fontSize=11,
                        leading=14, textColor=DARK, spaceBefore=8, spaceAfter=3)
    bullet = ParagraphStyle("bullet", parent=body, leftIndent=4, spaceAfter=2)

    def bullets(items):
        return ListFlowable(
            [ListItem(Paragraph(str(i), bullet), value="•", leftIndent=14) for i in items],
            bulletType="bullet", start="•", leftIndent=10,
        )

    company_name = lead.get("company") or "Prospect"
    title = (template.get("title_template") or "Proposal For {company}").format(company=company_name)

    story = []
    # Page 1
    story.append(Paragraph(datetime.now(timezone.utc).strftime("%d-%b-%Y").upper(), date_s))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(title, title_s))
    story.append(Paragraph(template.get("intro_paragraph", ""), body))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(template.get("pricing_heading", "Commercial Proposal & Pricing"), h2))

    # Pricing table
    head = ["Format", "Standard Pricing", "Offer Price", "Return Bottle Credit", "Landing Price after Credit"]
    data = [[Paragraph(f"<b>{c}</b>", ParagraphStyle("th", parent=small, textColor=colors.white)) for c in head]]
    if pricing_rows:
        for r in pricing_rows:
            offer_html = f'<font color="#EA2C1F"><b>{_rs(r["offer"])}</b></font>' if r["offer"] is not None else "-"
            std_html = (f'<strike>{_rs(r["standard"])}</strike>' if r["standard"] else "-")
            data.append([
                Paragraph(str(r["format"]), small),
                Paragraph(std_html, small),
                Paragraph(offer_html, small),
                Paragraph(_rs(r["credit"]) if r["credit"] else "-", small),
                Paragraph(_rs(r["landing"]) if r["landing"] is not None else "-", small),
            ])
    else:
        data.append([Paragraph("Add the proposed SKUs & pricing on the lead to populate this table.", small), "", "", "", ""])

    tbl = Table(data, colWidths=[58 * mm, 27 * mm, 25 * mm, 28 * mm, 30 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d0d5dd")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(template.get("pricing_disclaimer", ""), small))

    story.append(Paragraph(template.get("reverse_logistics_heading", "Reverse Logistics"), h3))
    story.append(bullets(template.get("reverse_logistics_items", [])))
    story.append(Paragraph(template.get("commercial_terms_heading", "Commercial Terms"), h3))
    story.append(bullets(template.get("commercial_terms_items", [])))

    story.append(Paragraph(template.get("category_placement_heading", "Category Placement"), h3))
    if template.get("category_placement_intro"):
        story.append(Paragraph(template["category_placement_intro"], body))
    allowed = template.get("category_placement_allowed", [])
    not_allowed = template.get("category_placement_not_allowed", [])
    if allowed:
        story.append(Paragraph(" | ".join(allowed), ParagraphStyle("ok", parent=body, textColor=colors.HexColor("#166534"))))
    if not_allowed:
        story.append(Paragraph("It must NOT be listed under: " + " | ".join(not_allowed),
                               ParagraphStyle("no", parent=body, textColor=OFFER_RED)))

    # Page 2
    story.append(PageBreak())
    story.append(Paragraph(template.get("listing_format_heading", "Listing format"), h2))
    story.append(bullets(template.get("listing_format_items", [])))
    story.append(Paragraph(template.get("brand_onboarding_heading", "Brand Onboarding & Experience Support"), h2))
    if template.get("brand_onboarding_intro"):
        story.append(Paragraph(template["brand_onboarding_intro"], body))
    story.append(bullets(template.get("brand_onboarding_items", [])))

    if template.get("show_product_image", True):
        prod = os.path.join(ASSETS, "products.png")
        if os.path.exists(prod):
            story.append(Spacer(1, 6 * mm))
            try:
                story.append(Image(prod, width=120 * mm, height=102 * mm, kind="proportional", hAlign="CENTER"))
            except Exception:
                pass

    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm, topMargin=30 * mm, bottomMargin=16 * mm,
        title=f"Proposal — {company_name}",
    )
    doc._tpl = template
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width - 3 * mm, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="branded", frames=[frame], onPage=_draw_page)])
    doc.build(story)
    buf.seek(0)
    return buf.read()
