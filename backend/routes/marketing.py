"""
Marketing Module - Calendar, Post Planning, and Master Data
Provides endpoints for managing marketing content calendar and social media planning.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db
import uuid

router = APIRouter()

# ---- Auto-Events (Global + Indian) ----
AUTO_EVENTS = [
    {"date": "01-01", "name": "New Year", "type": "global"},
    {"date": "01-13", "name": "Lohri", "type": "indian"},
    {"date": "01-14", "name": "Makar Sankranti / Pongal", "type": "indian"},
    {"date": "01-26", "name": "Republic Day", "type": "indian"},
    {"date": "02-14", "name": "Valentine's Day", "type": "global"},
    {"date": "03-08", "name": "International Women's Day", "type": "global"},
    {"date": "03-22", "name": "World Water Day", "type": "global"},
    {"date": "03-31", "name": "Holi", "type": "indian"},
    {"date": "04-07", "name": "World Health Day", "type": "global"},
    {"date": "04-14", "name": "Ambedkar Jayanti / Baisakhi", "type": "indian"},
    {"date": "04-22", "name": "Earth Day", "type": "global"},
    {"date": "05-01", "name": "International Workers' Day", "type": "global"},
    {"date": "05-11", "name": "Mother's Day", "type": "global"},
    {"date": "06-05", "name": "World Environment Day", "type": "global"},
    {"date": "06-15", "name": "Father's Day", "type": "global"},
    {"date": "06-21", "name": "International Yoga Day", "type": "global"},
    {"date": "07-04", "name": "US Independence Day", "type": "global"},
    {"date": "08-15", "name": "Independence Day", "type": "indian"},
    {"date": "08-19", "name": "World Photography Day", "type": "global"},
    {"date": "09-05", "name": "Teachers' Day", "type": "indian"},
    {"date": "09-27", "name": "World Tourism Day", "type": "global"},
    {"date": "10-02", "name": "Gandhi Jayanti", "type": "indian"},
    {"date": "10-31", "name": "Halloween", "type": "global"},
    {"date": "11-01", "name": "Diwali", "type": "indian"},
    {"date": "11-14", "name": "Children's Day", "type": "indian"},
    {"date": "11-27", "name": "Thanksgiving", "type": "global"},
    {"date": "12-25", "name": "Christmas", "type": "global"},
    {"date": "12-31", "name": "New Year's Eve", "type": "global"},
]

DEFAULT_CATEGORIES = [
    {"name": "Health", "color": "#A8E6CF"},
    {"name": "Water", "color": "#4EA8DE"},
    {"name": "Luxury", "color": "#C084FC"},
    {"name": "Sustainability", "color": "#34D399"},
    {"name": "Lifestyle", "color": "#FB923C"},
    {"name": "Brand", "color": "#FF6B6B"},
    {"name": "Product", "color": "#FDE74C"},
    {"name": "Event", "color": "#818CF8"},
]

DEFAULT_PLATFORMS = [
    {"name": "LinkedIn", "key": "linkedin", "color": "#0A66C2", "enabled": True},
    {"name": "WhatsApp", "key": "whatsapp", "color": "#25D366", "enabled": True},
    {"name": "YouTube", "key": "youtube", "color": "#FF0000", "enabled": True},
    {"name": "Instagram", "key": "instagram", "color": "#E1306C", "enabled": True},
    {"name": "Facebook", "key": "facebook", "color": "#1877F2", "enabled": True},
]

VALID_STATUSES = ["draft", "review", "scheduled", "published"]
VALID_CONTENT_TYPES = ["reel", "image", "video", "other"]


# ---- Events ----
@router.get("/events")
async def get_events(month: int = None, year: int = None, current_user: dict = Depends(get_current_user)):
    """Get auto-events, optionally filtered by month."""
    tenant_id = get_current_tenant_id()

    # Get custom events
    query = {"tenant_id": tenant_id}
    custom_events = await db.marketing_events.find(query, {"_id": 0}).to_list(500)

    events = list(AUTO_EVENTS)
    for ce in custom_events:
        events.append({"date": ce.get("date", ""), "name": ce.get("name", ""), "type": "custom", "id": ce.get("id")})

    if month:
        month_str = f"{month:02d}"
        events = [e for e in events if e["date"].startswith(month_str)]

    return events


@router.post("/events")
async def create_custom_event(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a custom event."""
    tenant_id = get_current_tenant_id()
    event = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "date": data.get("date", ""),
        "name": data.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.marketing_events.insert_one(event)
    event.pop("_id", None)
    return event


