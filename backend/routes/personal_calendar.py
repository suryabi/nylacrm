"""
Personal Calendar Module
- Aggregates the user's CRM meetings (zoom-enabled) and meeting_minutes entries
- Optionally pulls events from Google Calendar (via OAuth) and pushes new CRM
  meetings into Google Calendar when the user is connected.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db, get_tenant_db

router = APIRouter(prefix="/personal-calendar", tags=["Personal Calendar"])

# OAuth + Calendar API constants
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID") or os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET") or os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")
BACKEND_URL = os.environ.get("BACKEND_PUBLIC_URL", "")  # set by main app at startup
SCOPES = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/userinfo.email", "openid"]
AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
USERINFO_URI = "https://www.googleapis.com/oauth2/v2/userinfo"


def _redirect_uri() -> str:
    base = os.environ.get("BACKEND_PUBLIC_URL") or os.environ.get("REACT_APP_BACKEND_URL", "")
    return f"{base.rstrip('/')}/api/personal-calendar/google/callback"


def _is_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


# ──────────────────────────────────────────────
# Token storage helpers (per-user, in user_google_tokens collection on global db)
# ──────────────────────────────────────────────

async def _save_tokens(user_id: str, tokens: dict, google_email: str):
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)))).isoformat()
    payload = {
        "user_id": user_id,
        "google_email": google_email,
        "access_token": tokens.get("access_token"),
        "expires_at": expires_at,
        "scope": tokens.get("scope"),
        "token_type": tokens.get("token_type", "Bearer"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if tokens.get("refresh_token"):
        payload["refresh_token"] = tokens["refresh_token"]
    await db.user_google_tokens.update_one(
        {"user_id": user_id},
        {"$set": payload, "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )


async def _get_tokens(user_id: str) -> Optional[dict]:
    doc = await db.user_google_tokens.find_one({"user_id": user_id}, {"_id": 0})
    return doc


async def _refresh_if_needed(user_id: str) -> Optional[dict]:
    doc = await _get_tokens(user_id)
    if not doc:
        return None
    expires_at = doc.get("expires_at")
    needs_refresh = False
    if not expires_at:
        needs_refresh = True
    else:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if exp <= datetime.now(timezone.utc) + timedelta(seconds=60):
                needs_refresh = True
        except Exception:
            needs_refresh = True

    if needs_refresh and doc.get("refresh_token"):
        resp = requests.post(TOKEN_URI, data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": doc["refresh_token"],
            "grant_type": "refresh_token",
        }, timeout=15)
        if resp.status_code == 200:
            new_tokens = resp.json()
            new_tokens["refresh_token"] = doc["refresh_token"]  # preserve
            await _save_tokens(user_id, new_tokens, doc.get("google_email", ""))
            doc = await _get_tokens(user_id)
        else:
            return None
    return doc


# ──────────────────────────────────────────────
# Connection status / OAuth flow
# ──────────────────────────────────────────────

@router.get("/google/status")
async def google_status(current_user: dict = Depends(get_current_user)):
    if not _is_configured():
        return {"connected": False, "configured": False}
    doc = await _get_tokens(current_user["id"])
    return {
        "connected": bool(doc),
        "configured": True,
        "google_email": doc.get("google_email") if doc else None,
    }


@router.get("/google/connect")
async def google_connect(current_user: dict = Depends(get_current_user)):
    if not _is_configured():
        raise HTTPException(status_code=503, detail="Google Calendar integration not configured. Admin must set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.")
    state = f"{current_user['id']}:{get_current_tenant_id()}"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "include_granted_scopes": "true",
    }
    from urllib.parse import urlencode
    url = f"{AUTH_URI}?{urlencode(params)}"
    return {"authorization_url": url}


@router.get("/google/callback")
async def google_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Public callback (no auth) — receives code from Google, exchanges, stores tokens, redirects to UI."""
    frontend = os.environ.get("FRONTEND_URL") or os.environ.get("REACT_APP_BACKEND_URL", "")
    target_base = frontend.rstrip("/") + "/personal-calendar"

    if error:
        return RedirectResponse(f"{target_base}?google=error&reason={error}")

    if not code or not state or ":" not in state:
        return RedirectResponse(f"{target_base}?google=error&reason=missing_code")

    user_id, _tenant_id = state.split(":", 1)

    # Exchange code for tokens via direct POST (avoids scope mismatch)
    try:
        resp = requests.post(TOKEN_URI, data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": _redirect_uri(),
            "grant_type": "authorization_code",
        }, timeout=15)
        if resp.status_code != 200:
            return RedirectResponse(f"{target_base}?google=error&reason=token_exchange_failed")
        tokens = resp.json()

        # Get user email
        ui = requests.get(USERINFO_URI, headers={"Authorization": f"Bearer {tokens['access_token']}"}, timeout=15).json()
        google_email = ui.get("email", "")

        await _save_tokens(user_id, tokens, google_email)
        return RedirectResponse(f"{target_base}?google=connected&email={google_email}")
    except Exception as e:
        return RedirectResponse(f"{target_base}?google=error&reason=exception")


