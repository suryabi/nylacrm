"""Water Intelligence — daily water-industry news collection, AI scoring/summarization,
approval workflow and public publishing API."""
import os
import re
import json
import uuid
import asyncio
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from urllib.parse import quote

import httpx
import feedparser
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Query
from dotenv import load_dotenv

from deps import get_current_user
from core.tenant import get_current_tenant_id, DEFAULT_TENANT_ID
from database import db

load_dotenv()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/water-intelligence", tags=["Water Intelligence"])
public_router = APIRouter(prefix="/public", tags=["Water Intelligence Public"])

ARTICLES = "water_news_articles"
SETTINGS = "water_news_settings"
RUNS = "water_news_runs"

MANAGE_ROLES = {"ceo", "director", "admin", "system admin", "vice president",
                "head of business", "marketing manager"}

DEFAULT_TOPICS = [
    "Atmospheric Water Generation", "drinking water quality", "bottled water industry",
    "water scarcity", "groundwater depletion", "water sustainability",
    "water technology innovation", "water purification", "alkaline water",
    "hotel sustainability water", "plastic-free glass bottle initiative",
    "government water regulation India", "water industry investment",
]

CATEGORIES = ["AWG", "Drinking Water", "Bottled Water", "Water Scarcity", "Groundwater",
              "Sustainability", "Water Technology", "Purification", "Alkaline Water",
              "Hospitality", "Plastic-Free", "Regulation", "Investment", "Other"]

STATUSES = ["discovered", "ai_reviewed", "pending_approval", "approved", "published", "rejected"]

IST = timezone(timedelta(hours=5, minutes=30))


def _now():
    return datetime.now(timezone.utc).isoformat()


def _can_manage(user: dict) -> bool:
    return (user.get("role") or "").strip().lower() in MANAGE_ROLES


def _dedupe_hash(title: str) -> str:
    words = re.findall(r"[a-z0-9]+", (title or "").lower())
    stop = {"the", "a", "an", "of", "in", "on", "for", "to", "and", "is", "at", "by", "with", "as", "its", "it"}
    sig = sorted(w for w in words if w not in stop and len(w) > 2)[:12]
    return hashlib.sha1(" ".join(sig).encode()).hexdigest()


async def _get_settings(tenant_id: str) -> dict:
    doc = await db[SETTINGS].find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        doc = {
            "id": str(uuid.uuid4()), "tenant_id": tenant_id,
            "topics": DEFAULT_TOPICS, "custom_feeds": [],
            "min_score": 70, "schedule_enabled": True,
            "schedule_hour": 5, "schedule_minute": 30,
            "max_articles_per_run": 40, "auto_publish": False,
            "last_scheduled_run_date": None,
            "created_at": _now(), "updated_at": _now(),
        }
        await db[SETTINGS].insert_one({**doc})
        doc.pop("_id", None)
    return doc


# ─────────────────────────── Collection ───────────────────────────

async def _fetch_feed(client: httpx.AsyncClient, url: str, topic: str) -> List[dict]:
    try:
        r = await client.get(url, timeout=20, follow_redirects=True,
                             headers={"User-Agent": "Mozilla/5.0 (NylaWaterIntelligence/1.0)"})
        if r.status_code != 200:
            return []
        parsed = feedparser.parse(r.content)
        out = []
        for e in parsed.entries[:25]:
            title = (e.get("title") or "").strip()
            link = (e.get("link") or "").strip()
            if not title or not link:
                continue
            source = ""
            if e.get("source") and isinstance(e["source"], dict):
                source = e["source"].get("title") or ""
            if not source:
                source = (parsed.feed.get("title") or "").replace(" - Google News", "").strip()
            pub = ""
            if e.get("published_parsed"):
                try:
                    pub = datetime(*e.published_parsed[:6], tzinfo=timezone.utc).isoformat()
                except Exception:
                    pub = e.get("published") or ""
            snippet = re.sub(r"<[^>]+>", " ", e.get("summary") or e.get("description") or "")
            out.append({
                "source_title": title, "source_url": link, "source_name": source,
                "source_published_at": pub, "snippet": snippet.strip()[:600], "topic": topic,
            })
        return out
    except Exception as ex:
        logger.warning(f"WaterIntel feed fetch failed {url}: {ex}")
        return []


