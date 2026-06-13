"""
Gmail integration (per-user OAuth 2.0).

Each user connects their own Google Workspace / Gmail mailbox via the standard
authorization-code flow. We store per-user tokens and proxy Gmail REST calls so
users can read threads, send/reply, and see all email exchanged with a given
contact — all inside the CRM.

Mirrors the OAuth patterns already used by routes/personal_calendar.py, but with
a separate OAuth client (GMAIL_CLIENT_ID/SECRET) and token collection.
"""
import os
import base64
import uuid
import asyncio
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional, List
from urllib.parse import urlencode, urlparse

import httpx
import requests
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db

router = APIRouter()

GMAIL_CLIENT_ID = os.environ.get("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.environ.get("GMAIL_CLIENT_SECRET", "")

AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
USERINFO_URI = "https://www.googleapis.com/oauth2/v2/userinfo"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

# Only allow OAuth redirects back to known app origins (prevents open-redirect).
ALLOWED_ORIGIN_SUFFIXES = (".preview.emergentagent.com", ".emergentagent.com")
ALLOWED_ORIGIN_EXACT = {"https://crm.nylaairwater.earth"}


def _is_configured() -> bool:
    return bool(GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET)


def _origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGIN_EXACT:
        return True
    try:
        host = urlparse(origin).netloc
    except Exception:
        return False
    return any(host.endswith(s.lstrip(".")) or host.endswith(s) for s in ALLOWED_ORIGIN_SUFFIXES)


def _resolve_origin(request: Request, redirect_base: Optional[str]) -> str:
    """Pick the app origin to build the redirect URI from (must match a URI
    registered in Google Cloud Console). Prefers the explicit redirect_base
    passed by the frontend, then Origin/Referer headers."""
    candidates = []
    if redirect_base:
        candidates.append(redirect_base.rstrip("/"))
    origin_hdr = request.headers.get("origin")
    if origin_hdr:
        candidates.append(origin_hdr.rstrip("/"))
    referer = request.headers.get("referer")
    if referer:
        p = urlparse(referer)
        candidates.append(f"{p.scheme}://{p.netloc}")
    for c in candidates:
        if _origin_allowed(c):
            return c
    return ""


# ──────────────────────────────────────────────
# Token storage (per user, in `gmail_tokens`)
# ──────────────────────────────────────────────

async def _save_tokens(user_id: str, tenant_id: str, tokens: dict, email: str):
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)))).isoformat()
    payload = {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "email": email,
        "access_token": tokens.get("access_token"),
        "expires_at": expires_at,
        "scope": tokens.get("scope"),
        "token_type": tokens.get("token_type", "Bearer"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if tokens.get("refresh_token"):
        payload["refresh_token"] = tokens["refresh_token"]
    await db.gmail_tokens.update_one(
        {"user_id": user_id},
        {"$set": payload, "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )


async def _get_tokens(user_id: str) -> Optional[dict]:
    return await db.gmail_tokens.find_one({"user_id": user_id}, {"_id": 0})


async def _valid_access_token(user_id: str) -> Optional[str]:
    """Return a valid access token (refreshing if needed), or None if not connected."""
    doc = await _get_tokens(user_id)
    if not doc:
        return None
    expires_at = doc.get("expires_at")
    needs_refresh = True
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            needs_refresh = exp <= datetime.now(timezone.utc) + timedelta(seconds=60)
        except Exception:
            needs_refresh = True
    if needs_refresh:
        if not doc.get("refresh_token"):
            return doc.get("access_token")  # best effort
        resp = requests.post(TOKEN_URI, data={
            "client_id": GMAIL_CLIENT_ID,
            "client_secret": GMAIL_CLIENT_SECRET,
            "refresh_token": doc["refresh_token"],
            "grant_type": "refresh_token",
        }, timeout=15)
        if resp.status_code != 200:
            return None
        new_tokens = resp.json()
        new_tokens["refresh_token"] = doc["refresh_token"]
        await _save_tokens(user_id, doc.get("tenant_id", ""), new_tokens, doc.get("email", ""))
        return new_tokens.get("access_token")
    return doc.get("access_token")


async def _require_token(user_id: str) -> str:
    if not _is_configured():
        raise HTTPException(status_code=400, detail="Gmail integration is not configured by the administrator.")
    token = await _valid_access_token(user_id)
    if not token:
        raise HTTPException(status_code=409, detail="Gmail is not connected. Please connect your Gmail account.")
    return token


# ──────────────────────────────────────────────
# OAuth flow
# ──────────────────────────────────────────────

@router.get("/gmail/status")
async def gmail_status(current_user: dict = Depends(get_current_user)):
    if not _is_configured():
        return {"connected": False, "configured": False}
    doc = await _get_tokens(current_user["id"])
    return {"connected": bool(doc), "configured": True, "email": doc.get("email") if doc else None}


@router.get("/oauth/gmail/login")
async def gmail_login(request: Request, redirect_base: Optional[str] = None,
                      current_user: dict = Depends(get_current_user)):
    if not _is_configured():
        raise HTTPException(status_code=400, detail="Gmail integration not configured. Admin must set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.")
    origin = _resolve_origin(request, redirect_base)
    if not origin:
        raise HTTPException(status_code=400, detail="Could not determine a valid app origin for the OAuth redirect.")
    redirect_uri = f"{origin}/api/oauth/gmail/callback"
    state = uuid.uuid4().hex
    await db.gmail_oauth_states.insert_one({
        "state": state,
        "user_id": current_user["id"],
        "tenant_id": get_current_tenant_id(),
        "redirect_uri": redirect_uri,
        "frontend_base": origin,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    params = {
        "client_id": GMAIL_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "include_granted_scopes": "true",
    }
    return {"authorization_url": f"{AUTH_URI}?{urlencode(params)}"}


@router.get("/oauth/gmail/callback")
async def gmail_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Public callback — exchanges code, stores tokens, redirects back to the Mail page."""
    state_doc = await db.gmail_oauth_states.find_one({"state": state}, {"_id": 0}) if state else None
    frontend_base = (state_doc or {}).get("frontend_base") or os.environ.get("REACT_APP_BACKEND_URL", "")
    target = f"{frontend_base.rstrip('/')}/mail"

    if error:
        return RedirectResponse(f"{target}?gmail=error&reason={error}")
    if not code or not state_doc:
        return RedirectResponse(f"{target}?gmail=error&reason=invalid_state")

    # Reject stale state (>10 min)
    try:
        created = datetime.fromisoformat(state_doc["created_at"].replace("Z", "+00:00"))
        if created < datetime.now(timezone.utc) - timedelta(minutes=10):
            await db.gmail_oauth_states.delete_one({"state": state})
            return RedirectResponse(f"{target}?gmail=error&reason=expired")
    except Exception:
        pass

    try:
        resp = requests.post(TOKEN_URI, data={
            "code": code,
            "client_id": GMAIL_CLIENT_ID,
            "client_secret": GMAIL_CLIENT_SECRET,
            "redirect_uri": state_doc["redirect_uri"],
            "grant_type": "authorization_code",
        }, timeout=20)
        if resp.status_code != 200:
            return RedirectResponse(f"{target}?gmail=error&reason=token_exchange_failed")
        tokens = resp.json()
        ui = requests.get(USERINFO_URI, headers={"Authorization": f"Bearer {tokens['access_token']}"}, timeout=15).json()
        email = ui.get("email", "")
        await _save_tokens(state_doc["user_id"], state_doc.get("tenant_id", ""), tokens, email)
        await db.gmail_oauth_states.delete_one({"state": state})
        return RedirectResponse(f"{target}?gmail=connected&email={email}")
    except Exception:
        return RedirectResponse(f"{target}?gmail=error&reason=exception")


@router.post("/gmail/disconnect")
async def gmail_disconnect(current_user: dict = Depends(get_current_user)):
    await db.gmail_tokens.delete_one({"user_id": current_user["id"]})
    return {"disconnected": True}


# ──────────────────────────────────────────────
# Message parsing helpers
# ──────────────────────────────────────────────

def _b64url_decode(data: str) -> bytes:
    if not data:
        return b""
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _headers_map(payload: dict) -> dict:
    return {h["name"].lower(): h["value"] for h in (payload.get("headers") or [])}


def _extract_bodies(payload: dict):
    """Recursively pull text/plain, text/html bodies and attachment metadata."""
    text_body, html_body = "", ""
    attachments = []

    def walk(part):
        nonlocal text_body, html_body
        mime = part.get("mimeType", "")
        filename = part.get("filename") or ""
        body = part.get("body") or {}
        if filename and body.get("attachmentId"):
            attachments.append({
                "filename": filename,
                "mimeType": mime,
                "size": body.get("size", 0),
                "attachmentId": body["attachmentId"],
            })
        if mime == "text/plain" and body.get("data") and not filename:
            text_body += _b64url_decode(body["data"]).decode("utf-8", errors="replace")
        elif mime == "text/html" and body.get("data") and not filename:
            html_body += _b64url_decode(body["data"]).decode("utf-8", errors="replace")
        for sub in part.get("parts") or []:
            walk(sub)

    walk(payload)
    return text_body, html_body, attachments


def _summarize(msg: dict) -> dict:
    payload = msg.get("payload") or {}
    h = _headers_map(payload)
    label_ids = msg.get("labelIds") or []
    return {
        "id": msg.get("id"),
        "threadId": msg.get("threadId"),
        "from": h.get("from", ""),
        "to": h.get("to", ""),
        "cc": h.get("cc", ""),
        "subject": h.get("subject", "(no subject)"),
        "date": h.get("date", ""),
        "snippet": msg.get("snippet", ""),
        "unread": "UNREAD" in label_ids,
        "starred": "STARRED" in label_ids,
        "labelIds": label_ids,
        "messageIdHeader": h.get("message-id", ""),
    }


async def _fetch_messages_metadata(access_token: str, ids: List[str]) -> List[dict]:
    """Fetch metadata for a list of message ids concurrently, preserving order."""
    headers = {"Authorization": f"Bearer {access_token}"}
    params = {"format": "metadata"}
    meta_headers = [("metadataHeaders", x) for x in ("From", "To", "Cc", "Subject", "Date", "Message-ID")]

    async with httpx.AsyncClient(timeout=20) as client:
        async def one(mid):
            try:
                r = await client.get(
                    f"{GMAIL_API}/messages/{mid}",
                    headers=headers,
                    params=[("format", "metadata"), *meta_headers],
                )
                if r.status_code == 200:
                    return _summarize(r.json())
            except Exception:
                return None
            return None
        results = await asyncio.gather(*[one(i) for i in ids])
    return [r for r in results if r]


# ──────────────────────────────────────────────
# Reading endpoints
# ──────────────────────────────────────────────

@router.get("/gmail/messages")
async def list_messages(
    q: Optional[str] = None,
    label: str = "INBOX",
    page_token: Optional[str] = None,
    max_results: int = Query(20, le=50),
    current_user: dict = Depends(get_current_user),
):
    access_token = await _require_token(current_user["id"])
    params = {"maxResults": max_results}
    if q:
        params["q"] = q
    if label and label != "ALL":
        params["labelIds"] = label
    if page_token:
        params["pageToken"] = page_token

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{GMAIL_API}/messages", headers={"Authorization": f"Bearer {access_token}"}, params=params)
    if r.status_code == 401:
        raise HTTPException(status_code=409, detail="Gmail authorization expired. Please reconnect.")
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Gmail API error: {r.text[:200]}")
    data = r.json()
    ids = [m["id"] for m in (data.get("messages") or [])]
    messages = await _fetch_messages_metadata(access_token, ids)
    return {
        "messages": messages,
        "next_page_token": data.get("nextPageToken"),
        "result_size_estimate": data.get("resultSizeEstimate", 0),
    }


@router.get("/gmail/messages/{message_id}")
async def get_message(message_id: str, current_user: dict = Depends(get_current_user)):
    access_token = await _require_token(current_user["id"])
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(f"{GMAIL_API}/messages/{message_id}", headers={"Authorization": f"Bearer {access_token}"}, params={"format": "full"})
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Gmail API error: {r.text[:200]}")
    msg = r.json()
    summary = _summarize(msg)
    text_body, html_body, attachments = _extract_bodies(msg.get("payload") or {})
    summary.update({"text_body": text_body, "html_body": html_body, "attachments": attachments})
    return summary


@router.get("/gmail/threads/{thread_id}")
async def get_thread(thread_id: str, current_user: dict = Depends(get_current_user)):
    access_token = await _require_token(current_user["id"])
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{GMAIL_API}/threads/{thread_id}", headers={"Authorization": f"Bearer {access_token}"}, params={"format": "full"})
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Gmail API error: {r.text[:200]}")
    thread = r.json()
    out = []
    for msg in thread.get("messages") or []:
        summary = _summarize(msg)
        text_body, html_body, attachments = _extract_bodies(msg.get("payload") or {})
        summary.update({"text_body": text_body, "html_body": html_body, "attachments": attachments})
        out.append(summary)
    return {"thread_id": thread_id, "messages": out}


@router.get("/gmail/contact-emails")
async def contact_emails(
    email: str = Query(..., description="Contact's email address"),
    max_results: int = Query(20, le=50),
    current_user: dict = Depends(get_current_user),
):
    """All messages exchanged (sent or received) with a given contact email."""
    access_token = await _require_token(current_user["id"])
    q = f"from:{email} OR to:{email} OR cc:{email}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{GMAIL_API}/messages", headers={"Authorization": f"Bearer {access_token}"}, params={"q": q, "maxResults": max_results})
    if r.status_code == 401:
        raise HTTPException(status_code=409, detail="Gmail authorization expired. Please reconnect.")
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Gmail API error: {r.text[:200]}")
    ids = [m["id"] for m in (r.json().get("messages") or [])]
    messages = await _fetch_messages_metadata(access_token, ids)
    return {"email": email, "messages": messages}


# ──────────────────────────────────────────────
# Sending / replying
# ──────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    to: str
    subject: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    cc: Optional[str] = None
    bcc: Optional[str] = None
    thread_id: Optional[str] = None
    reply_to_message_id: Optional[str] = None


@router.post("/gmail/send")
async def send_email(payload: SendEmailRequest, current_user: dict = Depends(get_current_user)):
    access_token = await _require_token(current_user["id"])
    doc = await _get_tokens(current_user["id"])
    sender = (doc or {}).get("email") or current_user.get("email", "")

    in_reply_to = None
    references = None
    subject = payload.subject
    thread_id = payload.thread_id

    # If replying, fetch original to wire up threading headers + subject
    if payload.reply_to_message_id:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"{GMAIL_API}/messages/{payload.reply_to_message_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                params=[("format", "metadata"), ("metadataHeaders", "Message-ID"),
                        ("metadataHeaders", "References"), ("metadataHeaders", "Subject")],
            )
        if r.status_code == 200:
            orig = r.json()
            thread_id = thread_id or orig.get("threadId")
            h = _headers_map(orig.get("payload") or {})
            in_reply_to = h.get("message-id")
            references = (h.get("references", "") + " " + (in_reply_to or "")).strip()
            if not subject:
                orig_sub = h.get("subject", "")
                subject = orig_sub if orig_sub.lower().startswith("re:") else f"Re: {orig_sub}"

    if not (payload.body_html or payload.body_text):
        raise HTTPException(status_code=400, detail="Email body is required.")

    mime = EmailMessage()
    mime["To"] = payload.to
    mime["From"] = sender
    mime["Subject"] = subject or "(no subject)"
    if payload.cc:
        mime["Cc"] = payload.cc
    if payload.bcc:
        mime["Bcc"] = payload.bcc
    if in_reply_to:
        mime["In-Reply-To"] = in_reply_to
    if references:
        mime["References"] = references

    if payload.body_text:
        mime.set_content(payload.body_text)
    if payload.body_html:
        if payload.body_text:
            mime.add_alternative(payload.body_html, subtype="html")
        else:
            mime.set_content(payload.body_html, subtype="html")

    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
    send_body = {"raw": raw}
    if thread_id:
        send_body["threadId"] = thread_id

    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post(
            f"{GMAIL_API}/messages/send",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=send_body,
        )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=f"Gmail send error: {r.text[:300]}")
    result = r.json()
    return {"sent": True, "id": result.get("id"), "threadId": result.get("threadId")}
