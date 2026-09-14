"""Company Leave & Holiday Policy: editable (Admin/CEO), shareable by email, dashboard banner for today/tomorrow."""
import uuid
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(prefix="/leave-policy", tags=["Leave Policy"])
IST = ZoneInfo("Asia/Kolkata")
ADMIN_ROLES = {"ceo", "admin", "system admin", "system_admin"}
LOCS = ["Hyderabad", "Delhi", "Mumbai", "Goa", "Bengaluru"]


def _h(d, day, hyd=None, dl=None, mum=None, goa=None, blr=None, note=None):
    entries = {}
    for loc, v in zip(LOCS, (hyd, dl, mum, goa, blr)):
        if v:
            name, typ = v
            entries[loc] = {"name": name, "type": typ}
    return {"id": str(uuid.uuid4()), "date": f"2026-{d}", "day": day, "entries": entries, "note": note}


def default_policy() -> dict:
    F, V, N = "F", "V", None
    return {
        "year": 2026,
        "title": "Company Leave & Holiday Policy – 2026",
        "locations": LOCS,
        "structure": [
            {"category": "Sick / Casual Leave", "entitlement": "1.5 days per month = 18 days per year"},
            {"category": "Fixed Public Holidays", "entitlement": "10 days per year"},
            {"category": "Variable Holidays", "entitlement": "2 days per year"},
            {"category": "Total Paid Public Holidays", "entitlement": "12 days per year"},
            {"category": "Weekly Off", "entitlement": "Every Sunday"},
            {"category": "Statutory Leave", "entitlement": "As applicable under law"},
        ],
        "structure_note": "Employees receive 10 fixed paid holidays based on their assigned work location and may select 2 additional variable holidays from the approved variable-holiday pool for that location.",
        "holidays": [
            _h("01-01", "Thu", ("New Year's Day", F), ("New Year's Day", F), ("New Year's Day", F), ("New Year's Day", F), ("New Year's Day", F)),
            _h("01-15", "Thu", ("Sankranti / Pongal", F), None, None, None, ("Makara Sankranti", V)),
            _h("01-26", "Mon", ("Republic Day", F), ("Republic Day", F), ("Republic Day", F), ("Republic Day", F), ("Republic Day", F)),
            _h("02-19", "Thu", None, None, ("Shivaji Maharaj Jayanti", V), None, None),
            _h("03-03", "Tue", ("Holi", V), ("Holi", F), ("Holi", V), None, None),
            _h("03-19", "Thu", ("Ugadi", F), None, ("Gudi Padwa", F), ("Gudi Padwa", V), ("Ugadi", F)),
            _h("04-03", "Fri", ("Good Friday", V), ("Good Friday", F), ("Good Friday", V), ("Good Friday", F), ("Good Friday", V)),
            _h("04-14", "Tue", ("Ambedkar Jayanti", V), ("Ambedkar Jayanti", V), ("Ambedkar Jayanti", V), None, ("Ambedkar Jayanti", V)),
            _h("04-20", "Mon", None, None, None, None, ("Basava Jayanti", V)),
            _h("05-01", "Fri", ("May Day", V), ("May Day", V), ("Maharashtra Day", F), ("May Day", F), ("May Day", F)),
            _h("06-02", "Tue", ("Telangana Formation Day", V), None, None, None, None),
            _h("08-10", "Mon", ("Bonalu", V), None, None, None, None),
            _h("08-15", "Sat", ("Independence Day", F), ("Independence Day", F), ("Independence Day", F), ("Independence Day", F), ("Independence Day", F)),
            _h("08-28", "Fri", ("Rakhi", V), ("Raksha Bandhan", V), None, None, None),
            _h("09-14", "Mon", ("Ganesh Chaturthi", F), ("Ganesh Chaturthi", F), ("Ganesh Chaturthi", F), ("Ganesh Chaturthi", F), ("Ganesh Chaturthi", F)),
            _h("10-02", "Fri", ("Gandhi Jayanti", F), ("Gandhi Jayanti", F), ("Gandhi Jayanti", F), ("Gandhi Jayanti", F), ("Gandhi Jayanti", F)),
            _h("10-18", "Sun", ("Bathukamma", V), None, None, None, None, note="Falls on Sunday in 2026; Sunday is already the Company's regular weekly off."),
            _h("10-19", "Mon", ("Mahanavami", V), ("Maha Navami", V), None, None, ("Ayudha Puja / Mahanavami", V)),
            _h("10-20", "Tue", ("Vijaya Dasami", F), ("Dussehra", F), ("Dasara", F), ("Dussehra", F), ("Vijayadashami / Dasara", F)),
            _h("11-01", "Sun", None, None, None, None, ("Kannada Rajyotsava", V), note="Falls on Sunday in 2026; Sunday is already the Company's regular weekly off."),
            _h("11-08", "Sun", ("Diwali", N), ("Diwali", N), ("Diwali", N), ("Diwali", N), ("Deepavali", N), note="Diwali falls on Sunday; the Company Holiday is observed on Monday 9 Nov."),
            _h("11-09", "Mon", ("Diwali – Company Holiday", F), ("Diwali – Company Holiday", F), ("Diwali – Company Holiday", F), ("Diwali – Company Holiday", F), ("Deepavali – Company Holiday", F)),
            _h("11-10", "Tue", None, None, ("Bali Pratipada", V), None, ("Balipadyami", V)),
            _h("11-24", "Tue", None, ("Guru Nanak Jayanti", V), ("Guru Nanak Jayanti", V), None, None),
            _h("11-27", "Fri", None, None, None, None, ("Kanakadasa Jayanti", V)),
            _h("12-03", "Thu", None, None, None, ("Feast of St. Francis Xavier", V), None),
            _h("12-19", "Sat", None, None, None, ("Goa Liberation Day", V), None),
            _h("12-25", "Fri", ("Christmas", F), ("Christmas", F), ("Christmas", F), ("Christmas", F), ("Christmas", F)),
        ],
        "variable_pool_extra": {"Goa": "other HR-approved Goa holidays"},
        "sections": [
            {"key": "variable_policy", "title": "Variable Holiday Policy",
             "body": "Employees may select up to 2 paid Variable Holidays per calendar year from the approved list applicable to their assigned work location. Variable Holidays should be applied for in advance and are subject to approval based on staffing and operational requirements. A Variable Holiday falling on the employee's regular Sunday weekly off will not consume one of the employee's two Variable Holiday entitlements."},
            {"key": "summary", "title": "Annual Paid Leave Summary",
             "body": "Each employee is entitled to 18 days of Sick/Casual Leave, 10 Fixed Public Holidays, 2 Variable Holidays, and every Sunday as a weekly off, in addition to statutory leave entitlements as applicable."},
            {"key": "compliance", "title": "Compliance Note",
             "body": "The final location-specific holiday calendar should be reviewed against applicable National & Festival Holiday, Shops & Establishments, Factories, and other employment-law requirements for the relevant establishment and state. Where applicable law provides a greater or mandatory entitlement, the statutory requirement will prevail."},
        ],
    }