async def _collect(settings: dict) -> List[dict]:
    urls = []
    for topic in settings.get("topics") or []:
        q = quote(f"{topic} when:2d")
        urls.append((f"https://news.google.com/rss/search?q={q}&hl=en-IN&gl=IN&ceid=IN:en", topic))
    for feed in settings.get("custom_feeds") or []:
        if feed.get("url"):
            urls.append((feed["url"], feed.get("name") or "Custom feed"))
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[_fetch_feed(client, u, t) for u, t in urls])
    items = [it for batch in results for it in batch]
    return items


# ─────────────────────────── AI engine ───────────────────────────

AI_SYSTEM = """You are the Water Intelligence analyst for Nyla Air Water, a premium Indian company producing drinking water from air (Atmospheric Water Generation) in glass bottles for hotels and hospitality.
You evaluate news items for a curated "Water Intelligence" section on the company website.
You MUST reply with a valid JSON array only — no markdown, no commentary."""

AI_PROMPT = """Evaluate each news item below for the Water Intelligence feed.
For EVERY item return a JSON object with:
- "index": the item number given
- "relevance_score": 0-100 (how relevant/valuable for readers interested in water industry, AWG, sustainability, hospitality water, water tech, regulation, investments). Score below 40 for generic mentions of water (sports, movies, unrelated politics, water parks, accidents unless about water supply).
- "category": one of {categories}
- "region": country or region the story is about (e.g. "India", "Global", "USA"). Use "Global" if unclear.
- "headline": an original, crisp headline (max 90 chars) — do NOT copy the source headline verbatim
- "summary": 2-3 short original paragraphs (separated by \\n\\n) written in your own words, grounded ONLY in the provided title/snippet. Never invent specific numbers or quotes not present in the text.
- "why_it_matters": 1-2 sentences on why this matters for the water/hospitality/sustainability industry
- "keywords": 3-6 lowercase keywords

Return a JSON array with one object per item, same order.

ITEMS:
{items}"""


async def _ai_review_batch(batch: List[dict]) -> List[dict]:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY missing")
    items_text = "\n\n".join(
        f"[{i}] TITLE: {a['source_title']}\nSOURCE: {a.get('source_name') or 'unknown'}\nSNIPPET: {a.get('snippet') or '(none)'}"
        for i, a in enumerate(batch)
    )
    chat = LlmChat(
        api_key=api_key,
        session_id=f"water-intel-{uuid.uuid4()}",
        system_message=AI_SYSTEM,
    ).with_model("openai", "gpt-5.5")
    prompt = AI_PROMPT.replace("{categories}", json.dumps(CATEGORIES)).replace("{items}", items_text)
    resp = await chat.send_message(UserMessage(text=prompt))
    text = resp if isinstance(resp, str) else str(resp)
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass
    m = re.search(r"\[.*\]", text, re.S)
    if not m:
        raise ValueError(f"AI returned no JSON array: {text[:200]}")
    return json.loads(m.group(0))


# ─────────────────────────── Pipeline ───────────────────────────

