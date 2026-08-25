"""Lead Briefs — externally-sourced market intel dumped per city for the sales
team to review. Sales mark briefs Reviewed and can convert promising ones to leads."""
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


async def _fetch_og_photo(profile_url: str, domain: str) -> Optional[str]:
    """Best-effort: pull og:image from a public profile page (LinkedIn/Instagram)."""
    if not profile_url or domain not in profile_url:
        return None
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12,
                                     headers={"User-Agent": _BROWSER_UA, "Accept-Language": "en"}) as client:
            r = await client.get(profile_url)
        final = str(r.url)
        if r.status_code != 200 or "authwall" in final or "/accounts/login" in final:
            return None
        m = re.search(r'og:image"\s+content="([^"]+)"', r.text) or \
            re.search(r'content="([^"]+)"\s+property="og:image"', r.text)
        if m:
            photo = m.group(1).replace("&amp;", "&")
            if "static.cdninstagram.com/rsrc" not in photo:
                return photo
    except Exception:
        pass
    return None


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
    cities = await db.lead_briefs.distinct("city", {"tenant_id": tenant_id})
    return {"cities": sorted(c for c in cities if c)}


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
    if not doc["image_url"]:
        if doc["linkedin_url"]:
            doc["linkedin_photo_url"] = await _fetch_linkedin_photo(doc["linkedin_url"])
        if doc["instagram_url"]:
            doc["instagram_photo_url"] = await _fetch_instagram_photo(doc["instagram_url"])
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
    if not upd.get("image_url"):
        if upd.get("linkedin_url"):
            photo = await _fetch_linkedin_photo(upd["linkedin_url"])
            if photo:
                upd["linkedin_photo_url"] = photo
        if upd.get("instagram_url"):
            photo = await _fetch_instagram_photo(upd["instagram_url"])
            if photo:
                upd["instagram_photo_url"] = photo
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
    chat = LlmChat(api_key=api_key, session_id=f"lead-brief-{uuid.uuid4()}",
                   system_message=AI_EXTRACT_SYSTEM).with_model("openai", "gpt-5.5")
    prompt = (f"Known cities (pick the matching one for each brief's `city`, or empty string if none match): "
              f"{json.dumps(city_names)}\n\nRAW INFORMATION:\n{text[:12000]}")
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