class PolicyIn(BaseModel):
    year: int
    title: str
    locations: List[str]
    structure: List[Dict[str, Any]]
    structure_note: Optional[str] = ""
    holidays: List[Dict[str, Any]]
    variable_pool_extra: Optional[Dict[str, str]] = {}
    sections: List[Dict[str, Any]]


class ShareIn(BaseModel):
    emails: List[str] = []
    all_team: bool = False
    message: Optional[str] = None


def _is_admin(u: dict) -> bool:
    return (u.get("role") or "").strip().lower() in ADMIN_ROLES


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _policy(tenant_id: str) -> dict:
    doc = await db.leave_policies.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        doc = {**default_policy(), "id": str(uuid.uuid4()), "tenant_id": tenant_id, "version": 1, "updated_at": _now(), "updated_by": "System (seeded from policy document)"}
        await db.leave_policies.insert_one({**doc})
    doc["holidays"] = sorted(doc.get("holidays") or [], key=lambda h: h.get("date") or "")
    return doc


def derived(p: dict) -> dict:
    """Fixed holidays and variable pools per location, computed from the calendar."""
    fixed, pool = {}, {}
    for h in p.get("holidays") or []:
        for loc, e in (h.get("entries") or {}).items():
            if e.get("type") == "F":
                fixed.setdefault(loc, []).append({"date": h["date"], "name": e["name"]})
            elif e.get("type") == "V":
                pool.setdefault(loc, []).append({"date": h["date"], "name": e["name"], "note": h.get("note")})
    for loc, extra in (p.get("variable_pool_extra") or {}).items():
        if extra:
            pool.setdefault(loc, []).append({"date": None, "name": extra})
    return {"fixed_by_location": fixed, "variable_pool": pool}


