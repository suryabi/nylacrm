"""AI Assistant (ChatGPT gpt-5.4 via Emergent Universal Key).

Endpoints (all SSE-streaming, tenant-scoped, any authenticated user):
  GET    /api/ai/sessions                    list chat sessions of current user
  POST   /api/ai/sessions                    create a session
  GET    /api/ai/sessions/{id}/messages      message history
  DELETE /api/ai/sessions/{id}               delete a session
  POST   /api/ai/chat                        multi-turn assistant grounded in CRM data
  POST   /api/ai/draft                       smart drafting (email/whatsapp/proposal/summary/issue response)
  POST   /api/ai/insights                    dashboard business digest
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user

load_dotenv()

router = APIRouter()

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
AI_PROVIDER, AI_MODEL = "openai", "gpt-5.4"

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _llm(session_id: str, system: str):
    from emergentintegrations.llm.chat import LlmChat
    return LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id,
                   system_message=system).with_model(AI_PROVIDER, AI_MODEL)


async def _stream_llm(session_id: str, system: str, prompt: str):
    """Yields SSE data lines; returns full text via generator attribute pattern."""
    from emergentintegrations.llm.chat import UserMessage, TextDelta, StreamDone
    chat = _llm(session_id, system)
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            yield ev.content
        elif isinstance(ev, StreamDone):
            break


# ───────────────────────── CRM context builders ─────────────────────────

async def _ctx_snapshot(t: str) -> str:
    accounts = await db.accounts.count_documents({"tenant_id": t})
    distributors = await db.distributors.count_documents({"tenant_id": t})
    leads = await db.leads.count_documents({"tenant_id": t})
    open_issues = await db.customer_complaints.count_documents(
        {"tenant_id": t, "status": {"$nin": ["closed", "resolved"]}})
    return (f"SNAPSHOT: accounts={accounts}, distributors={distributors}, "
            f"leads={leads}, open_issues={open_issues}")


async def _ctx_stock(t: str) -> str:
    lines = ["FACTORY WAREHOUSE STOCK (top rows by qty):"]
    rows = await db.factory_warehouse_stock.aggregate([
        {"$match": {"tenant_id": t, "quantity": {"$gt": 0}}},
        {"$group": {"_id": {"sku": "$sku_name", "child": "$child_sku_name"},
                    "qty": {"$sum": "$quantity"}}},
        {"$sort": {"qty": -1}}, {"$limit": 25},
    ]).to_list(25)
    for r in rows:
        cls = r["_id"].get("child") or "Generic"
        lines.append(f"- {r['_id'].get('sku')} [{cls}]: {r['qty']} units")
    lines.append("DISTRIBUTOR STOCK (top rows by qty):")
    rows = await db.distributor_stock.aggregate([
        {"$match": {"tenant_id": t, "quantity": {"$gt": 0}}},
        {"$group": {"_id": {"dist": "$distributor_name", "sku": "$sku_name",
                            "child": "$child_sku_name"},
                    "qty": {"$sum": "$quantity"}}},
        {"$sort": {"qty": -1}}, {"$limit": 25},
    ]).to_list(25)
    for r in rows:
        cls = r["_id"].get("child") or "Generic"
        lines.append(f"- {r['_id'].get('dist')} / {r['_id'].get('sku')} [{cls}]: {r['qty']} units")
    return "\n".join(lines)


async def _ctx_shipments(t: str) -> str:
    rows = await db.distributor_shipments.find(
        {"tenant_id": t}, {"_id": 0, "shipment_number": 1, "distributor_name": 1,
                           "shipment_date": 1, "status": 1, "total_quantity": 1},
    ).sort("created_at", -1).to_list(15)
    return "RECENT STOCK IN (shipments):\n" + "\n".join(
        f"- {r.get('shipment_number')} → {r.get('distributor_name')} on {r.get('shipment_date')}: "
        f"{r.get('total_quantity')} units, status={r.get('status')}" for r in rows)


async def _ctx_deliveries(t: str) -> str:
    rows = await db.distributor_deliveries.find(
        {"tenant_id": t}, {"_id": 0, "delivery_number": 1, "account_name": 1,
                           "distributor_name": 1, "delivery_date": 1, "status": 1,
                           "total_quantity": 1},
    ).sort("created_at", -1).to_list(15)
    return "RECENT STOCK OUT (deliveries):\n" + "\n".join(
        f"- {r.get('delivery_number')} to {r.get('account_name')} on {r.get('delivery_date')}: "
        f"{r.get('total_quantity')} units, status={r.get('status')}" for r in rows)


async def _ctx_transfers(t: str) -> str:
    rows = await db.distributor_stock_transfers.find(
        {"tenant_id": t}, {"_id": 0, "transfer_number": 1, "source_location_name": 1,
                           "dest_location_name": 1, "transfer_date": 1, "status": 1,
                           "total_units": 1},
    ).sort("created_at", -1).to_list(15)
    return "RECENT STOCK TRANSFERS:\n" + "\n".join(
        f"- {r.get('transfer_number')} {r.get('source_location_name')} → {r.get('dest_location_name')} "
        f"on {r.get('transfer_date')}: {r.get('total_units')} units, status={r.get('status')}" for r in rows)


async def _ctx_accounts(t: str) -> str:
    rows = await db.accounts.find(
        {"tenant_id": t}, {"_id": 0, "account_name": 1, "city": 1, "status": 1},
    ).sort("created_at", -1).to_list(50)
    return "ACCOUNTS:\n" + "\n".join(
        f"- {r.get('account_name')} ({r.get('city') or 'city n/a'}, {r.get('status') or 'active'})" for r in rows)


async def _ctx_leads(t: str) -> str:
    rows = await db.leads.find(
        {"tenant_id": t}, {"_id": 0, "name": 1, "company": 1, "status": 1, "city": 1,
                           "estimated_value": 1, "next_follow_up": 1, "assigned_to_name": 1},
    ).sort("updated_at", -1).to_list(30)
    return "RECENT LEADS:\n" + "\n".join(
        f"- {r.get('name')} / {r.get('company') or '-'} ({r.get('city') or '-'}): status={r.get('status')}, "
        f"value=₹{r.get('estimated_value') or 0}, follow-up={r.get('next_follow_up') or '-'}, "
        f"owner={r.get('assigned_to_name') or '-'}" for r in rows)


async def _ctx_issues(t: str) -> str:
    rows = await db.customer_complaints.find(
        {"tenant_id": t}, {"_id": 0, "ticket_number": 1, "account_name": 1, "subject": 1,
                           "status": 1, "priority": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(20)
    return "RECENT ISSUES/COMPLAINTS:\n" + "\n".join(
        f"- {r.get('ticket_number')} {r.get('account_name') or ''}: {r.get('subject') or ''} "
        f"[{r.get('status')}, {r.get('priority') or '-'}]" for r in rows)


async def _ctx_distributors(t: str) -> str:
    rows = await db.distributors.find(
        {"tenant_id": t}, {"_id": 0, "distributor_name": 1, "status": 1},
    ).to_list(40)
    return "DISTRIBUTORS:\n" + "\n".join(
        f"- {r.get('distributor_name')} ({r.get('status') or 'active'})" for r in rows)


_DATASETS = {
    "stock": (_ctx_stock, ["stock", "inventory", "warehouse", "batch", "sku", "branded",
                           "generic", "quantity", "on hand", "bottle", "crate"]),
    "shipments": (_ctx_shipments, ["shipment", "stock in", "stock-in", "stockin", "shp-"]),
    "deliveries": (_ctx_deliveries, ["delivery", "deliveries", "stock out", "stock-out",
                                     "stockout", "del-", "sales", "sold", "revenue"]),
    "transfers": (_ctx_transfers, ["transfer", "st-"]),
    "accounts": (_ctx_accounts, ["account", "customer", "client"]),
    "leads": (_ctx_leads, ["lead", "pipeline", "prospect", "follow up", "follow-up", "deal"]),
    "issues": (_ctx_issues, ["issue", "complaint", "ticket", "cmp-", "iss-"]),
    "distributors": (_ctx_distributors, ["distributor"]),
}


async def _ctx_kb(t: str, message: str) -> str:
    """Top knowledge-base documents relevant to the question (keyword overlap).
    Lets the consolidated assistant answer product/pricing/policy questions
    that used to go to the separate Ask Nyla widget."""
    words = {w for w in re.findall(r"[a-z0-9]{3,}", message.lower())}
    if not words:
        return ""
    docs = await db.kb_documents.find(
        {"tenant_id": t}, {"_id": 0, "title": 1, "content": 1}).to_list(200)
    scored = []
    for d in docs:
        text = ((d.get("title") or "") + " " + (d.get("content") or "")[:6000]).lower()
        score = sum(1 for w in words if w in text)
        if score:
            scored.append((score, d))
    scored.sort(key=lambda x: -x[0])
    if not scored:
        return ""
    parts = ["KNOWLEDGE BASE DOCUMENTS (company docs — cite the title when used):"]
    budget = 8000
    for _, d in scored[:3]:
        block = f"--- {d.get('title', 'Untitled')} ---\n{(d.get('content') or '')[:2800]}"
        if budget - len(block) < 0:
            break
        parts.append(block)
        budget -= len(block)
    return "\n".join(parts)


async def _build_context(t: str, message: str) -> str:
    msg = message.lower()
    parts = [await _ctx_snapshot(t)]
    for _, (fn, kws) in _DATASETS.items():
        if any(k in msg for k in kws):
            try:
                parts.append(await fn(t))
            except Exception:
                pass
    try:
        kb = await _ctx_kb(t, message)
        if kb:
            parts.append(kb)
    except Exception:
        pass
    return "\n\n".join(parts)


BASE_SYSTEM = """You are Nyla, the AI assistant inside a multi-tenant CRM for beverage/FMCG operations \
(leads, accounts, distributors, factory & distributor inventory with parent/child customer-branded SKUs, \
Stock In / Stock Transfer / Stock Out flows, issues, accounting sync).
Rules:
- Answer using ONLY the CRM DATA, LIVE DATABASE RESULTS and KNOWLEDGE BASE DOCUMENTS provided below. \
LIVE DATABASE RESULTS were queried from MongoDB right now specifically for this question — treat them as \
the most authoritative and current source. Each result block shows the exact filter/pipeline used (spec=…): \
match every figure to the period/filters the user asked about. A query returning 0 rows means there is NO \
data for those exact filters — report zero/none for that period, and present any broader (all-time) query \
results separately and clearly labeled. If they conflict with the summary snapshot, silently prefer the \
live results (never mention the discrepancy). If the data doesn't cover the question, say so and suggest \
where in the app the user can look (e.g. Stock Dashboard, Distributors, Leads).
- When answering from a knowledge base document, cite its title (e.g. "(source: Pricing Playbook)").
- Currency is INR (₹). Quantities are bottle/base units unless stated.
- Be concise. Use short bullet lists and bold key figures. Never invent numbers.
"""


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


# ───────────────────────── Sessions ─────────────────────────

@router.get("/sessions")
async def list_sessions(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    rows = await db.ai_chat_sessions.find(
        {"tenant_id": tenant_id, "user_id": current_user["id"]}, {"_id": 0},
    ).sort("updated_at", -1).to_list(30)
    return {"sessions": rows}


@router.post("/sessions")
async def create_session(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    now = _now_iso()
    doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "user_id": current_user["id"],
           "title": "New chat", "created_at": now, "updated_at": now}
    await db.ai_chat_sessions.insert_one(dict(doc))
    return doc


@router.get("/sessions/{session_id}/messages")
async def session_messages(session_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    rows = await db.ai_chat_messages.find(
        {"tenant_id": tenant_id, "session_id": session_id, "user_id": current_user["id"]},
        {"_id": 0},
    ).sort("created_at", 1).to_list(200)
    return {"messages": rows}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    await db.ai_chat_sessions.delete_one(
        {"id": session_id, "tenant_id": tenant_id, "user_id": current_user["id"]})
    await db.ai_chat_messages.delete_many({"session_id": session_id, "tenant_id": tenant_id})
    return {"message": "deleted"}


# ───────────────────────── Chat ─────────────────────────

class ChatIn(BaseModel):
    session_id: Optional[str] = None
    message: str


@router.post("/chat")
async def ai_chat(payload: ChatIn, current_user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    tenant_id = get_current_tenant_id()
    user_id = current_user["id"]
    now = _now_iso()

    session_id = payload.session_id
    if session_id:
        sess = await db.ai_chat_sessions.find_one(
            {"id": session_id, "tenant_id": tenant_id, "user_id": user_id})
        if not sess:
            raise HTTPException(404, "Chat session not found")
    else:
        session_id = str(uuid.uuid4())
        await db.ai_chat_sessions.insert_one({
            "id": session_id, "tenant_id": tenant_id, "user_id": user_id,
            "title": payload.message[:60], "created_at": now, "updated_at": now})

    # Persist the user message + fetch prior history BEFORE streaming.
    history = await db.ai_chat_messages.find(
        {"tenant_id": tenant_id, "session_id": session_id}, {"_id": 0, "role": 1, "content": 1},
    ).sort("created_at", -1).to_list(12)
    history.reverse()
    await db.ai_chat_messages.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "session_id": session_id,
        "user_id": user_id, "role": "user", "content": payload.message, "created_at": now})

    context = await _build_context(tenant_id, payload.message)
    transcript = "\n".join(f"{m['role'].upper()}: {m['content'][:800]}" for m in history)

    async def gen():
        full = ""
        yield _sse({"session_id": session_id})
        # Dynamic Mongo query stage — plan + run read-only queries over ANY
        # tenant collection so the assistant can answer on the entire dataset.
        yield _sse({"status": "Querying your data…"})
        try:
            from routes.ai_query_engine import build_live_data_context
            live = await build_live_data_context(tenant_id, payload.message, transcript)
        except Exception:
            live = ""
        system = (BASE_SYSTEM
                  + f"\nToday: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}\n"
                  + f"\n=== CRM DATA ===\n{context}\n"
                  + (f"\n=== LIVE DATABASE RESULTS ===\n{live}\n" if live else "")
                  + (f"\n=== CONVERSATION SO FAR ===\n{transcript}\n" if transcript else ""))
        try:
            async for delta in _stream_llm(session_id, system, payload.message):
                full += delta
                yield _sse({"delta": delta})
        except Exception as e:
            yield _sse({"error": f"AI error: {e}"})
        if full:
            await db.ai_chat_messages.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tenant_id, "session_id": session_id,
                "user_id": user_id, "role": "assistant", "content": full,
                "created_at": _now_iso()})
            await db.ai_chat_sessions.update_one(
                {"id": session_id, "tenant_id": tenant_id},
                {"$set": {"updated_at": _now_iso()}})
        yield _sse({"done": True})

    return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)


# ───────────────────────── Smart drafting ─────────────────────────

class DraftIn(BaseModel):
    draft_type: str      # email | whatsapp | proposal | summary | issue_response
    context_type: str    # account | lead | issue
    context_id: str
    instructions: Optional[str] = None


_DRAFT_STYLES = {
    "email": "Draft a professional, warm business email (subject line + body, ready to send). Sign off as the sender placeholder [Your Name].",
    "whatsapp": "Draft a short, friendly WhatsApp message (2-5 sentences, light emoji ok, no subject line).",
    "proposal": "Draft persuasive proposal/pitch text covering value proposition, our offering and a clear call to action.",
    "summary": "Write a crisp summary of the current situation, then a bulleted list of RECOMMENDED NEXT ACTIONS (specific and prioritised).",
    "issue_response": "Draft an empathetic, professional response to the customer's issue: acknowledge, explain resolution steps, set expectations.",
}


async def _draft_context(t: str, ctype: str, cid: str) -> str:
    if ctype == "account":
        acc = await db.accounts.find_one({"id": cid, "tenant_id": t}, {"_id": 0})
        if not acc:
            raise HTTPException(404, "Account not found")
        dels = await db.distributor_deliveries.find(
            {"tenant_id": t, "account_id": cid},
            {"_id": 0, "delivery_number": 1, "delivery_date": 1, "total_quantity": 1, "status": 1},
        ).sort("created_at", -1).to_list(5)
        keep = ("account_name", "city", "state", "status", "contact_name", "contact_number",
                "email", "gst_number", "account_type")
        info = {k: acc.get(k) for k in keep if acc.get(k)}
        return (f"ACCOUNT: {json.dumps(info, default=str)}\nRECENT DELIVERIES: "
                + "; ".join(f"{d.get('delivery_number')} {d.get('delivery_date')} {d.get('total_quantity')}u {d.get('status')}" for d in dels))
    if ctype == "lead":
        lead = await db.leads.find_one({"id": cid, "tenant_id": t}, {"_id": 0})
        if not lead:
            raise HTTPException(404, "Lead not found")
        acts = await db.activities.find(
            {"tenant_id": t, "lead_id": cid},
            {"_id": 0, "activity_type": 1, "description": 1, "created_at": 1},
        ).sort("created_at", -1).to_list(15)
        keep = ("name", "company", "email", "phone", "status", "city", "estimated_value",
                "priority", "notes", "next_follow_up", "assigned_to_name", "source")
        info = {k: lead.get(k) for k in keep if lead.get(k)}
        return (f"LEAD: {json.dumps(info, default=str)}\nACTIVITY LOG (newest first):\n"
                + "\n".join(f"- [{a.get('created_at', '')[:10]}] {a.get('activity_type')}: {(a.get('description') or '')[:200]}" for a in acts))
    if ctype == "issue":
        doc = await db.customer_complaints.find_one({"id": cid, "tenant_id": t}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Issue not found")
        keep = ("ticket_number", "account_name", "subject", "description", "status",
                "priority", "category", "created_at")
        return "ISSUE: " + json.dumps({k: doc.get(k) for k in keep if doc.get(k)}, default=str)
    raise HTTPException(400, "context_type must be account, lead or issue")


@router.post("/draft")
async def ai_draft(payload: DraftIn, current_user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    if payload.draft_type not in _DRAFT_STYLES:
        raise HTTPException(400, f"draft_type must be one of {list(_DRAFT_STYLES)}")
    tenant_id = get_current_tenant_id()
    context = await _draft_context(tenant_id, payload.context_type, payload.context_id)

    system = (BASE_SYSTEM + "\nYou are drafting content on behalf of the CRM user. "
              "Use the context faithfully; do not invent facts, prices or commitments.\n"
              f"\n=== CONTEXT ===\n{context}\n")
    prompt = _DRAFT_STYLES[payload.draft_type]
    if payload.instructions:
        prompt += f"\nUser instructions: {payload.instructions}"

    async def gen():
        try:
            async for delta in _stream_llm(f"draft-{uuid.uuid4()}", system, prompt):
                yield _sse({"delta": delta})
        except Exception as e:
            yield _sse({"error": f"AI error: {e}"})
        yield _sse({"done": True})

    return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)


# ───────────────────────── Insights digest ─────────────────────────

@router.post("/insights")
async def ai_insights(current_user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    tenant_id = get_current_tenant_id()
    today = datetime.now(timezone.utc)
    this_m = today.strftime("%Y-%m-01")
    last_m = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m-01")

    async def _del_stats(start, end=None):
        match = {"tenant_id": tenant_id, "delivery_date": {"$gte": start},
                 "status": {"$nin": ["cancelled", "reversed"]}}
        if end:
            match["delivery_date"]["$lt"] = end
        r = await db.distributor_deliveries.aggregate([
            {"$match": match},
            {"$group": {"_id": None, "count": {"$sum": 1}, "qty": {"$sum": "$total_quantity"}}},
        ]).to_list(1)
        return r[0] if r else {"count": 0, "qty": 0}

    cur = await _del_stats(this_m)
    prev = await _del_stats(last_m, this_m)
    top_accounts = await db.distributor_deliveries.aggregate([
        {"$match": {"tenant_id": tenant_id, "delivery_date": {"$gte": this_m},
                    "status": {"$nin": ["cancelled", "reversed"]}}},
        {"$group": {"_id": "$account_name", "qty": {"$sum": "$total_quantity"}}},
        {"$sort": {"qty": -1}}, {"$limit": 5},
    ]).to_list(5)
    lead_pipe = await db.leads.aggregate([
        {"$match": {"tenant_id": tenant_id}},
        {"$group": {"_id": "$status", "n": {"$sum": 1}}},
    ]).to_list(30)
    stock = await _ctx_stock(tenant_id)
    issues = await _ctx_issues(tenant_id)

    data = (f"MONTH-TO-DATE deliveries: {cur.get('count')} deliveries, {cur.get('qty')} units. "
            f"LAST MONTH (full): {prev.get('count')} deliveries, {prev.get('qty')} units.\n"
            f"TOP ACCOUNTS THIS MONTH: " + "; ".join(f"{a['_id']}: {a['qty']}u" for a in top_accounts) + "\n"
            f"LEAD PIPELINE: " + "; ".join(f"{p['_id']}: {p['n']}" for p in lead_pipe) + "\n\n"
            + stock + "\n\n" + issues)

    system = (BASE_SYSTEM + "\nYou are producing a business digest for management.\n"
              f"\n=== CRM DATA ===\n{data}\n")
    prompt = ("Write a concise business insights digest with these markdown sections: "
              "**Highlights**, **Sales & Deliveries**, **Inventory**, **Pipeline**, "
              "**Risks & Recommendations**. Bold the key figures. Max ~250 words.")

    async def gen():
        try:
            async for delta in _stream_llm(f"insights-{uuid.uuid4()}", system, prompt):
                yield _sse({"delta": delta})
        except Exception as e:
            yield _sse({"error": f"AI error: {e}"})
        yield _sse({"done": True})

    return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)
