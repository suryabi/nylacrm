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
import re
import base64
from datetime import datetime, timezone

from bs4 import BeautifulSoup, NavigableString

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
    pdfmetrics.registerFontFamily("DejaVu", normal="DejaVu", bold="DejaVu-Bold",
                                  italic="DejaVu", boldItalic="DejaVu-Bold")
    _DEJAVU_OK = True
except Exception:
    pass

# Modern brand fonts (TTF). key -> (regular_file, bold_file, registered_regular, registered_bold)
_BRAND_FONTS = {
    "poppins": ("Poppins-Regular.ttf", "Poppins-Bold.ttf", "Poppins", "Poppins-Bold"),
    "montserrat": ("Montserrat-Regular.ttf", "Montserrat-Bold.ttf", "Montserrat", "Montserrat-Bold"),
    "lato": ("Lato-Regular.ttf", "Lato-Bold.ttf", "Lato", "Lato-Bold"),
    "robotoslab": ("RobotoSlab-Regular.ttf", "RobotoSlab-Bold.ttf", "RobotoSlab", "RobotoSlab-Bold"),
}

# Font key -> (regular, bold). 'dejavu' supports the ₹ glyph.
FONTS = {
    "helvetica": ("Helvetica", "Helvetica-Bold"),
    "times": ("Times-Roman", "Times-Bold"),
    "courier": ("Courier", "Courier-Bold"),
    "dejavu": ("DejaVu", "DejaVu-Bold") if _DEJAVU_OK else ("Helvetica", "Helvetica-Bold"),
}

def _font_has_rupee(path):
    """True if the TTF at `path` can render the Indian Rupee sign (U+20B9)."""
    try:
        from fontTools.ttLib import TTFont as _FT
        return 0x20B9 in _FT(path).getBestCmap()
    except Exception:
        return False


# Font keys whose embedded TTF can natively render the ₹ glyph. Standard PDF
# base-14 fonts (helvetica/times/courier) use WinAnsi and CANNOT, so for those
# we show "Rs." instead of ₹ to keep the whole proposal in a single font.
_RUPEE_FONT_KEYS = set()
if _DEJAVU_OK:
    _RUPEE_FONT_KEYS.add("dejavu")

for _key, (_reg_f, _bold_f, _reg_n, _bold_n) in _BRAND_FONTS.items():
    try:
        _reg_path = os.path.join(ASSETS, _reg_f)
        pdfmetrics.registerFont(TTFont(_reg_n, _reg_path))
        pdfmetrics.registerFont(TTFont(_bold_n, os.path.join(ASSETS, _bold_f)))
        pdfmetrics.registerFontFamily(_reg_n, normal=_reg_n, bold=_bold_n,
                                      italic=_reg_n, boldItalic=_bold_n)
        FONTS[_key] = (_reg_n, _bold_n)
        if _font_has_rupee(_reg_path):
            _RUPEE_FONT_KEYS.add(_key)
    except Exception:
        pass


# ── Rich text (Quill HTML) -> ReportLab flowables ────────────────────────────
_INLINE_MAP = {"strong": "b", "b": "b", "em": "i", "i": "i", "u": "u",
               "s": "strike", "strike": "strike", "del": "strike"}


