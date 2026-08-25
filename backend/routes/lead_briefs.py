"""Lead Briefs — externally-sourced market intel dumped per city for the sales
team to review. Sales mark briefs Reviewed and can convert promising ones to leads."""
import html as _html
import json as _json
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends

from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db

router = APIRouter(prefix="/lead-briefs", tags=["Lead Briefs"])

ADMIN_ROLES = {"ceo", "director", "admin", "system admin", "system_admin", "tenant_admin", "owner"}


def _is_admin(user: dict) -> bool:
    return (user or {}).get("role", "").strip().lower() in ADMIN_ROLES


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
               "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


async def _fetch_profile_meta(profile_url: str, domain: str) -> Optional[dict]:
    """Best-effort: pull og:image/title/description + JSON-LD profile data from a public profile page."""
    if not profile_url or domain not in profile_url:
        return None
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12,
                                     headers={"User-Agent": _BROWSER_UA, "Accept-Language": "en"}) as client:
            r = await client.get(profile_url)
        final = str(r.url)
        if r.status_code != 200 or "authwall" in final or "/accounts/login" in final:
            return None
        text = r.text

        def og(prop):
            m = re.search(rf'{prop}"\s+content="([^"]+)"', text) or \
                re.search(rf'content="([^"]+)"\s+property="{prop}"', text)
            return _html.unescape(m.group(1)) if m else ""

        meta = {"photo": og("og:image") or None, "name": og("og:title"),
                "description": og("og:description"), "location": "", "followers": None}
        if meta["photo"] and "static.cdninstagram.com/rsrc" in meta["photo"]:
            meta["photo"] = None
        meta["name"] = re.sub(r"\s*\|\s*LinkedIn\s*$", "", meta["name"]).strip()
        ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)
        if ld:
            try:
                data = _json.loads(_html.unescape(ld.group(1)))
                for node in data.get("@graph", [data]):
                    if node.get("@type") == "Person":
                        addr = node.get("address") or {}
                        meta["location"] = addr.get("addressLocality") or ""
                        stats = node.get("interactionStatistic") or []
                        if isinstance(stats, dict):
                            stats = [stats]
                        for stat in stats:
                            if isinstance(stat, dict) and stat.get("userInteractionCount"):
                                meta["followers"] = stat["userInteractionCount"]
                                break
                        if not meta["name"]:
                            meta["name"] = node.get("name") or ""
            except Exception:
                pass
        if not (meta["photo"] or meta["name"] or meta["description"]):
            return None
        meta["fetched_at"] = _now()
        return meta
    except Exception:
        return None


async def _fetch_og_photo(profile_url: str, domain: str) -> Optional[str]:
    meta = await _fetch_profile_meta(profile_url, domain)
    return meta.get("photo") if meta else None


async def _social_enrichment(linkedin_url, instagram_url) -> dict:
    out = {}
    if linkedin_url:
        meta = await _fetch_profile_meta(linkedin_url, "linkedin.com")
        if meta:
            out["linkedin_photo_url"] = meta.pop("photo", None)
            out["linkedin_profile"] = meta
    if instagram_url:
        meta = await _fetch_profile_meta(instagram_url, "instagram.com")
        if meta:
            out["instagram_photo_url"] = meta.pop("photo", None)
            out["instagram_profile"] = meta
    return out


async def _fetch_linkedin_photo(linkedin_url: str) -> Optional[str]:
    return await _fetch_og_photo(linkedin_url, "linkedin.com")


async def _fetch_instagram_photo(instagram_url: str) -> Optional[str]:
    return await _fetch_og_photo(instagram_url, "instagram.com")


class BriefCreate(BaseModel):
    title: str
    city: str
    content: str
    summary: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    instagram_url: Optional[str] = None
    image_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class BriefUpdate(BaseModel):
    title: Optional[str] = None
    city: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    instagram_url: Optional[str] = None
    image_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class ConvertPayload(BaseModel):
    lead_id: str
    lead_company: Optional[str] = None


