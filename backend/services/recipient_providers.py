"""Composable recipient providers for the Document Sharing Framework.

Each provider returns a list of normalized Recipient dicts:
    {name, email, phone, source, role}

Per-module recipient resolvers COMPOSE these building blocks — no duplicated
query logic. `source` lets the UI group the candidate pool ("Lead contacts",
"Distributor", "Delivery people", "Manager", …).
"""
from __future__ import annotations

from database import db


def recipient(name, email, phone, source, role):
    return {
        "name": name or "",
        "email": (email or "").strip(),
        "phone": (phone or "").strip(),
        "source": source,
        "role": role,
    }


async def lead_contacts(tenant_id: str, lead_id: str) -> list:
    """Contacts attached to a lead (contacts collection, fk lead_id) + the
    lead's own primary email."""
    out = []
    if not lead_id:
        return out
    async for c in db.contacts.find({"lead_id": lead_id, "tenant_id": tenant_id}, {"_id": 0}):
        out.append(recipient(c.get("name"), c.get("email"), c.get("phone"),
                             "lead_contact", c.get("designation") or "Lead contact"))
    lead = await db.leads.find_one({"id": lead_id, "tenant_id": tenant_id}, {"_id": 0})
    if lead and lead.get("email"):
        out.append(recipient(lead.get("name") or lead.get("company"), lead.get("email"),
                             lead.get("phone"), "lead", "Lead primary"))
    return out


async def account_contacts(tenant_id: str, account_id: str) -> list:
    out = []
    if not account_id:
        return out
    async for c in db.contacts.find({"account_id": account_id, "tenant_id": tenant_id}, {"_id": 0}):
        out.append(recipient(c.get("name"), c.get("email"), c.get("phone"),
                             "account_contact", c.get("designation") or "Account contact"))
    acct = await db.accounts.find_one({"id": account_id, "tenant_id": tenant_id}, {"_id": 0})
    if acct:
        if acct.get("contact_name") or acct.get("contact_number"):
            out.append(recipient(acct.get("contact_name") or acct.get("account_name"), "",
                                 acct.get("contact_number"), "account", "Account contact"))
        if acct.get("delivery_contact_name") or acct.get("delivery_contact_phone"):
            out.append(recipient(acct.get("delivery_contact_name"), "",
                                 acct.get("delivery_contact_phone"), "delivery_contact", "Delivery contact"))
    return out


async def distributor_contacts(tenant_id: str, distributor_id: str) -> list:
    out = []
    if not distributor_id:
        return out
    async for c in db.distributor_contacts.find({"distributor_id": distributor_id, "tenant_id": tenant_id}, {"_id": 0}):
        out.append(recipient(
            c.get("name"), c.get("email"), c.get("mobile"), "distributor",
            "Distributor (primary)" if c.get("is_primary") else (c.get("designation") or "Distributor contact"),
        ))
    d = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0})
    if d:
        if d.get("primary_contact_email") or d.get("primary_contact_mobile"):
            out.append(recipient(d.get("primary_contact_name") or d.get("distributor_name"),
                                 d.get("primary_contact_email"), d.get("primary_contact_mobile"),
                                 "distributor", "Distributor (primary)"))
        if d.get("secondary_contact_email") or d.get("secondary_contact_mobile"):
            out.append(recipient(d.get("secondary_contact_name"), d.get("secondary_contact_email"),
                                 d.get("secondary_contact_mobile"), "distributor", "Distributor (secondary)"))
    return out


async def delivery_people(tenant_id: str, schedule_id: str) -> list:
    """The route's driver + each stop's delivery contact."""
    out = []
    sch = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0})
    if not sch:
        return out
    if sch.get("driver_id"):
        drv = await db.drivers.find_one({"id": sch["driver_id"]}, {"_id": 0})
        if drv:
            out.append(recipient(drv.get("name") or "Driver", drv.get("email"),
                                 drv.get("phone") or drv.get("mobile"), "delivery_person", "Driver"))
    for did in (sch.get("delivery_ids") or []):
        delv = await db.distributor_deliveries.find_one({"id": did}, {"_id": 0, "account_id": 1})
        if delv and delv.get("account_id"):
            acct = await db.accounts.find_one(
                {"id": delv["account_id"]}, {"_id": 0, "delivery_contact_name": 1, "delivery_contact_phone": 1})
            if acct and (acct.get("delivery_contact_name") or acct.get("delivery_contact_phone")):
                out.append(recipient(acct.get("delivery_contact_name"), "",
                                     acct.get("delivery_contact_phone"), "delivery_person", "Stop delivery contact"))
    return out


async def reporting_manager(tenant_id: str, current_user: dict) -> list:
    mgr_id = (current_user or {}).get("reports_to")
    if not mgr_id:
        return []
    m = await db.users.find_one({"id": mgr_id, "tenant_id": tenant_id}, {"_id": 0})
    if m and m.get("email"):
        return [recipient(m.get("name"), m.get("email"), m.get("phone") or m.get("mobile"),
                          "manager", "Reporting manager")]
    return []


def self_recipient(current_user: dict) -> list:
    u = current_user or {}
    if u.get("email"):
        return [recipient(u.get("name"), u.get("email"), u.get("phone") or u.get("mobile"),
                          "self", "You (sender)")]
    return []
