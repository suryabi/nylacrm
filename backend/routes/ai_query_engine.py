"""AI Query Engine — lets the assistant answer questions on ANY tenant data.

Flow per question:
  1. Catalog: every collection holding docs for this tenant + field summary (cached 10 min).
  2. Plan:    LLM turns the question into ≤4 read-only Mongo queries (strict JSON DSL).
  3. Execute: tenant-scoped, sanitized (sensitive collections/fields blocked, limits enforced).
  4. Results are injected into the chat prompt as LIVE DATABASE RESULTS.
"""
import json
import logging
import os
import re
import time

from database import db

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
PLANNER_PROVIDER, PLANNER_MODEL = "openai", "gpt-5.4"

# Never expose these collections to the assistant.
BLOCKED_COLLECTIONS = {
    "users", "user_sessions", "push_tokens", "api_keys", "password_resets",
    "zoho_tokens", "zoho_config", "zoho_integrations", "slack_config",
    "google_drive_config", "gmail_tokens", "oauth_states", "tenants",
    "ai_chat_sessions", "ai_chat_messages", "status_checks", "roles",
}
SENSITIVE_FIELD_RE = re.compile(r"password|secret|token|api_key|apikey|hash|credential|private_key", re.I)
ALLOWED_AGG_STAGES = {"$match", "$group", "$sort", "$limit", "$project", "$unwind", "$count", "$addFields"}

MAX_QUERIES = 4
MAX_ROWS = 50
RESULT_CHAR_BUDGET = 14000

_catalog_cache = {}  # tenant_id -> (built_at_epoch, catalog_str, collection_names_set)
CATALOG_TTL = 600


def _type_name(v):
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "str"
    if isinstance(v, list):
        return "list"
    if isinstance(v, dict):
        return "object"
    return type(v).__name__


async def get_catalog(tenant_id: str):
    """Return (catalog_text, allowed_collection_names) for the tenant, cached."""
    cached = _catalog_cache.get(tenant_id)
    if cached and time.time() - cached[0] < CATALOG_TTL:
        return cached[1], cached[2]
    lines, names = [], set()
    for coll in sorted(await db.list_collection_names()):
        if coll in BLOCKED_COLLECTIONS or coll.startswith("system."):
            continue
        try:
            count = await db[coll].count_documents({"tenant_id": tenant_id})
            if not count:
                continue
            sample = await db[coll].find_one({"tenant_id": tenant_id}, {"_id": 0})
            fields = []
            for k, v in list((sample or {}).items())[:30]:
                if k == "tenant_id" or SENSITIVE_FIELD_RE.search(k):
                    continue
                if isinstance(v, dict) and v:
                    nested = [f"{k}.{nk}:{_type_name(nv)}" for nk, nv in list(v.items())[:8]
                              if not SENSITIVE_FIELD_RE.search(nk)]
                    fields.extend(nested or [f"{k}:object"])
                elif isinstance(v, list) and v and isinstance(v[0], dict):
                    inner = ",".join(list(v[0].keys())[:8])
                    fields.append(f"{k}:list[{{{inner}}}]")
                else:
                    fields.append(f"{k}:{_type_name(v)}")
            lines.append(f"- {coll} ({count} docs): {', '.join(fields)}")
            names.add(coll)
        except Exception:
            continue
    catalog = "\n".join(lines)
    _catalog_cache[tenant_id] = (time.time(), catalog, names)
    return catalog, names


async def _complete(system: str, prompt: str) -> str:
    """Non-streaming LLM completion (collects the stream)."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
    import uuid as _uuid
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"planner-{_uuid.uuid4()}",
                   system_message=system).with_model(PLANNER_PROVIDER, PLANNER_MODEL)
    out = ""
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            out += ev.content
        elif isinstance(ev, StreamDone):
            break
    return out


PLANNER_SYSTEM = """You translate a user's question about their business data into read-only MongoDB queries.
Return STRICT JSON only (no markdown, no commentary): {"queries": [ ... up to %d ... ]}
Each query object:
  {"collection": "<name from catalog>", "op": "find",
   "filter": {<mongo filter>}, "projection": {<field>:1,...} (optional, pick only needed fields),
   "sort": {<field>: -1|1} (optional), "limit": <int, max %d>}
or
  {"collection": "<name>", "op": "aggregate",
   "pipeline": [ stages using ONLY $match,$group,$sort,$limit,$project,$unwind,$count,$addFields ]}