def _esc(t: str) -> str:
    return (t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _css_color(val: str) -> str:
    val = (val or "").strip()
    m = re.match(r"rgba?\(([^)]+)\)", val, re.I)
    if m:
        nums = [n.strip() for n in m.group(1).split(",")[:3]]
        try:
            return "#%02X%02X%02X" % tuple(int(float(n)) for n in nums)
        except Exception:
            return "#000000"
    return val or "#000000"


def _inline_html(node) -> str:
    """Convert an element's inline children to ReportLab mini-HTML markup."""
    out = []
    for child in getattr(node, "children", []):
        if isinstance(child, NavigableString):
            out.append(_esc(str(child)))
            continue
        name = (child.name or "").lower()
        if name == "br":
            out.append("<br/>")
        elif name in _INLINE_MAP:
            out.append(f"<{_INLINE_MAP[name]}>{_inline_html(child)}</{_INLINE_MAP[name]}>")
        elif name == "a":
            href = _esc(child.get("href", ""))
            out.append(f'<a href="{href}" color="blue">{_inline_html(child)}</a>')
        elif name == "span":
            classes = child.get("class") or []
            if "ql-ui" in classes:
                continue  # Quill editor chrome, not content
            style = child.get("style", "") or ""
            m = re.search(r"color:\s*([^;]+)", style, re.I)
            inner = _inline_html(child)
            out.append(f'<font color="{_css_color(m.group(1))}">{inner}</font>' if m else inner)
        else:
            out.append(_inline_html(child))  # unwrap unknown inline tags
    return "".join(out)


def rich_to_flowables(html, style, gap=2):
    """Render Quill HTML (or plain text) into a list of ReportLab flowables,
    honoring bold/italic/underline/strike/color/links, paragraphs and lists."""
    if html is None:
        return []
    text = str(html).strip()
    if not text or text in ("<p><br></p>", "<p><br/></p>"):
        return []
    if "<" not in text:
        return [Paragraph(_esc(text), style)]

    soup = BeautifulSoup(text, "html.parser")
    flow = []
    pending = []

    def flush():
        if pending:
            inner = "".join(pending).strip()
            if inner:
                flow.append(Paragraph(inner, style))
            pending.clear()

    for el in soup.children:
        if isinstance(el, NavigableString):
            s = _esc(str(el))
            if s.strip():
                pending.append(s)
            continue
        name = (el.name or "").lower()
        if name in ("ul", "ol"):
            flush()
            lis = el.find_all("li", recursive=False)
            # Quill v2 emits <ol><li data-list="bullet|ordered">; honor that, else
            # fall back to the wrapper tag (<ul>=bullet, <ol>=numbered).
            first_dl = lis[0].get("data-list") if lis else None
            if first_dl in ("bullet", "ordered"):
                is_bullet = first_dl == "bullet"
            else:
                is_bullet = name == "ul"
            items = []
            for li in lis:
                dl = li.get("data-list")
                item_bullet = is_bullet if dl not in ("bullet", "ordered") else (dl == "bullet")
                inner = _inline_html(li).strip()
                if inner:
                    items.append(ListItem(Paragraph(inner, style), leftIndent=14,
                                          value="•" if item_bullet else None))
            if items:
                flow.append(ListFlowable(items, bulletType="bullet" if is_bullet else "1",
                                         leftIndent=10, spaceAfter=gap))
        elif name in ("p", "div", "h1", "h2", "h3", "h4"):
            flush()
            inner = _inline_html(el).strip()
            if inner:
                flow.append(Paragraph(inner, style))
        else:
            pending.append(_inline_html(el))
    flush()
    if not flow:
        txt = _esc(soup.get_text()).strip()
        if txt:
            flow.append(Paragraph(txt, style))
    return flow



def _font(key, bold=False):
    pair = FONTS.get(key or "dejavu", FONTS["dejavu"])
    return pair[1] if bold else pair[0]


def _needs_unicode(text) -> bool:
    """True only for glyphs the standard PDF base fonts can't encode. ReportLab's
    built-in fonts use WinAnsi (cp1252), which covers Latin-1 plus en/em dashes,
    curly quotes, bullet, euro, ellipsis, etc. So only ₹ and other non-cp1252
    characters force the DejaVu fallback."""
    if not text:
        return False
    try:
        str(text).encode("cp1252")
        return False
    except (UnicodeEncodeError, Exception):
        return True


def _smart_font(key, text, bold=False):
    """Use the chosen font, but fall back to DejaVu when the text needs a glyph
    (e.g. ₹) that the chosen font cannot render. Fonts that natively support the
    glyph keep the chosen font so the proposal stays in ONE typeface."""
    if not _needs_unicode(text):
        return _font(key, bold)
    # text needs a non-cp1252 glyph; keep the chosen font if it supports it
    if (key or "dejavu") in _RUPEE_FONT_KEYS:
        return _font(key, bold)
    # chosen font (helvetica/times/courier/robotoslab) can't render it → DejaVu
    if _DEJAVU_OK:
        return "DejaVu-Bold" if bold else "DejaVu"
    return _font(key, bold)


ACCENT = colors.HexColor("#00AEEF")
OFFER_RED = colors.HexColor("#EA2C1F")
DARK = colors.HexColor("#0f172a")
GREY = colors.HexColor("#64748b")
BORDER = colors.HexColor("#d0d5dd")
ROW_ALT = colors.HexColor("#f1f5f9")

# Default, fully admin-editable palette (hex strings).
DEFAULT_COLORS = {
    "accent": "#00AEEF",            # side bar + table header background
    "title": "#0f172a",            # main title text
    "body": "#0f172a",             # paragraph / body text
    "heading": "#00AEEF",          # section header text
    "header_text": "#64748b",      # company header lines + footer + disclaimer
    "offer": "#EA2C1F",            # offer / discounted price
    "border": "#d0d5dd",           # table grid / borders
    "table_header_text": "#FFFFFF",  # pricing table header text
    "row_alt": "#F1F5F9",          # alternating pricing row background
}


def _color(c, fallback):
    try:
        return colors.HexColor(c)
    except Exception:
        return fallback



def _rs(v, font_key=None):
    """Format a rupee amount. Uses the ₹ symbol only when the chosen font can
    render it; otherwise falls back to 'Rs.' so the whole document stays in a
    single typeface (e.g. an all-Helvetica template won't mix in DejaVu)."""
    try:
        f = float(v)
        n = int(f) if f == int(f) else round(f, 2)
    except Exception:
        return "-"
    use_symbol = (font_key or "dejavu") in _RUPEE_FONT_KEYS
    return f"₹{n:,}" if use_symbol else f"Rs. {n:,}"


# ── Default template (v2) ────────────────────────────────────────────────────
def _sec(id, type, heading="", **kw):
    base = {
        "id": id, "type": type, "heading": heading,
        "heading_font": "dejavu", "heading_size": 13,
        "body_font": "dejavu", "body_size": 10,
        "page_break_before": False,
        "space_before": 6, "space_after": 8, "line_spacing": 1.4,
    }
    base.update(kw)
    return base


# Header / footer: 3 zones (left / center / right), MS-Word style. Each zone has
# a `type` (what to show) and optional `text` (for page-number format / custom).
HF_ELEMENT_TYPES = [
    "none", "logo", "company_name", "company_block", "address",
    "email", "website", "cin", "phone", "date", "page", "custom",
]
DEFAULT_HEADER = {
    "enabled": True,
    "left": {"type": "logo", "text": ""},
    "center": {"type": "none", "text": ""},
    "right": {"type": "company_block", "text": ""},
}
DEFAULT_FOOTER = {
    "enabled": True,
    "left": {"type": "none", "text": ""},
    "center": {"type": "none", "text": ""},
    "right": {"type": "page", "text": "Page {n}"},
}


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
    "colors": DEFAULT_COLORS,
    "header": DEFAULT_HEADER,
    "footer": DEFAULT_FOOTER,
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


def _norm_hf(cfg, default):
    cfg = {**default, **(cfg or {})}
    out = {"enabled": bool(cfg.get("enabled", True))}
    for z in ("left", "center", "right"):
        zone = cfg.get(z) or {}
        zt = zone.get("type", "none")
        if zt not in HF_ELEMENT_TYPES:
            zt = "none"
        out[z] = {"type": zt, "text": zone.get("text", "")}
    return out


def _normalize(tpl: dict) -> dict:
    if not tpl.get("sections"):
        tpl = _migrate_legacy(tpl)
    tpl["company"] = {**DEFAULT_TEMPLATE["company"], **(tpl.get("company") or {})}
    tpl["title"] = {**DEFAULT_TEMPLATE["title"], **(tpl.get("title") or {})}
    tpl["colors"] = {**DEFAULT_COLORS, **(tpl.get("colors") or {})}
    tpl["header"] = _norm_hf(tpl.get("header"), DEFAULT_HEADER)
    tpl["footer"] = _norm_hf(tpl.get("footer"), DEFAULT_FOOTER)
    norm = []
    for sec in tpl.get("sections", []):
        base = _sec(sec.get("id") or "sec", sec.get("type") or "paragraph")
        base.update(sec)
        norm.append(base)
    tpl["sections"] = norm
    return tpl


def merge_override(template: dict, override: dict | None) -> dict:
    """Merge a per-lead override onto the global template. Company/logo/fonts
    always come from the global template; per-lead overrides only change text
    content and the set/order of sections. `override` carries full section dicts
    (fonts/sizes copied from the template at customize time)."""
    merged = _normalize({**(template or {})})
    if not override:
        return merged
    ov_title = (override.get("title") or {}).get("text_template")
    if ov_title:
        merged["title"] = {**merged["title"], "text_template": ov_title}
    if override.get("sections"):
        secs = []
        for s in override["sections"]:
            base = _sec(s.get("id") or "sec", s.get("type") or "paragraph")
            base.update(s)
            secs.append(base)
        merged["sections"] = secs
    return merged


import copy as _copy
import uuid as _uuid

CONTENT_KEYS = ["company", "title", "colors", "header", "footer", "sections"]
PRESET_NAMES = ["Hotels", "Retail", "Events"]


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _content(tpl: dict) -> dict:
    """Deep-copy just the editable content of a template (no id/name/meta)."""
    src = _normalize(_copy.deepcopy(tpl))
    return {k: _copy.deepcopy(src[k]) for k in CONTENT_KEYS if k in src}


def _make_template_doc(name: str, base: dict = None, is_default: bool = False) -> dict:
    doc = _content(base or DEFAULT_TEMPLATE)
    doc["id"] = str(_uuid.uuid4())
    doc["name"] = name
    doc["is_default"] = is_default
    doc["created_at"] = _now_iso()
    doc["updated_at"] = _now_iso()
    return doc


async def _ensure_templates(tdb):
    """Migrate the legacy single-template tenants to the multi-template model and
    seed the starter presets once. Idempotent; never re-creates deleted presets."""
    docs = await tdb.proposal_templates.find({}).to_list(200)
    seed_presets = False

    if not docs:
        await tdb.proposal_templates.insert_one(_make_template_doc("Default", DEFAULT_TEMPLATE, is_default=True))
        seed_presets = True
    else:
        legacy = [d for d in docs if not d.get("id")]
        for d in legacy:
            await tdb.proposal_templates.update_one(
                {"_id": d["_id"]},
                {"$set": {"id": str(_uuid.uuid4()), "name": "Default", "is_default": True,
                          "updated_at": _now_iso()}},
            )
            seed_presets = True  # first migration → seed presets once

    if seed_presets:
        existing_names = {d.get("name") for d in await tdb.proposal_templates.find({}, {"name": 1}).to_list(200)}
        base = await tdb.proposal_templates.find_one({"is_default": True}, {"_id": 0})
        base = _normalize(base) if base else DEFAULT_TEMPLATE
        for nm in PRESET_NAMES:
            if nm not in existing_names:
                await tdb.proposal_templates.insert_one(_make_template_doc(nm, base, is_default=False))

    # guarantee exactly one default
    defaults = await tdb.proposal_templates.find({"is_default": True}, {"_id": 0, "id": 1}).to_list(200)
    if not defaults:
        any_doc = await tdb.proposal_templates.find_one({}, {"_id": 0, "id": 1})
        if any_doc:
            await tdb.proposal_templates.update_one({"id": any_doc["id"]}, {"$set": {"is_default": True}})
    elif len(defaults) > 1:
        keep = defaults[0]["id"]
        await tdb.proposal_templates.update_many({"is_default": True, "id": {"$ne": keep}},
                                                 {"$set": {"is_default": False}})


async def list_templates(tdb) -> list:
    await _ensure_templates(tdb)
    docs = await tdb.proposal_templates.find({}, {"_id": 0}).to_list(200)
    docs.sort(key=lambda d: (not d.get("is_default"), (d.get("name") or "").lower()))
    return [_normalize(d) for d in docs]


async def get_default_template(tdb) -> dict:
    docs = await list_templates(tdb)
    for d in docs:
        if d.get("is_default"):
            return d
    return docs[0] if docs else _normalize(_copy.deepcopy(DEFAULT_TEMPLATE))


async def get_template_by_id(tdb, template_id) -> dict:
    if not template_id:
        return None
    docs = await list_templates(tdb)
    for d in docs:
        if d.get("id") == template_id:
            return d
    return None


async def resolve_template(tdb, template_id=None) -> dict:
    """Return the requested template, falling back to the tenant default."""
    if template_id:
        t = await get_template_by_id(tdb, template_id)
        if t:
            return t
    return await get_default_template(tdb)


async def get_or_seed_template(tdb) -> dict:
    """Backward-compatible: returns the tenant's default template."""
    return await get_default_template(tdb)


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
def _fmt_hf(s, ctx, n, total):
    return (str(s or "")
            .replace("{n}", str(n))
            .replace("{total}", str(total) if total else "?")
            .replace("{company}", ctx.get("company_name", ""))
            .replace("{date}", ctx.get("date", "")))


def _zone_lines(zone, company, ctx, n, total):
    """Return the list of text lines for a non-logo zone."""
    zt = zone.get("type", "none")
    txt = zone.get("text", "")
    if zt == "company_name":
        return [ctx.get("company_name", "")]
    if zt == "company_block":
        return list(company.get("address_lines", [])) + [company.get("email", ""), company.get("website", ""), company.get("cin", "")]
    if zt == "address":
        return list(company.get("address_lines", []))
    if zt == "email":
        return [company.get("email", "")]
    if zt == "website":
        return [company.get("website", "")]
    if zt == "cin":
        return [company.get("cin", "")]
    if zt == "phone":
        return [company.get("phone", "")]
    if zt == "date":
        return [ctx.get("date", "")]
    if zt == "page":
        return [_fmt_hf(txt or "Page {n}", ctx, n, total)]
    if zt == "custom":
        return [_fmt_hf(txt, ctx, n, total)] if txt else []
    return []


def _draw_logo(canvas, company, x, top_y, align):
    width, height = 38 * mm, 16 * mm
    lx = x if align == "left" else (x - width if align == "right" else x - width / 2)
    ly = top_y - height
    logo_b64 = company.get("logo_data")
    if logo_b64:
        try:
            img = ImageReader(io.BytesIO(base64.b64decode(logo_b64)))
            canvas.drawImage(img, lx, ly, width=width, height=height,
                             preserveAspectRatio=True, mask="auto", anchor="sw")
            return
        except Exception:
            pass
    logo = os.path.join(ASSETS, "logo.png")
    if os.path.exists(logo):
        try:
            canvas.drawImage(logo, lx, ly, width=34 * mm, height=height,
                             preserveAspectRatio=True, mask="auto", anchor="sw")
        except Exception:
            pass


def _draw_aligned(canvas, text, x, y, align):
    if align == "center":
        canvas.drawCentredString(x, y, text)
    elif align == "right":
        canvas.drawRightString(x, y, text)
    else:
        canvas.drawString(x, y, text)


def _draw_zone(canvas, zone, x, align, top_y, line_h, company, ctx, n, total, color, is_footer, base_font="dejavu"):
    zt = zone.get("type", "none")
    if zt == "none":
        return
    if zt == "logo":
        _draw_logo(canvas, company, x, top_y, align)
        return
    lines = [l for l in _zone_lines(zone, company, ctx, n, total) if l]
    if not lines:
        return
    canvas.setFillColor(color)
    if is_footer:
        for i, ln in enumerate(reversed(lines)):
            canvas.setFont(_smart_font(base_font, ln), 8)
            _draw_aligned(canvas, ln, x, top_y + i * line_h, align)
    else:
        yy = top_y
        for ln in lines:
            canvas.setFont(_smart_font(base_font, ln), 8)
            _draw_aligned(canvas, ln, x, yy, align)
            yy -= line_h


def _draw_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    tpl = doc._tpl
    ctx = getattr(doc, "_ctx", {})
    total = getattr(doc, "_total", None)
    n = canvas.getPageNumber()
    pal = tpl.get("colors", {})
    c_accent = _color(pal.get("accent"), ACCENT)
    c_header_text = _color(pal.get("header_text"), GREY)
    company = tpl.get("company", {})
    base_font = (tpl.get("title", {}) or {}).get("font", "dejavu")

    # side accent bar
    canvas.setFillColor(c_accent)
    canvas.rect(w - 5 * mm, 0, 5 * mm, h, stroke=0, fill=1)

    xs = {"left": 16 * mm, "center": w / 2, "right": w - 12 * mm}

    header = tpl.get("header", {})
    if header.get("enabled", True):
        for z, align in (("left", "left"), ("center", "center"), ("right", "right")):
            _draw_zone(canvas, header.get(z, {}), xs[align], align, h - 13 * mm, 4.2 * mm,
                       company, ctx, n, total, c_header_text, is_footer=False, base_font=base_font)

    footer = tpl.get("footer", {})
    if footer.get("enabled", True):
        for z, align in (("left", "left"), ("center", "center"), ("right", "right")):
            _draw_zone(canvas, footer.get(z, {}), xs[align], align, 10 * mm, 4.2 * mm,
                       company, ctx, n, total, c_header_text, is_footer=True, base_font=base_font)

    canvas.restoreState()


def _needs_total(tpl) -> bool:
    for hf in (tpl.get("header", {}), tpl.get("footer", {})):
        for z in ("left", "center", "right"):
            zone = hf.get(z, {})
            if zone.get("type") in ("page", "custom") and "{total}" in (zone.get("text") or ""):
                return True
    return False



def build_proposal_pdf(lead: dict, template: dict, pricing_rows: list) -> bytes:
    template = _normalize(template)
    pal = template.get("colors", {})
    c_accent = _color(pal.get("accent"), ACCENT)
    c_title = _color(pal.get("title"), DARK)
    c_body = _color(pal.get("body"), DARK)
    c_heading = _color(pal.get("heading"), c_accent)
    c_header_text = _color(pal.get("header_text"), GREY)
    c_border = _color(pal.get("border"), BORDER)
    c_row_alt = _color(pal.get("row_alt"), ROW_ALT)
    c_table_head_text = _color(pal.get("table_head_text", pal.get("table_header_text")), colors.white)
    offer_hex = pal.get("offer") or "#EA2C1F"
    styles = getSampleStyleSheet()

    def _ls(sec):
        try:
            return max(1.0, float(sec.get("line_spacing", 1.4) or 1.4))
        except Exception:
            return 1.4

    def body_style(sec):
        sz = sec.get("body_size", 10)
        return ParagraphStyle(f"b_{sec['id']}", parent=styles["BodyText"],
                              fontName=_font(sec.get("body_font"), False),
                              fontSize=sz, leading=round(sz * _ls(sec)),
                              textColor=c_body, spaceAfter=2)

    def heading_style(sec):
        sz = sec.get("heading_size", 13)
        return ParagraphStyle(f"h_{sec['id']}", parent=styles["Heading2"],
                              fontName=_font(sec.get("heading_font"), True),
                              fontSize=sz, leading=round(sz * _ls(sec)),
                              textColor=c_heading, spaceBefore=0, spaceAfter=4)

    company_name = lead.get("company") or "Prospect"
    title_cfg = template.get("title", {})
    base_font_key = title_cfg.get("font", "dejavu")
    small = ParagraphStyle("small", parent=styles["BodyText"], fontName=_font(base_font_key), fontSize=8.5,
                           textColor=c_header_text, leading=11)
    date_s = ParagraphStyle("date", parent=styles["BodyText"], fontName=_font(base_font_key), fontSize=10, textColor=c_header_text)

    title_s = ParagraphStyle("title", parent=styles["Heading1"],
                             fontName=_font(title_cfg.get("font"), True),
                             fontSize=title_cfg.get("size", 19),
                             leading=title_cfg.get("size", 19) + 4, textColor=c_title, spaceAfter=8)
    title = (title_cfg.get("text_template") or "Proposal For {company}").format(company=company_name)

    ctx = {"company_name": company_name,
           "date": datetime.now(timezone.utc).strftime("%d-%b-%Y").upper()}

    def bullets(items, bstyle):
        bs = ParagraphStyle(f"bl_{id(items)}", parent=bstyle, leftIndent=4, spaceAfter=2)
        return ListFlowable([ListItem(Paragraph(_esc(str(i)), bs), value="•", leftIndent=14) for i in items],
                            bulletType="bullet", start="•", leftIndent=10)

    def _num(v, fallback):
        try:
            return max(0.0, float(v))
        except Exception:
            return fallback

    def make_story():
        story = [Paragraph(ctx["date"], date_s), Spacer(1, 2 * mm),
                 Paragraph(title, title_s), Spacer(1, 1 * mm)]
        for sec in template["sections"]:
            if sec.get("page_break_before"):
                story.append(PageBreak())
            sb = _num(sec.get("space_before", 6), 6)
            if sb:
                story.append(Spacer(1, sb))
            bstyle = body_style(sec)
            if sec.get("heading"):
                story.append(Paragraph(sec["heading"], heading_style(sec)))

            t = sec.get("type")
            if t == "paragraph":
                if sec.get("content"):
                    story.extend(rich_to_flowables(sec["content"], bstyle))
            elif t == "list":
                if sec.get("intro"):
                    story.extend(rich_to_flowables(sec["intro"], bstyle))
                story.append(bullets(sec.get("items", []), bstyle))
            elif t == "category":
                if sec.get("intro"):
                    story.extend(rich_to_flowables(sec["intro"], bstyle))
                if sec.get("allowed"):
                    story.append(Paragraph(_esc(" | ".join(sec["allowed"])),
                                           ParagraphStyle("ok", parent=bstyle, textColor=colors.HexColor("#166534"))))
                if sec.get("not_allowed"):
                    story.append(Paragraph(_esc("It must NOT be listed under: " + " | ".join(sec["not_allowed"])),
                                           ParagraphStyle("no", parent=bstyle, textColor=_color(offer_hex, OFFER_RED))))
            elif t == "pricing_table":
                head = ["Format", "Standard Pricing", "Offer Price", "Return Bottle Credit", "Landing Price after Credit"]
                bf = sec.get("body_font")
                csz = sec.get("body_size", 9)

                def pcell(text, color_hint="", bold=False):
                    fn = _smart_font(bf, str(text), bold)
                    st = ParagraphStyle("pcell", parent=bstyle, fontName=fn, fontSize=csz, leading=11)
                    if color_hint:
                        st.textColor = color_hint
                    return Paragraph(str(text), st)

                head_style = lambda txt: ParagraphStyle("th", parent=bstyle, fontName=_smart_font(bf, txt, True),
                                                        fontSize=csz, leading=11, textColor=c_table_head_text)
                data = [[Paragraph(f"<b>{c}</b>", head_style(c)) for c in head]]
                if pricing_rows:
                    for r in pricing_rows:
                        offer_html = f'<font color="{offer_hex}"><b>{_rs(r["offer"], bf)}</b></font>' if r["offer"] is not None else "-"
                        std_html = f'<strike>{_rs(r["standard"], bf)}</strike>' if r["standard"] else "-"
                        data.append([
                            pcell(r["format"]),
                            pcell(std_html),
                            pcell(offer_html),
                            pcell(_rs(r["credit"], bf) if r["credit"] else "-"),
                            pcell(_rs(r["landing"], bf) if r["landing"] is not None else "-"),
                        ])
                else:
                    data.append([pcell("Add the proposed SKUs & pricing on the lead to populate this table."), "", "", "", ""])
                tbl = Table(data, colWidths=[58 * mm, 27 * mm, 25 * mm, 28 * mm, 30 * mm], repeatRows=1)
                tbl.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), c_accent),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c_row_alt]),
                    ("GRID", (0, 0), (-1, -1), 0.4, c_border),
                    ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ]))
                story.append(tbl)
                if sec.get("disclaimer"):
                    story.append(Spacer(1, 2 * mm))
                    story.extend(rich_to_flowables(sec["disclaimer"], small))
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
                    try:
                        story.append(Image(src, width=120 * mm, height=102 * mm, kind="proportional", hAlign="CENTER"))
                    except Exception:
                        pass

            sa = _num(sec.get("space_after", 8), 8)
            if sa:
                story.append(Spacer(1, sa))
        return story

    top_m = 32 * mm if template.get("header", {}).get("enabled", True) else 18 * mm
    bottom_m = 18 * mm if template.get("footer", {}).get("enabled", True) else 14 * mm

    def make_doc(buf, total):
        doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
                              topMargin=top_m, bottomMargin=bottom_m, title=f"Proposal — {company_name}")
        doc._tpl = template
        doc._ctx = ctx
        doc._total = total
        frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width - 3 * mm, doc.height, id="main")
        doc.addPageTemplates([PageTemplate(id="branded", frames=[frame], onPage=_draw_page)])
        return doc

    total = None
    if _needs_total(template):
        b1 = io.BytesIO()
        d1 = make_doc(b1, None)
        d1.build(make_story())
        total = d1.page

    buf = io.BytesIO()
    doc = make_doc(buf, total)
    doc.build(make_story())
    buf.seek(0)
    return buf.read()