@router.get("")
async def list_briefs(city: Optional[str] = None, status: Optional[str] = None,
                      current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if city and city != "all":
        q["city"] = city
    if status and status != "all":
        q["status"] = status
    briefs = await db.lead_briefs.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"briefs": briefs, "is_admin": _is_admin(current_user)}


@router.get("/cities")
async def brief_cities(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    rows = await db.lead_briefs.aggregate([
        {"$match": {"tenant_id": tenant_id}},
        {"$group": {"_id": "$city",
                    "new_count": {"$sum": {"$cond": [{"$eq": ["$status", "new"]}, 1, 0]}}}},
    ]).to_list(500)
    cities = sorted(r["_id"] for r in rows if r["_id"])
    return {"cities": cities, "new_counts": {r["_id"]: r["new_count"] for r in rows if r["_id"]}}


@router.post("")
async def create_brief(payload: BriefCreate, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can add lead briefs.")
    tenant_id = get_current_tenant_id()
    if not payload.title.strip() or not payload.city.strip() or not payload.content.strip():
        raise HTTPException(400, "Title, city and content are required.")
    summary = (payload.summary or "").strip() or payload.content.strip()[:220]
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id,
        "title": payload.title.strip(), "city": payload.city.strip(),
        "content": payload.content.strip(), "summary": summary,
        "source_name": (payload.source_name or "").strip() or None,
        "source_url": (payload.source_url or "").strip() or None,
        "linkedin_url": (payload.linkedin_url or "").strip() or None,
        "instagram_url": (payload.instagram_url or "").strip() or None,
        "image_url": (payload.image_url or "").strip() or None,
        "email": (payload.email or "").strip() or None,
        "phone": (payload.phone or "").strip() or None,
        "status": "new",
        "reviewed_by_name": None, "reviewed_at": None,
        "converted_lead_id": None, "converted_lead_company": None,
        "created_by": current_user.get("id"), "created_by_name": current_user.get("name"),
        "created_at": _now(), "updated_at": _now(),
    }
    if doc["linkedin_url"] or doc["instagram_url"]:
        enrich = await _social_enrichment(doc["linkedin_url"], doc["instagram_url"])
        if doc["image_url"]:
            enrich.pop("linkedin_photo_url", None)
            enrich.pop("instagram_photo_url", None)
        doc.update(enrich)
    await db.lead_briefs.insert_one({**doc})
    return {"ok": True, "brief": doc}


@router.put("/{brief_id}")
async def update_brief(brief_id: str, payload: BriefUpdate,
                       current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can edit lead briefs.")
    tenant_id = get_current_tenant_id()
    upd = {k: v for k, v in payload.dict().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update.")
    upd["updated_at"] = _now()
    if upd.get("linkedin_url") or upd.get("instagram_url"):
        enrich = await _social_enrichment(upd.get("linkedin_url"), upd.get("instagram_url"))
        upd.update({k: v for k, v in enrich.items() if v})
    r = await db.lead_briefs.update_one({"id": brief_id, "tenant_id": tenant_id}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}


@router.delete("/{brief_id}")
async def delete_brief(brief_id: str, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can delete lead briefs.")
    tenant_id = get_current_tenant_id()
    r = await db.lead_briefs.delete_one({"id": brief_id, "tenant_id": tenant_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}


@router.post("/{brief_id}/review")
async def mark_reviewed(brief_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    r = await db.lead_briefs.update_one(
        {"id": brief_id, "tenant_id": tenant_id},
        {"$set": {"status": "reviewed", "reviewed_by_name": current_user.get("name"),
                  "reviewed_at": _now(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}


@router.post("/{brief_id}/converted")
async def mark_converted(brief_id: str, payload: ConvertPayload,
                         current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    r = await db.lead_briefs.update_one(
        {"id": brief_id, "tenant_id": tenant_id},
        {"$set": {"converted_lead_id": payload.lead_id,
                  "converted_lead_company": payload.lead_company,
                  "status": "reviewed",
                  "reviewed_by_name": current_user.get("name"), "reviewed_at": _now(),
                  "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}


class ExtractPayload(BaseModel):
    text: str


AI_EXTRACT_SYSTEM = (
    "You extract structured lead briefs from raw, possibly messy market-intel text for a beverage/FMCG CRM. "
    "The text may mention MULTIPLE distinct prospects (people, companies or venues) with mixed-up links and contacts. "
    "Split the text into one brief per distinct prospect/opportunity, attaching the correct LinkedIn/Instagram/email/phone "
    "and city to each. If a link or note cannot be confidently attached to a specific prospect, append it under a "
    "'General notes:' section inside the content of the most relevant brief so nothing is lost. "
    "Respond with ONLY a JSON object, no markdown, shaped as {\"briefs\": [ ... ]} where each brief has exactly these keys: "
    "title (short headline naming the person/business opportunity), city, summary (max 220 chars card snippet), "
    "content (clean, well-organised version of that prospect's information, preserve all facts), "
    "source_name, source_url, linkedin_url, instagram_url, email, phone. "
    "Use empty string for anything not present. Do not invent facts."
)

BRIEF_KEYS = ("title", "city", "summary", "content", "source_name", "source_url",
              "linkedin_url", "instagram_url", "email", "phone")


@router.post("/ai-extract")
async def ai_extract(payload: ExtractPayload, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can add lead briefs.")
    text = (payload.text or "").strip()
    if len(text) < 20:
        raise HTTPException(400, "Please paste more information to extract from.")
    import os, json
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(500, "AI key not configured")
    cities = await db.master_cities.find({"is_active": True}, {"_id": 0, "name": 1}).to_list(200)
    city_names = [c["name"] for c in cities if c.get("name")]

    # Profile-aware extraction: fetch live profile data for any social URLs in the dump
    import asyncio
    li_urls = [u.rstrip('.') for u in re.findall(r'(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9\-_%.]+', text)][:5]
    ig_urls = [u.rstrip('./') for u in re.findall(r'(?:https?://)?(?:www\.)?instagram\.com/[A-Za-z0-9_.]+/?', text)][:5]

    def _full(u):
        return u if u.startswith("http") else f"https://www.{u.lstrip('w.')}" if not u.startswith("www.") else f"https://{u}"

    tasks = [(u, _fetch_profile_meta(_full(u), "linkedin.com")) for u in li_urls] + \
            [(u, _fetch_profile_meta(_full(u), "instagram.com")) for u in ig_urls]
    profile_context = ""
    if tasks:
        metas = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)
        lines = []
        for (u, _), meta in zip(tasks, metas):
            if isinstance(meta, dict) and (meta.get("name") or meta.get("description")):
                lines.append(f"- {u}: name={meta.get('name') or ''} | location={meta.get('location') or ''} | "
                             f"followers={meta.get('followers') or ''} | bio={meta.get('description') or ''}")
        if lines:
            profile_context = ("\n\nVERIFIED PROFILE DATA (fetched live from the profile pages — use this to enrich "
                               "each prospect's role, company and location in title/summary/content; do not contradict it):\n"
                               + "\n".join(lines))

    chat = LlmChat(api_key=api_key, session_id=f"lead-brief-{uuid.uuid4()}",
                   system_message=AI_EXTRACT_SYSTEM).with_model("openai", "gpt-5.5")
    prompt = (f"Known cities (pick the matching one for each brief's `city`, or empty string if none match): "
              f"{json.dumps(city_names)}\n\nRAW INFORMATION:\n{text[:12000]}{profile_context}")
    try:
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = resp if isinstance(resp, str) else str(resp)
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
    except Exception as e:
        raise HTTPException(502, f"AI extraction failed: {e}")
    raw_briefs = data.get("briefs") if isinstance(data.get("briefs"), list) else [data]
    briefs = []
    for item in raw_briefs:
        if not isinstance(item, dict):
            continue
        fields = {k: (item.get(k) or "").strip() if isinstance(item.get(k), str) else ""
                  for k in BRIEF_KEYS}
        if fields["title"] or fields["content"]:
            briefs.append(fields)
    if not briefs:
        briefs = [{**{k: "" for k in BRIEF_KEYS}, "content": text}]
    if len(briefs) == 1 and not briefs[0]["content"]:
        briefs[0]["content"] = text
    return {"briefs": briefs, "fields": briefs[0]}


class DupItem(BaseModel):
    title: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""


class DupCheckPayload(BaseModel):
    items: list[DupItem]


def _norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", (t or "").lower()).strip()


def _name_part(t: str) -> str:
    """Prospect-name portion of a title: text before the first separator."""
    head = re.split(r"—|-|:|,| at | from | of ", t or "", 1)[0]
    return _norm_title(head)


def _titles_match(a: str, b: str) -> bool:
    na, nb = _norm_title(a), _norm_title(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if len(na) >= 5 and len(nb) >= 5 and (na in nb or nb in na):
        return True
    pa, pb = _name_part(a), _name_part(b)
    return bool(pa and pb and len(pa) >= 5 and len(pb) >= 5 and (pa == pb or pa in nb or pb in na))


def _norm_phones(p: str) -> set:
    """Split multi-number strings and normalise each to its last 10 digits."""
    out = set()
    for part in re.split(r"[;,/|]| and ", p or ""):
        digits = re.sub(r"\D", "", part)
        if len(digits) >= 7:
            out.add(digits[-10:])
    return out


@router.post("/check-duplicates")
async def check_duplicates(payload: DupCheckPayload, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can add lead briefs.")
    tenant_id = get_current_tenant_id()
    existing = await db.lead_briefs.find(
        {"tenant_id": tenant_id}, {"_id": 0, "id": 1, "title": 1, "city": 1, "email": 1, "phone": 1}
    ).to_list(2000)
    results = []
    for item in payload.items:
        ne, np_ = (item.email or "").strip().lower(), _norm_phones(item.phone)
        matches = []
        for b in existing:
            be, bp = (b.get("email") or "").strip().lower(), _norm_phones(b.get("phone"))
            matched_on = []
            if _titles_match(item.title, b.get("title")):
                matched_on.append("name")
            if ne and be and ne == be:
                matched_on.append("email")
            if np_ and bp and np_ & bp:
                matched_on.append("phone")
            if matched_on:
                matches.append({"id": b["id"], "title": b.get("title"), "city": b.get("city"),
                                "matched_on": matched_on})
        results.append(matches[:5])
    return {"duplicates": results}


@router.post("/{brief_id}/fetch-photo")
async def fetch_photo(brief_id: str, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can refresh photos.")
    tenant_id = get_current_tenant_id()
    b = await db.lead_briefs.find_one({"id": brief_id, "tenant_id": tenant_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Brief not found")
    upd = await _social_enrichment(b.get("linkedin_url"), b.get("instagram_url"))
    upd = {k: v for k, v in upd.items() if v}
    if b.get("image_url"):
        upd.pop("linkedin_photo_url", None)
        upd.pop("instagram_photo_url", None)
    if not upd:
        return {"ok": False, "message": "LinkedIn/Instagram refused to serve this profile to our server (bot protection). You can retry later — or it may work from the production server."}
    source = "LinkedIn" if "linkedin_profile" in upd or "linkedin_photo_url" in upd else "Instagram"
    upd["updated_at"] = _now()
    await db.lead_briefs.update_one({"id": brief_id, "tenant_id": tenant_id}, {"$set": upd})
    return {"ok": True, "source": source, **upd}