@router.post("/google/disconnect")
async def google_disconnect(current_user: dict = Depends(get_current_user)):
    await db.user_google_tokens.delete_one({"user_id": current_user["id"]})
    return {"disconnected": True}


# ──────────────────────────────────────────────
# Aggregated events endpoint
# ──────────────────────────────────────────────

def _safe_date(d: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(d.replace("Z", "+00:00"))
    except Exception:
        try:
            return datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None


@router.get("/events")
async def list_events(
    start_date: str = Query(..., description="YYYY-MM-DD inclusive"),
    end_date: str = Query(..., description="YYYY-MM-DD inclusive"),
    current_user: dict = Depends(get_current_user),
):
    """Return CRM meetings + meeting_minutes + Google Calendar events (if connected) within range."""
    tdb = get_tenant_db()
    tenant_id = get_current_tenant_id()
    user_id = current_user["id"]
    user_email = current_user.get("email", "")

    events = []

    # 1) CRM meetings (Zoom-enabled, with time)
    meeting_query = {
        "tenant_id": tenant_id,
        "meeting_date": {"$gte": start_date, "$lte": end_date},
        "$or": [
            {"organizer_id": user_id},
            {"attendees": user_email},
        ],
    }
    meetings = await tdb.meetings.find(meeting_query, {"_id": 0}).to_list(500)
    for m in meetings:
        events.append({
            "id": f"meeting:{m.get('id')}",
            "source": "crm_meeting",
            "title": m.get("title", "Meeting"),
            "description": m.get("description"),
            "start": f"{m.get('meeting_date')}T{m.get('start_time', '09:00')}:00",
            "end": f"{m.get('meeting_date')}T{m.get('end_time') or m.get('start_time', '10:00')}:00",
            "all_day": False,
            "location": m.get("location"),
            "meeting_link": m.get("meeting_link"),
            "status": m.get("status", "scheduled"),
            "color": "sky",
            "ref_id": m.get("id"),
        })

    # 2) Meeting minutes (date-only, all-day) — where user is participant or creator
    mm_query = {
        "tenant_id": tenant_id,
        "date": {"$gte": start_date, "$lte": end_date},
        "$or": [
            {"created_by": user_id},
            {"participants.id": user_id},
        ],
    }
    mm_list = await db.meeting_minutes.find(mm_query, {"_id": 0}).to_list(500)
    for mm in mm_list:
        events.append({
            "id": f"minutes:{mm.get('id')}",
            "source": "meeting_minutes",
            "title": mm.get("title", "Minutes"),
            "description": ", ".join(mm.get("purpose", []) or []),
            "start": mm.get("date"),
            "end": mm.get("date"),
            "all_day": True,
            "color": "violet",
            "ref_id": mm.get("id"),
        })

    # 3) Google Calendar events (if connected)
    google_status_obj = {"connected": False, "configured": _is_configured()}
    if _is_configured():
        token_doc = await _refresh_if_needed(user_id)
        if token_doc:
            google_status_obj["connected"] = True
            google_status_obj["google_email"] = token_doc.get("google_email")
            try:
                # ISO timestamps for Calendar API (timeMin/timeMax)
                time_min = f"{start_date}T00:00:00Z"
                time_max = f"{end_date}T23:59:59Z"
                gc_resp = requests.get(
                    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                    headers={"Authorization": f"Bearer {token_doc['access_token']}"},
                    params={
                        "timeMin": time_min,
                        "timeMax": time_max,
                        "singleEvents": "true",
                        "orderBy": "startTime",
                        "maxResults": 250,
                    },
                    timeout=15,
                )
                if gc_resp.status_code == 200:
                    items = gc_resp.json().get("items", [])
                    for it in items:
                        # Skip events that we created from this CRM (we tag them with extendedProperties.private.crm_meeting_id)
                        ext = (it.get("extendedProperties") or {}).get("private") or {}
                        if ext.get("crm_meeting_id"):
                            continue  # avoid duplicates with CRM meetings
                        s = it.get("start") or {}
                        e = it.get("end") or {}
                        all_day = "date" in s and "dateTime" not in s
                        events.append({
                            "id": f"google:{it.get('id')}",
                            "source": "google",
                            "title": it.get("summary", "(no title)"),
                            "description": it.get("description"),
                            "start": s.get("dateTime") or s.get("date"),
                            "end": e.get("dateTime") or e.get("date"),
                            "all_day": all_day,
                            "location": it.get("location"),
                            "meeting_link": (it.get("hangoutLink") or it.get("htmlLink")),
                            "color": "rose",
                            "ref_id": it.get("id"),
                        })
                elif gc_resp.status_code == 401:
                    google_status_obj["connected"] = False
                    google_status_obj["error"] = "token_invalid"
            except Exception as e:
                google_status_obj["error"] = "fetch_failed"

    # Sort events by start
    def _key(ev):
        v = ev.get("start") or ""
        return v
    events.sort(key=_key)

    return {
        "events": events,
        "google": google_status_obj,
        "range": {"start_date": start_date, "end_date": end_date},
    }


# ──────────────────────────────────────────────
# Push CRM meeting → Google Calendar
# ──────────────────────────────────────────────

@router.post("/google/push-meeting/{meeting_id}")
async def push_meeting_to_google(meeting_id: str, current_user: dict = Depends(get_current_user)):
    """Insert (or update) a CRM meeting as a Google Calendar event for the connected user."""
    if not _is_configured():
        raise HTTPException(status_code=503, detail="Google Calendar not configured")
    token_doc = await _refresh_if_needed(current_user["id"])
    if not token_doc:
        raise HTTPException(status_code=400, detail="Not connected to Google Calendar")

    tdb = get_tenant_db()
    m = await tdb.meetings.find_one({"id": meeting_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")

    start_dt = f"{m['meeting_date']}T{m['start_time']}:00"
    end_dt = f"{m['meeting_date']}T{m.get('end_time') or m['start_time']}:00"

    body = {
        "summary": m.get("title", "Meeting"),
        "description": m.get("description") or "",
        "start": {"dateTime": start_dt, "timeZone": "Asia/Kolkata"},
        "end": {"dateTime": end_dt, "timeZone": "Asia/Kolkata"},
        "location": m.get("location") or m.get("meeting_link") or "",
        "extendedProperties": {"private": {"crm_meeting_id": meeting_id}},
    }
    if m.get("attendees"):
        body["attendees"] = [{"email": e} for e in m["attendees"] if e]

    # Check if already pushed (search by extended property)
    existing_id = m.get("google_event_id")
    headers = {"Authorization": f"Bearer {token_doc['access_token']}", "Content-Type": "application/json"}

    if existing_id:
        resp = requests.put(
            f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{existing_id}",
            headers=headers, json=body, timeout=15,
        )
    else:
        resp = requests.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers=headers, json=body, timeout=15,
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Google Calendar API error: {resp.text[:200]}")

    event = resp.json()
    await tdb.meetings.update_one(
        {"id": meeting_id},
        {"$set": {"google_event_id": event["id"], "google_event_link": event.get("htmlLink")}},
    )
    return {"google_event_id": event["id"], "google_event_link": event.get("htmlLink")}