@router.delete("/events/{event_id}")
async def delete_custom_event(event_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    result = await db.marketing_events.delete_one({"id": event_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}


# ---- Categories (Master Data) ----
@router.get("/categories")
async def get_categories(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    cats = await db.marketing_categories.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(100)
    if not cats:
        # Seed defaults
        for c in DEFAULT_CATEGORIES:
            doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, **c, "created_at": datetime.now(timezone.utc).isoformat()}
            await db.marketing_categories.insert_one(doc)
        cats = await db.marketing_categories.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(100)
    return cats


@router.post("/categories")
async def create_category(data: dict, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    cat = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": data.get("name", ""),
        "color": data.get("color", "#FF6B6B"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.marketing_categories.insert_one(cat)
    cat.pop("_id", None)
    return cat


@router.put("/categories/{cat_id}")
async def update_category(cat_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    update = {}
    if "name" in data:
        update["name"] = data["name"]
    if "color" in data:
        update["color"] = data["color"]
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.marketing_categories.update_one({"id": cat_id, "tenant_id": tenant_id}, {"$set": update})
    return {"message": "Category updated"}


@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    result = await db.marketing_categories.delete_one({"id": cat_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}


# ---- Platforms (Master Data) ----
@router.get("/platforms")
async def get_platforms(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    plats = await db.marketing_platforms.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(50)
    if not plats:
        for p in DEFAULT_PLATFORMS:
            doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, **p, "created_at": datetime.now(timezone.utc).isoformat()}
            await db.marketing_platforms.insert_one(doc)
        plats = await db.marketing_platforms.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(50)
    return plats


@router.put("/platforms/{plat_id}")
async def update_platform(plat_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    update = {}
    if "enabled" in data:
        update["enabled"] = data["enabled"]
    if "name" in data:
        update["name"] = data["name"]
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.marketing_platforms.update_one({"id": plat_id, "tenant_id": tenant_id}, {"$set": update})
    return {"message": "Platform updated"}


# ---- Posts (CRUD + Calendar) ----
@router.get("/posts")
async def get_posts(
    month: int = None, year: int = None,
    status: str = None, category: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get posts, optionally filtered by month/year, status, or category."""
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id}

    if month and year:
        start = f"{year}-{month:02d}-01"
        if month == 12:
            end = f"{year + 1}-01-01"
        else:
            end = f"{year}-{month + 1:02d}-01"
        query["post_date"] = {"$gte": start, "$lt": end}

    if status:
        query["status"] = status
    if category:
        query["category"] = category

    posts = await db.marketing_posts.find(query, {"_id": 0}).sort("post_date", 1).to_list(500)
    return posts


@router.get("/posts/{post_id}")
async def get_post(post_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    post = await db.marketing_posts.find_one({"id": post_id, "tenant_id": tenant_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@router.post("/posts")
async def create_post(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a new marketing post."""
    tenant_id = get_current_tenant_id()

    post = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "post_date": data.get("post_date", ""),
        "category": data.get("category", ""),
        "content_type": data.get("content_type", "image"),
        "concept": data.get("concept", ""),
        "message": data.get("message", ""),
        "platforms": data.get("platforms", ["linkedin", "whatsapp", "youtube", "instagram", "facebook"]),
        "platform_links": {},
        "status": data.get("status", "draft"),
        "owner_id": data.get("owner_id", current_user.get("id")),
        "owner_name": data.get("owner_name", current_user.get("name", "")),
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.marketing_posts.insert_one(post)
    post.pop("_id", None)
    return post


@router.put("/posts/{post_id}")
async def update_post(post_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a marketing post."""
    tenant_id = get_current_tenant_id()

    existing = await db.marketing_posts.find_one({"id": post_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Post not found")

    allowed_fields = ["post_date", "category", "content_type", "concept", "message", "platforms", "status", "owner_id", "owner_name", "platform_links"]
    update = {k: v for k, v in data.items() if k in allowed_fields}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = current_user.get("id")

    await db.marketing_posts.update_one({"id": post_id, "tenant_id": tenant_id}, {"$set": update})
    updated = await db.marketing_posts.find_one({"id": post_id, "tenant_id": tenant_id}, {"_id": 0})
    return updated


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    result = await db.marketing_posts.delete_one({"id": post_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    return {"message": "Post deleted"}


@router.put("/posts/{post_id}/status")
async def update_post_status(post_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update only the status of a post (workflow transition)."""
    tenant_id = get_current_tenant_id()
    new_status = data.get("status")
    if new_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {VALID_STATUSES}")

    existing = await db.marketing_posts.find_one({"id": post_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Post not found")

    await db.marketing_posts.update_one(
        {"id": post_id, "tenant_id": tenant_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": current_user.get("id")}}
    )
    return {"message": f"Status updated to {new_status}"}


VALID_ANALYTICS_FIELDS = ["url", "views", "likes", "comments", "shares", "subscribers_added"]


@router.put("/posts/{post_id}/links")
async def update_post_links(post_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update platform links and analytics for a post.
    Expects: { "platform_links": { "linkedin": { "url": "...", "views": 100, ... }, ... } }
    """
    tenant_id = get_current_tenant_id()

    existing = await db.marketing_posts.find_one({"id": post_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Post not found")

    incoming = data.get("platform_links", {})
    if not isinstance(incoming, dict):
        raise HTTPException(status_code=400, detail="platform_links must be an object")

    current_links = existing.get("platform_links", {})
    post_platforms = existing.get("platforms", [])

    # Only accept data for platforms assigned to this post
    for pk, metrics in incoming.items():
        if pk not in post_platforms:
            continue
        if not isinstance(metrics, dict):
            continue
        clean = {}
        for field in VALID_ANALYTICS_FIELDS:
            if field in metrics:
                if field == "url":
                    clean[field] = str(metrics[field])
                else:
                    try:
                        clean[field] = int(metrics[field])
                    except (ValueError, TypeError):
                        clean[field] = 0
        # Merge with existing
        if pk in current_links:
            current_links[pk].update(clean)
        else:
            current_links[pk] = clean

    await db.marketing_posts.update_one(
        {"id": post_id, "tenant_id": tenant_id},
        {"$set": {
            "platform_links": current_links,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.get("id"),
        }}
    )
    updated = await db.marketing_posts.find_one({"id": post_id, "tenant_id": tenant_id}, {"_id": 0})
    return updated


# ---- Calendar Summary ----
@router.get("/calendar")
async def get_calendar_data(month: int = Query(...), year: int = Query(...), current_user: dict = Depends(get_current_user)):
    """Get calendar view data: posts grouped by date + events for the month."""
    tenant_id = get_current_tenant_id()

    start = f"{year}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1}-01-01"
    else:
        end = f"{year}-{month + 1:02d}-01"

    posts = await db.marketing_posts.find(
        {"tenant_id": tenant_id, "post_date": {"$gte": start, "$lt": end}},
        {"_id": 0}
    ).sort("post_date", 1).to_list(500)

    # Group posts by date
    posts_by_date = {}
    for p in posts:
        d = p.get("post_date", "")[:10]
        if d not in posts_by_date:
            posts_by_date[d] = []
        posts_by_date[d].append(p)

    # Get events for this month
    month_str = f"{month:02d}"
    auto = [e for e in AUTO_EVENTS if e["date"].startswith(month_str)]
    # Custom events stored as YYYY-MM-DD — match by month
    custom_query = {
        "tenant_id": tenant_id,
        "$or": [
            {"date": {"$regex": f"^{month_str}-"}},
            {"date": {"$regex": f"^{year}-{month_str}-"}},
        ]
    }
    custom = await db.marketing_events.find(custom_query, {"_id": 0}).to_list(100)
    events = auto + [{"date": c.get("date", ""), "name": c["name"], "type": "custom", "id": c.get("id")} for c in custom]

    # Stats
    total = len(posts)
    by_status = {}
    by_category = {}
    by_content_type = {}
    for p in posts:
        s = p.get("status", "draft")
        by_status[s] = by_status.get(s, 0) + 1
        cat = p.get("category", "Uncategorized")
        if cat:
            by_category[cat] = by_category.get(cat, 0) + 1
        ct = p.get("content_type", "other")
        by_content_type[ct] = by_content_type.get(ct, 0) + 1

    return {
        "posts_by_date": posts_by_date,
        "events": events,
        "stats": {
            "total": total,
            "by_status": by_status,
            "by_category": by_category,
            "by_content_type": by_content_type,
            "events_count": len(events),
        },
        "month": month,
        "year": year,
    }