async def run_pipeline(tenant_id: str, trigger: str = "manual", triggered_by: Optional[str] = None) -> dict:
    settings = await _get_settings(tenant_id)
    run = {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "trigger": trigger,
        "triggered_by": triggered_by, "status": "running",
        "started_at": _now(), "finished_at": None,
        "fetched": 0, "duplicates": 0, "reviewed": 0, "kept": 0,
        "rejected_low_score": 0, "errors": [],
    }
    await db[RUNS].insert_one({**run})

    try:
        items = await _collect(settings)
        run["fetched"] = len(items)

        # Deduplicate within batch and against recent DB records
        seen_hashes, seen_urls, fresh = set(), set(), []
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        existing = await db[ARTICLES].find(
            {"tenant_id": tenant_id, "created_at": {"$gte": cutoff}},
            {"_id": 0, "dedupe_hash": 1, "source_url": 1}
        ).to_list(5000)
        for e in existing:
            seen_hashes.add(e.get("dedupe_hash"))
            seen_urls.add(e.get("source_url"))
        for it in items:
            h = _dedupe_hash(it["source_title"])
            if h in seen_hashes or it["source_url"] in seen_urls:
                run["duplicates"] += 1
                continue
            seen_hashes.add(h)
            seen_urls.add(it["source_url"])
            it["dedupe_hash"] = h
            fresh.append(it)

        max_n = int(settings.get("max_articles_per_run") or 40)
        fresh = fresh[:max_n]
        min_score = int(settings.get("min_score") or 70)
        await db[RUNS].update_one({"id": run["id"]}, {"$set": {"fetched": run["fetched"], "duplicates": run["duplicates"]}})

        # AI review in batches of 8
        for i in range(0, len(fresh), 8):
            batch = fresh[i:i + 8]
            try:
                reviews = await _ai_review_batch(batch)
            except Exception as ex:
                run["errors"].append(f"AI batch {i // 8 + 1}: {ex}")
                logger.error(f"WaterIntel AI batch failed: {ex}")
                continue
            by_index = {r.get("index"): r for r in reviews if isinstance(r, dict)}
            for j, art in enumerate(batch):
                rv = by_index.get(j)
                if not rv:
                    run["errors"].append(f"AI missing review for item {i + j}")
                    continue
                score = max(0, min(100, int(rv.get("relevance_score") or 0)))
                keep = score >= min_score
                doc = {
                    "id": str(uuid.uuid4()), "tenant_id": tenant_id, "run_id": run["id"],
                    "status": "pending_approval" if keep else "rejected",
                    "rejected_reason": None if keep else "low_relevance",
                    "relevance_score": score,
                    "category": rv.get("category") if rv.get("category") in CATEGORIES else "Other",
                    "region": (rv.get("region") or "Global")[:60],
                    "headline": (rv.get("headline") or art["source_title"])[:160],
                    "summary": rv.get("summary") or "",
                    "why_it_matters": rv.get("why_it_matters") or "",
                    "keywords": [str(k)[:40] for k in (rv.get("keywords") or [])][:8],
                    "source_title": art["source_title"], "source_name": art["source_name"],
                    "source_url": art["source_url"], "source_published_at": art["source_published_at"],
                    "topic": art["topic"], "dedupe_hash": art["dedupe_hash"],
                    "approved_by": None, "approved_at": None, "published_at": None,
                    "created_at": _now(), "updated_at": _now(),
                }
                await db[ARTICLES].insert_one({**doc})
                run["reviewed"] += 1
                if keep:
                    run["kept"] += 1
                else:
                    run["rejected_low_score"] += 1
            await db[RUNS].update_one({"id": run["id"]}, {"$set": {
                "reviewed": run["reviewed"], "kept": run["kept"],
                "rejected_low_score": run["rejected_low_score"], "errors": run["errors"],
            }})

        run["status"] = "completed"
    except Exception as ex:
        run["status"] = "failed"
        run["errors"].append(str(ex))
        logger.error(f"WaterIntel run failed: {ex}")

    run["finished_at"] = _now()
    await db[RUNS].update_one({"id": run["id"]}, {"$set": {k: v for k, v in run.items() if k != "_id"}})
    return run


# ─────────────────────────── Scheduler ───────────────────────────

async def scheduler_loop():
    """Runs the pipeline once per day at the configured IST time."""
    await asyncio.sleep(20)
    # Mark runs orphaned by a process restart as interrupted
    try:
        await db[RUNS].update_many(
            {"status": "running"},
            {"$set": {"status": "failed", "finished_at": _now()},
             "$push": {"errors": "interrupted by server restart"}}
        )
    except Exception:
        pass
    while True:
        try:
            tenant_id = DEFAULT_TENANT_ID
            settings = await _get_settings(tenant_id)
            if settings.get("schedule_enabled"):
                now_ist = datetime.now(IST)
                today = now_ist.strftime("%Y-%m-%d")
                target_minutes = int(settings.get("schedule_hour") or 5) * 60 + int(settings.get("schedule_minute") or 30)
                now_minutes = now_ist.hour * 60 + now_ist.minute
                if now_minutes >= target_minutes and settings.get("last_scheduled_run_date") != today:
                    await db[SETTINGS].update_one(
                        {"tenant_id": tenant_id},
                        {"$set": {"last_scheduled_run_date": today, "updated_at": _now()}}
                    )
                    logger.info("WaterIntel scheduled run starting")
                    await run_pipeline(tenant_id, trigger="scheduled")
        except Exception as ex:
            logger.error(f"WaterIntel scheduler error: {ex}")
        await asyncio.sleep(60)