@router.get("")
async def get_policy(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    p = await _policy(tenant_id)
    return {**p, **derived(p), "can_edit": _is_admin(current_user), "my_location": current_user.get("city")}


@router.put("")
async def put_policy(data: PolicyIn, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only Admin / CEO can edit the leave policy")
    tenant_id = get_current_tenant_id()
    cur = await _policy(tenant_id)
    for h in data.holidays:
        try:
            date.fromisoformat(h.get("date") or "")
        except ValueError:
            raise HTTPException(400, f"Invalid holiday date: {h.get('date')}")
        h.setdefault("id", str(uuid.uuid4()))
        h["day"] = date.fromisoformat(h["date"]).strftime("%a")
        h["entries"] = {loc: e for loc, e in (h.get("entries") or {}).items() if loc in data.locations and (e or {}).get("name")}
    upd = {**data.model_dump(), "version": (cur.get("version") or 1) + 1, "updated_at": _now(),
           "updated_by": current_user.get("name") or current_user.get("email"), "updated_by_id": current_user.get("id")}
    await db.leave_policies.update_one({"tenant_id": tenant_id}, {"$set": upd})
    await db.leave_policy_history.insert_one({"id": str(uuid.uuid4()), "tenant_id": tenant_id, "version": cur.get("version"), "snapshot": cur, "replaced_at": _now(),
                                             "replaced_by": upd["updated_by"]})
    p = await _policy(tenant_id)
    return {**p, **derived(p), "can_edit": True}


def _fmt(d: str) -> str:
    return date.fromisoformat(d).strftime("%-d %b (%a)")


def policy_html(p: dict, message: Optional[str], sender: str) -> str:
    d = derived(p)
    locs = p.get("locations") or []
    th = "padding:6px 8px;font-size:11px;color:#64748b;text-align:left;border-bottom:2px solid #e2e8f0"
    td = "padding:6px 8px;font-size:12px;border-bottom:1px solid #e2e8f0;vertical-align:top"
    chip = lambda e: "" if not e else (f"{e['name']} <b style='color:{'#b91c1c' if e.get('type') == 'F' else '#b45309' if e.get('type') == 'V' else '#64748b'}'>({e.get('type') or '—'})</b>")
    cal = "".join(f"<tr><td style='{td}'><b>{_fmt(h['date'])}</b></td>" + "".join(f"<td style='{td}'>{chip((h.get('entries') or {}).get(l)) or '—'}</td>" for l in locs) + "</tr>" for h in p.get("holidays") or [])
    struct = "".join(f"<tr><td style='{td}'>{r.get('category')}</td><td style='{td}'><b>{r.get('entitlement')}</b></td></tr>" for r in p.get("structure") or [])
    fixed = "".join(f"<tr><td style='{td}'><b>{l}</b></td><td style='{td}'>{', '.join(x['name'] for x in d['fixed_by_location'].get(l, []))}</td></tr>" for l in locs)
    pool = "".join(f"<tr><td style='{td}'><b>{l}</b></td><td style='{td}'>{'; '.join(x['name'] for x in d['variable_pool'].get(l, []))}</td></tr>" for l in locs)
    secs = "".join(f"<h3 style='font-size:14px;margin:18px 0 4px'>{s.get('title')}</h3><p style='font-size:12px;color:#334155;margin:0'>{s.get('body')}</p>" for s in p.get("sections") or [])
    msg = f"<div style='background:#eef2ff;border-left:4px solid #002FA7;padding:10px 12px;font-size:13px;margin:0 0 16px'>{message}</div>" if message else ""
    return f"""
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;max-width:820px">
  <h2 style="margin:0 0 2px;font-size:20px">{p.get('title')}</h2>
  <p style="margin:0 0 14px;color:#64748b;font-size:12px">{' • '.join(locs)} · v{p.get('version')} · shared by {sender}</p>
  {msg}
  <h3 style="font-size:14px;margin:0 0 4px">1. Leave & Holiday Structure</h3>
  <table style="border-collapse:collapse;width:100%"><tr><th style='{th}'>Category</th><th style='{th}'>Entitlement</th></tr>{struct}</table>
  <p style="font-size:12px;color:#334155">{p.get('structure_note') or ''}</p>
  <h3 style="font-size:14px;margin:18px 0 4px">2. {p.get('year')} Master City-Wise Holiday Calendar</h3>
  <p style="font-size:11px;color:#64748b;margin:0 0 6px">F = Fixed Holiday · V = Variable Holiday Option · — = Regular Working Day</p>
  <table style="border-collapse:collapse;width:100%"><tr><th style='{th}'>Date</th>{''.join(f"<th style='{th}'>{l}</th>" for l in locs)}</tr>{cal}</table>
  <h3 style="font-size:14px;margin:18px 0 4px">3. Fixed Holidays by Location</h3>
  <table style="border-collapse:collapse;width:100%">{fixed}</table>
  <h3 style="font-size:14px;margin:18px 0 4px">4. Variable Holiday Pool – Employee Selects 2</h3>
  <table style="border-collapse:collapse;width:100%">{pool}</table>
  {secs}
  <p style="margin:20px 0 0;color:#94a3b8;font-size:11px">Sent from the Nyla Air Water CRM · Company Documents → Leave Policy</p>
</div>"""


@router.post("/share")
async def share_policy(data: ShareIn, current_user: dict = Depends(get_current_user)):
    from utils.email_sender import send_email
    tenant_id = get_current_tenant_id()
    p = await _policy(tenant_id)
    targets = {e.strip().lower() for e in data.emails if e and "@" in e}
    if data.all_team:
        users = await db.users.find({"tenant_id": tenant_id, "is_active": {"$ne": False}, "email": {"$exists": True, "$ne": ""}}, {"_id": 0, "email": 1, "role": 1}).to_list(1000)
        targets |= {u["email"].lower() for u in users if (u.get("role") or "").lower() not in ("distributor", "driver")}
    if not targets:
        raise HTTPException(400, "Add at least one recipient")
    sender = current_user.get("name") or current_user.get("email")
    html = policy_html(p, data.message, sender)
    subject = f"{p.get('title')} — shared by {sender}"
    sent = 0
    for to in sorted(targets):
        try:
            if await send_email(to=to, subject=subject, html=html, text=subject):
                sent += 1
        except Exception:
            logging.getLogger("leave_policy").exception("share email failed for %s", to)
    await db.leave_policy_shares.insert_one({"id": str(uuid.uuid4()), "tenant_id": tenant_id, "recipients": sorted(targets), "sent": sent, "message": data.message,
                                            "by": sender, "by_id": current_user.get("id"), "at": _now(), "version": p.get("version")})
    return {"ok": True, "recipients": len(targets), "sent": sent, "email_configured": sent > 0 or False}


@router.get("/shares")
async def list_shares(current_user: dict = Depends(get_current_user)):
    _ = current_user
    return {"shares": await db.leave_policy_shares.find({"tenant_id": get_current_tenant_id()}, {"_id": 0}).sort("at", -1).to_list(20)}


@router.get("/banner")
async def banner(current_user: dict = Depends(get_current_user)):
    """Dashboard banner: holidays (fixed/variable per location) and approved leaves for today & tomorrow (IST)."""
    tenant_id = get_current_tenant_id()
    p = await _policy(tenant_id)
    today = datetime.now(IST).date()
    days = [("today", today), ("tomorrow", today + timedelta(days=1))]
    out = []
    users = {u["id"]: u for u in await db.users.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "name": 1, "role": 1, "city": 1, "designation": 1}).to_list(2000)}
    for label, d in days:
        ds = d.isoformat()
        hol = next((h for h in p.get("holidays") or [] if h.get("date") == ds), None)
        holidays = [{"location": loc, "name": e["name"], "type": e.get("type")} for loc, e in ((hol or {}).get("entries") or {}).items() if e.get("type") in ("F", "V")]
        leaves = await db.leave_requests.find({"tenant_id": tenant_id, "status": "approved", "start_date": {"$lte": ds}, "end_date": {"$gte": ds}},
                                              {"_id": 0, "user_id": 1, "leave_type": 1, "start_date": 1, "end_date": 1}).to_list(500)
        on_leave = [{"user_id": l["user_id"], "name": users.get(l["user_id"], {}).get("name") or "Unknown", "role": users.get(l["user_id"], {}).get("designation") or users.get(l["user_id"], {}).get("role"),
                     "city": users.get(l["user_id"], {}).get("city"), "leave_type": l.get("leave_type"), "start_date": l["start_date"], "end_date": l["end_date"]} for l in leaves]
        out.append({"label": label, "date": ds, "day": d.strftime("%A"), "is_sunday": d.weekday() == 6, "holidays": holidays, "on_leave": on_leave,
                    "note": (hol or {}).get("note")})
    return {"days": out, "my_location": current_user.get("city"), "has_items": any(x["holidays"] or x["on_leave"] for x in out)}