Rules:
- NEVER include tenant_id anywhere — it is added automatically.
- Dates are stored as ISO strings ("2026-07-20" or full ISO timestamps) — compare with string $gte/$lte.
- For name/text matching use case-insensitive regex: {"field": {"$regex": "text", "$options": "i"}}.
- Prefer aggregations ($group with $sum/$avg/$count) for totals/counts instead of fetching many rows.
- When results will contain reference IDs (fields like *_id, category/master ids), ADD one more query \
fetching the id→name mapping from the corresponding master collection (e.g. accounting_masters, \
master_skus, expense categories) so the final answer can show human-readable names.
- Pick the MOST relevant collections from the catalog; up to %d queries.
- If the question needs no database data (greeting/general knowledge), return {"queries": []}.""" % (MAX_QUERIES, MAX_ROWS, MAX_QUERIES)


async def plan_queries(tenant_id: str, message: str, transcript: str = "") -> list:
    catalog, names = await get_catalog(tenant_id)
    if not catalog:
        return []
    prompt = (f"COLLECTIONS CATALOG (name (doc count): fields):\n{catalog}\n\n"
              + (f"CONVERSATION SO FAR:\n{transcript[-1500:]}\n\n" if transcript else "")
              + f"USER QUESTION: {message}")
    try:
        raw = await _complete(PLANNER_SYSTEM, prompt)
        m = re.search(r"\{.*\}", raw, re.S)
        plan = json.loads(m.group(0)) if m else {}
        queries = plan.get("queries") or []
        return [q for q in queries if isinstance(q, dict) and q.get("collection") in names][:MAX_QUERIES]
    except Exception:
        logger.exception("AI query planning failed")
        return []


def _sanitize_doc(doc, depth=0):
    if isinstance(doc, dict):
        out = {}
        for k, v in doc.items():
            if k in ("_id", "tenant_id", "raw") or SENSITIVE_FIELD_RE.search(str(k)):
                continue
            out[k] = _sanitize_doc(v, depth + 1)
        return out
    if isinstance(doc, list):
        return [_sanitize_doc(v, depth + 1) for v in doc[:20]]
    if isinstance(doc, str) and len(doc) > 300:
        return doc[:300] + "…"
    return doc


async def _run_query(tenant_id: str, q: dict):
    coll = q["collection"]
    op = q.get("op") or "find"
    if op == "aggregate":
        stages = q.get("pipeline") or []
        for s in stages:
            if not isinstance(s, dict) or len(s) != 1 or next(iter(s)) not in ALLOWED_AGG_STAGES:
                raise ValueError(f"Stage not allowed: {s}")
        pipeline = [{"$match": {"tenant_id": tenant_id}}] + stages
        if not any("$limit" in s for s in stages):
            pipeline.append({"$limit": 100})
        rows = await db[coll].aggregate(pipeline).to_list(100)
    else:
        filt = q.get("filter") or {}
        if not isinstance(filt, dict):
            filt = {}
        query = {"$and": [{"tenant_id": tenant_id}, filt]} if filt else {"tenant_id": tenant_id}
        proj = {"_id": 0}
        user_proj = q.get("projection")
        if isinstance(user_proj, dict) and user_proj:
            proj.update({k: 1 for k in user_proj if not SENSITIVE_FIELD_RE.search(k)})
        limit = min(int(q.get("limit") or 25), MAX_ROWS)
        cur = db[coll].find(query, proj)
        sort = q.get("sort")
        if isinstance(sort, dict) and sort:
            cur = cur.sort(list(sort.items()))
        rows = await cur.limit(limit).to_list(limit)
    return [_sanitize_doc(r) for r in rows]


async def execute_plan(tenant_id: str, queries: list) -> str:
    if not queries:
        return ""
    parts = ["LIVE DATABASE RESULTS (fetched from MongoDB right now for this question — authoritative):"]
    budget = RESULT_CHAR_BUDGET
    for i, q in enumerate(queries, 1):
        desc = f"[query {i}] {q.get('collection')} · {q.get('op') or 'find'}"
        try:
            rows = await _run_query(tenant_id, q)
            body = json.dumps(rows, default=str, ensure_ascii=False)
            if len(body) > budget:
                body = body[:budget] + "…(truncated)"
            block = f"{desc} → {len(rows)} rows\n{body}"
        except Exception as e:
            block = f"{desc} → ERROR: {str(e)[:200]}"
        parts.append(block)
        budget -= len(block)
        if budget <= 0:
            break
    return "\n\n".join(parts)


async def build_live_data_context(tenant_id: str, message: str, transcript: str = "") -> str:
    """Full pipeline: plan + execute. Never raises."""
    try:
        queries = await plan_queries(tenant_id, message, transcript)
        return await execute_plan(tenant_id, queries)
    except Exception:
        logger.exception("AI live data context failed")
        return ""