# ─────────────────────────── CRM endpoints ───────────────────────────

class SettingsIn(BaseModel):
    topics: Optional[List[str]] = None
    custom_feeds: Optional[List[dict]] = None
    min_score: Optional[int] = None
    schedule_enabled: Optional[bool] = None
    schedule_hour: Optional[int] = None
    schedule_minute: Optional[int] = None
    max_articles_per_run: Optional[int] = None


class ArticleEdit(BaseModel):
    headline: Optional[str] = None
    summary: Optional[str] = None
    why_it_matters: Optional[str] = None
    category: Optional[str] = None
    region: Optional[str] = None
    keywords: Optional[List[str]] = None


class TransitionIn(BaseModel):
    action: str  # approve | reject | publish | unpublish | resubmit
    reason: Optional[str] = None


@router.get("")
async def list_articles(
    status: Optional[str] = None, category: Optional[str] = None,
    region: Optional[str] = None, search: Optional[str] = None,
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if status and status != "all":
        q["status"] = status
    if category:
        q["category"] = category
    if region:
        q["region"] = {"$regex": re.escape(region), "$options": "i"}
    if search:
        q["$or"] = [
            {"headline": {"$regex": re.escape(search), "$options": "i"}},
            {"source_title": {"$regex": re.escape(search), "$options": "i"}},
            {"keywords": {"$regex": re.escape(search), "$options": "i"}},
        ]
    total = await db[ARTICLES].count_documents(q)
    docs = await db[ARTICLES].find(q, {"_id": 0}).sort([("relevance_score", -1), ("created_at", -1)]) \
        .skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"articles": docs, "total": total, "page": page, "limit": limit}


@router.get("/stats")
async def stats(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    pipeline = [{"$match": {"tenant_id": tenant_id}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]
    counts = {r["_id"]: r["n"] async for r in db[ARTICLES].aggregate(pipeline)}
    last_run = await db[RUNS].find_one({"tenant_id": tenant_id}, {"_id": 0}, sort=[("started_at", -1)])
    return {"counts": counts, "last_run": last_run, "categories": CATEGORIES}


@router.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    return await _get_settings(get_current_tenant_id())


@router.put("/settings")
async def update_settings(payload: SettingsIn, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    tenant_id = get_current_tenant_id()
    await _get_settings(tenant_id)
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "schedule_hour" in upd:
        upd["schedule_hour"] = max(0, min(23, int(upd["schedule_hour"])))
    if "schedule_minute" in upd:
        upd["schedule_minute"] = max(0, min(59, int(upd["schedule_minute"])))
    if "min_score" in upd:
        upd["min_score"] = max(0, min(100, int(upd["min_score"])))
    upd["updated_at"] = _now()
    await db[SETTINGS].update_one({"tenant_id": tenant_id}, {"$set": upd})
    return await _get_settings(tenant_id)


@router.post("/run")
async def run_now(current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    tenant_id = get_current_tenant_id()
    running = await db[RUNS].find_one({"tenant_id": tenant_id, "status": "running"}, {"_id": 0, "id": 1, "started_at": 1})
    if running:
        started = running.get("started_at") or ""
        if started > (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat():
            raise HTTPException(status_code=409, detail="A collection run is already in progress")
    asyncio.create_task(run_pipeline(tenant_id, trigger="manual", triggered_by=current_user.get("name")))
    return {"started": True}


@router.get("/runs")
async def list_runs(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    runs = await db[RUNS].find({"tenant_id": tenant_id}, {"_id": 0}).sort("started_at", -1).limit(20).to_list(20)
    return {"runs": runs}


@router.get("/{article_id}")
async def get_article(article_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db[ARTICLES].find_one({"id": article_id, "tenant_id": get_current_tenant_id()}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Article not found")
    return doc


@router.put("/{article_id}")
async def edit_article(article_id: str, payload: ArticleEdit, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    tenant_id = get_current_tenant_id()
    doc = await db[ARTICLES].find_one({"id": article_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Article not found")
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "category" in upd and upd["category"] not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    upd["updated_at"] = _now()
    await db[ARTICLES].update_one({"id": article_id, "tenant_id": tenant_id}, {"$set": upd})
    return await db[ARTICLES].find_one({"id": article_id, "tenant_id": tenant_id}, {"_id": 0})


@router.post("/{article_id}/transition")
async def transition(article_id: str, payload: TransitionIn, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    tenant_id = get_current_tenant_id()
    doc = await db[ARTICLES].find_one({"id": article_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Article not found")

    action = payload.action
    status = doc["status"]
    allowed = {
        "approve": {"pending_approval", "rejected"},
        "reject": {"pending_approval", "approved", "published"},
        "publish": {"approved", "pending_approval"},
        "unpublish": {"published"},
        "resubmit": {"rejected"},
    }
    if action not in allowed:
        raise HTTPException(status_code=400, detail="Unknown action")
    if status not in allowed[action]:
        raise HTTPException(status_code=400, detail=f"Cannot {action} an article in state '{status}'")

    upd = {"updated_at": _now()}
    if action == "approve":
        upd.update({"status": "approved", "approved_by": current_user.get("name"),
                    "approved_at": _now(), "rejected_reason": None})
    elif action == "reject":
        upd.update({"status": "rejected", "rejected_reason": payload.reason or "manual", "published_at": None})
    elif action == "publish":
        upd.update({"status": "published", "published_at": _now(),
                    "approved_by": doc.get("approved_by") or current_user.get("name"),
                    "approved_at": doc.get("approved_at") or _now(), "rejected_reason": None})
    elif action == "unpublish":
        upd.update({"status": "approved", "published_at": None})
    elif action == "resubmit":
        upd.update({"status": "pending_approval", "rejected_reason": None})

    await db[ARTICLES].update_one({"id": article_id, "tenant_id": tenant_id}, {"$set": upd})
    return await db[ARTICLES].find_one({"id": article_id, "tenant_id": tenant_id}, {"_id": 0})


@router.delete("/{article_id}")
async def delete_article(article_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db[ARTICLES].delete_one({"id": article_id, "tenant_id": get_current_tenant_id()})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"deleted": True}


# ─────────────────────────── Public website API ───────────────────────────

PUBLIC_FIELDS = {"_id": 0, "id": 1, "headline": 1, "summary": 1, "why_it_matters": 1,
                 "category": 1, "region": 1, "keywords": 1, "source_name": 1,
                 "source_url": 1, "source_published_at": 1, "published_at": 1,
                 "relevance_score": 1}


@public_router.get("/water-news")
async def public_water_news(
    category: Optional[str] = None, region: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1), limit: int = Query(12, ge=1, le=50),
):
    tenant_id = DEFAULT_TENANT_ID
    query = {"tenant_id": tenant_id, "status": "published"}
    if category:
        query["category"] = category
    if region:
        query["region"] = {"$regex": re.escape(region), "$options": "i"}
    if q:
        query["$or"] = [
            {"headline": {"$regex": re.escape(q), "$options": "i"}},
            {"summary": {"$regex": re.escape(q), "$options": "i"}},
            {"keywords": {"$regex": re.escape(q), "$options": "i"}},
        ]
    total = await db[ARTICLES].count_documents(query)
    docs = await db[ARTICLES].find(query, PUBLIC_FIELDS).sort("published_at", -1) \
        .skip((page - 1) * limit).limit(limit).to_list(limit)
    cats = await db[ARTICLES].distinct("category", {"tenant_id": tenant_id, "status": "published"})
    return {"articles": docs, "total": total, "page": page, "limit": limit, "categories": sorted(cats)}
