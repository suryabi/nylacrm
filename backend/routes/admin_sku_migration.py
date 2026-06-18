"""
Admin → SKU Name Rehydration migration.

Background
----------
The codebase historically denormalised `sku_name` into many transactional
collections at write time (deliveries, returns, stock rows, transfers,
batches, …). The intent was to spare reads from a join, but it means a
rename on `master_skus.sku_name` leaves stale labels everywhere.

Identity is preserved on rename — `master_skus.id` is stable — so we can
re-derive the correct `sku_name` for every stored record by joining on
`sku_id`. This endpoint does that across every collection that carries
both fields, in a single idempotent pass.

Safe to re-run: only records whose `sku_name` differs from the current
`master_skus.sku_name` are touched.

Restricted to CEO / Director / Admin / System Admin.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from pydantic import BaseModel

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()

ALLOWED_ROLES = {"CEO", "Director", "Admin", "System Admin"}

# (collection_name, "top" | "items") — drives whether we update a
# top-level `sku_name` or every matching entry inside `items[]`.
COLLECTIONS = [
    ("cost_cards", "top"),
    ("customer_returns", "items"),
    ("distributor_billing_config", "top"),
    ("distributor_delivery_items", "top"),
    ("distributor_manual_stock_entries", "top"),
    ("distributor_margin_matrix", "top"),
    ("distributor_shipment_items", "top"),
    ("distributor_stock", "top"),
    ("distributor_stock_transfers", "items"),
    ("factory_warehouse_stock", "top"),
    ("invoices", "items"),
    ("production_batch_deletions", "top"),
    ("production_batches", "top"),
    ("qc_routes", "top"),
    ("rejection_cost_mappings", "top"),
    ("target_allocations_v2", "top"),
    ("warehouse_transfers", "top"),
]


# Embedded SKU references that store ONLY the name (no `sku_id`). For these
# we backfill `sku_id` by matching the stored name against the current
# `master_skus.sku_name` map, then refresh the name. Schema: per collection,
# the path to the array and the per-element field names.
#   collection, array_field, name_field
EMBEDDED_NAME_ONLY = [
    ("accounts", "sku_pricing", "sku"),
    ("leads", "proposed_sku_pricing", "sku"),
    ("sampling_trials", "sku_plans", "sku"),
]


def _ensure_admin(current_user: dict) -> None:
    role = (current_user.get("role") or "").strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only CEO / Director / Admin / System Admin can run SKU migrations.",
        )


@router.post("/rehydrate-sku-names")
async def rehydrate_sku_names(
    dry_run: bool = True,
    current_user: dict = Depends(get_current_user),
):
    """Rewrite `sku_name` to match `master_skus.sku_name` (joined by `sku_id`)
    across every denormalised collection.

    Query params:
      • dry_run=true (default) — count records that would change, change nothing.
      • dry_run=false — actually write the updates.

    Response: a per-collection report with `examined`, `would_update` (dry-run)
    or `updated` (live), and `unknown_sku_ids` so any orphans surface.
    """
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()

    # Build {sku_id: current sku_name} — master_skus is a global collection
    # (not tenant-scoped) so we read all of them.
    master_rows = await db.master_skus.find(
        {}, {"_id": 0, "id": 1, "sku_name": 1}
    ).to_list(20000)
    name_by_id: dict = {
        r["id"]: (r.get("sku_name") or "").strip()
        for r in master_rows
        if r.get("id") and isinstance(r.get("sku_name"), str)
    }

    report: dict = {
        "dry_run": dry_run,
        "tenant_id": tenant_id,
        "master_skus_loaded": len(name_by_id),
        "collections": {},
    }

    for col_name, shape in COLLECTIONS:
        col = db[col_name]
        examined = 0
        changed = 0
        unknown: set = set()

        if shape == "top":
            # Scan every doc carrying both fields, scoped to this tenant.
            cursor = col.find(
                {"tenant_id": tenant_id, "sku_id": {"$exists": True}, "sku_name": {"$exists": True}},
                {"_id": 1, "sku_id": 1, "sku_name": 1},
            )
            async for d in cursor:
                examined += 1
                sid = d.get("sku_id")
                cur = (d.get("sku_name") or "")
                fresh = name_by_id.get(sid)
                if not fresh:
                    if sid:
                        unknown.add(sid)
                    continue
                if cur == fresh:
                    continue
                changed += 1
                if not dry_run:
                    await col.update_one(
                        {"_id": d["_id"]},
                        {"$set": {"sku_name": fresh}},
                    )
        else:  # shape == "items"
            cursor = col.find(
                {"tenant_id": tenant_id, "items.sku_id": {"$exists": True}},
                {"_id": 1, "items.sku_id": 1, "items.sku_name": 1},
            )
            async for d in cursor:
                items = d.get("items") or []
                # Collect all sku_ids in this doc that need a refresh, with
                # their fresh names. Then issue a single update with
                # arrayFilters to update every matching element in one round.
                fresh_map: dict = {}
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    sid = it.get("sku_id")
                    if not sid:
                        continue
                    examined += 1
                    fresh = name_by_id.get(sid)
                    if not fresh:
                        unknown.add(sid)
                        continue
                    cur = it.get("sku_name") or ""
                    if cur != fresh:
                        fresh_map[sid] = fresh
                if not fresh_map:
                    continue
                # Apply each stale (sku_id → fresh name) pair as a separate
                # update with an arrayFilter — Mongo doesn't let us pass a
                # value-per-arrayFilter in one call, but the number of
                # distinct stale sku_ids per doc is tiny in practice.
                for sid, fresh in fresh_map.items():
                    # Count how many items in this doc carry that sku_id
                    matching_count = sum(
                        1 for it in items
                        if isinstance(it, dict) and it.get("sku_id") == sid
                           and (it.get("sku_name") or "") != fresh
                    )
                    changed += matching_count
                    if not dry_run:
                        await col.update_one(
                            {"_id": d["_id"]},
                            {"$set": {"items.$[el].sku_name": fresh}},
                            array_filters=[{"el.sku_id": sid, "el.sku_name": {"$ne": fresh}}],
                        )

        report["collections"][col_name] = {
            "shape": shape,
            "examined": examined,
            ("would_update" if dry_run else "updated"): changed,
            "unknown_sku_ids": sorted(unknown),
        }

    # ─── Phase 2: backfill `sku_id` on name-only embedded arrays ───────────
    # `accounts.sku_pricing[]`, `leads.proposed_sku_pricing[]`,
    # `sampling_trials.sku_plans[]` historically stored only the SKU name
    # (`sku` field). This means a rename orphans them — we cannot rehydrate
    # the label and the dropdowns downstream can't resolve the row to a
    # current SKU.
    # Strategy: build {name_lower: sku_id} from master_skus, walk every
    # embedded row, and if the row lacks `sku_id` AND its stored name still
    # matches a current master SKU, set `sku_id` AND refresh `sku` to the
    # current name. Rows whose name no longer matches anything are surfaced
    # in the report as `orphans` so the admin knows which ones need manual
    # remapping.
    id_by_name_lower: dict = {}
    for sid, sname in name_by_id.items():
        key = (sname or "").strip().lower()
        if key:
            id_by_name_lower.setdefault(key, sid)

    for col_name, array_field, name_field in EMBEDDED_NAME_ONLY:
        col = db[col_name]
        examined = 0
        linked = 0  # rows we just gave a sku_id to
        refreshed = 0  # rows whose name we refreshed
        orphans: list = []

        cursor = col.find(
            {"tenant_id": tenant_id, array_field: {"$exists": True, "$ne": []}},
            {"_id": 1, "id": 1, "name": 1, "account_name": 1, array_field: 1},
        )
        async for d in cursor:
            arr = d.get(array_field) or []
            if not isinstance(arr, list):
                continue
            new_arr = []
            doc_changed = False
            for entry in arr:
                if not isinstance(entry, dict):
                    new_arr.append(entry)
                    continue
                examined += 1
                stored_id = entry.get("sku_id")
                stored_name = (entry.get(name_field) or "").strip()
                # Already linked → refresh name from master.
                if stored_id and stored_id in name_by_id:
                    fresh = name_by_id[stored_id]
                    if stored_name != fresh:
                        entry = {**entry, name_field: fresh}
                        refreshed += 1
                        doc_changed = True
                else:
                    # Try to backfill by current-name match.
                    key = stored_name.lower()
                    matched_id = id_by_name_lower.get(key) if key else None
                    if matched_id:
                        fresh = name_by_id[matched_id]
                        entry = {**entry, "sku_id": matched_id, name_field: fresh}
                        linked += 1
                        doc_changed = True
                    elif stored_name:
                        orphans.append({
                            "doc_id": d.get("id"),
                            "doc_label": d.get("account_name") or d.get("name"),
                            "stored_name": stored_name,
                        })
                new_arr.append(entry)
            if doc_changed and not dry_run:
                await col.update_one({"_id": d["_id"]}, {"$set": {array_field: new_arr}})

        report["collections"][f"{col_name}.{array_field}[]"] = {
            "shape": "embedded-name-only",
            "examined": examined,
            ("would_update" if dry_run else "updated"): linked + refreshed,
            "linked_by_name_match": linked,
            "refreshed_existing_link": refreshed,
            "orphans_count": len(orphans),
            # Cap to first 50 to keep the response small; full list is in logs.
            "orphans_sample": orphans[:50],
        }

    report["totals"] = {
        "examined": sum(c["examined"] for c in report["collections"].values()),
        ("would_update" if dry_run else "updated"): sum(
            c.get("would_update" if dry_run else "updated", 0)
            for c in report["collections"].values()
        ),
        "collections_touched": sum(
            1 for c in report["collections"].values()
            if c.get("would_update" if dry_run else "updated", 0) > 0
        ),
        "orphans_total": sum(
            c.get("orphans_count", 0) for c in report["collections"].values()
        ),
    }
    return report


# ─────────────────────────────────────────────────────────────────────────────
# Bulk re-link tool
# ─────────────────────────────────────────────────────────────────────────────
#
# When `rehydrate-sku-names` finds orphan pricing rows (stored name doesn't
# match any current `master_skus.sku_name`), the admin needs a way to map
# each distinct orphan name to the correct current SKU in one shot — rather
# than opening every affected Account / Lead one by one. These two endpoints
# back that workflow:
#   • GET  /orphan-pricing → groups orphan rows by their stored name, counts
#       how many Account / Lead / Sampling Trial rows reference each.
#   • POST /bulk-relink → accepts {stored_name: target_sku_id} mappings and
#       applies them across all three collections in one pass.
#
# Scope: tenant-scoped, admin-only. Idempotent (re-running with the same
# mapping is a no-op).


@router.get("/orphan-pricing")
async def list_orphan_pricing(
    current_user: dict = Depends(get_current_user),
):
    """List every embedded pricing row whose stored SKU name no longer matches
    a current `master_skus.sku_name` AND which has no `sku_id` linked.

    Grouped by the stored name so the admin sees one row per distinct orphan
    name with counts across Accounts / Leads / Sampling Trials.
    """
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()

    master_rows = await db.master_skus.find(
        {}, {"_id": 0, "id": 1, "sku_name": 1, "category": 1, "unit": 1}
    ).to_list(20000)
    name_set = {
        (r.get("sku_name") or "").strip().lower()
        for r in master_rows
        if r.get("sku_name")
    }

    def _is_orphan(entry: dict) -> bool:
        if not isinstance(entry, dict):
            return False
        if entry.get("sku_id"):
            return False  # already linked
        name = (entry.get("sku") or "").strip()
        if not name:
            return False
        return name.lower() not in name_set

    group: dict = {}

    def _bucket(stored_name: str) -> dict:
        key = stored_name.strip().lower()
        b = group.get(key)
        if not b:
            b = {
                "stored_name": stored_name.strip(),
                "account_rows": 0, "lead_rows": 0, "sampling_rows": 0,
                "sample_account_names": [], "sample_lead_names": [],
            }
            group[key] = b
        return b

    async for a in db.accounts.find(
        {"tenant_id": tenant_id, "sku_pricing.0": {"$exists": True}},
        {"_id": 0, "account_name": 1, "sku_pricing": 1},
    ):
        for sp in a.get("sku_pricing") or []:
            if _is_orphan(sp):
                b = _bucket(sp.get("sku") or "")
                b["account_rows"] += 1
                if a.get("account_name") and a["account_name"] not in b["sample_account_names"] and len(b["sample_account_names"]) < 5:
                    b["sample_account_names"].append(a["account_name"])

    async for l_doc in db.leads.find(
        {"tenant_id": tenant_id, "proposed_sku_pricing.0": {"$exists": True}},
        {"_id": 0, "name": 1, "company": 1, "proposed_sku_pricing": 1},
    ):
        label = l_doc.get("company") or l_doc.get("name") or ""
        for sp in l_doc.get("proposed_sku_pricing") or []:
            if _is_orphan(sp):
                b = _bucket(sp.get("sku") or "")
                b["lead_rows"] += 1
                if label and label not in b["sample_lead_names"] and len(b["sample_lead_names"]) < 5:
                    b["sample_lead_names"].append(label)

    async for s in db.sampling_trials.find(
        {"tenant_id": tenant_id, "sku_plans.0": {"$exists": True}},
        {"_id": 0, "sku_plans": 1},
    ):
        for sp in s.get("sku_plans") or []:
            if _is_orphan(sp):
                b = _bucket(sp.get("sku") or "")
                b["sampling_rows"] += 1

    orphans = sorted(
        group.values(),
        key=lambda b: -(b["account_rows"] + b["lead_rows"] + b["sampling_rows"]),
    )

    return {
        "tenant_id": tenant_id,
        "master_skus": [
            {"id": r["id"], "sku_name": r.get("sku_name"),
             "category": r.get("category"), "unit": r.get("unit")}
            for r in master_rows
            if r.get("id") and r.get("sku_name")
        ],
        "orphans": orphans,
        "totals": {
            "distinct_orphan_names": len(orphans),
            "total_rows": sum(
                b["account_rows"] + b["lead_rows"] + b["sampling_rows"]
                for b in orphans
            ),
        },
    }


class BulkRelinkMapping(BaseModel):
    stored_name: str
    target_sku_id: str


class BulkRelinkRequest(BaseModel):
    mappings: List[BulkRelinkMapping]


@router.post("/bulk-relink")
async def bulk_relink(
    payload: BulkRelinkRequest,
    current_user: dict = Depends(get_current_user),
):
    """Apply a batch of {stored_name → target_sku_id} relinks across every
    embedded pricing array (accounts.sku_pricing[], leads.proposed_sku_pricing[],
    sampling_trials.sku_plans[]).

    For every entry whose stored `sku` (name) matches a mapping's
    `stored_name` (case-insensitive) AND which currently has no `sku_id`, we
    set `sku_id` to the mapping's `target_sku_id` and refresh `sku` to the
    target SKU's current name. Rows already linked are skipped.
    """
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()

    if not payload.mappings:
        raise HTTPException(status_code=400, detail="No mappings provided.")

    target_ids = list({m.target_sku_id for m in payload.mappings})
    master_rows = await db.master_skus.find(
        {"id": {"$in": target_ids}},
        {"_id": 0, "id": 1, "sku_name": 1},
    ).to_list(1000)
    name_by_id = {
        r["id"]: (r.get("sku_name") or "").strip()
        for r in master_rows
        if r.get("id") and r.get("sku_name")
    }
    missing = [tid for tid in target_ids if tid not in name_by_id]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown target_sku_id(s): {missing}",
        )

    plan: dict = {}
    for m in payload.mappings:
        key = m.stored_name.strip().lower()
        if not key:
            continue
        plan[key] = (m.target_sku_id, name_by_id[m.target_sku_id])

    EMBED = [
        ("accounts", "sku_pricing"),
        ("leads", "proposed_sku_pricing"),
        ("sampling_trials", "sku_plans"),
    ]

    counters: dict = {key: {"accounts": 0, "leads": 0, "sampling_trials": 0} for key in plan}

    for col_name, array_field in EMBED:
        col = db[col_name]
        cursor = col.find(
            {"tenant_id": tenant_id, f"{array_field}.0": {"$exists": True}},
            {"_id": 1, array_field: 1},
        )
        async for d in cursor:
            arr = d.get(array_field) or []
            if not isinstance(arr, list):
                continue
            new_arr = []
            doc_changed = False
            for entry in arr:
                if not isinstance(entry, dict):
                    new_arr.append(entry)
                    continue
                if entry.get("sku_id"):
                    new_arr.append(entry)
                    continue
                stored_name = (entry.get("sku") or "").strip()
                if not stored_name:
                    new_arr.append(entry)
                    continue
                hit = plan.get(stored_name.lower())
                if not hit:
                    new_arr.append(entry)
                    continue
                target_id, target_name = hit
                new_arr.append({**entry, "sku_id": target_id, "sku": target_name})
                doc_changed = True
                counters[stored_name.lower()][col_name] += 1
            if doc_changed:
                await col.update_one(
                    {"_id": d["_id"]},
                    {"$set": {array_field: new_arr}},
                )

    report: list = []
    for m in payload.mappings:
        key = m.stored_name.strip().lower()
        c = counters.get(key, {"accounts": 0, "leads": 0, "sampling_trials": 0})
        report.append({
            "stored_name": m.stored_name,
            "target_sku_id": m.target_sku_id,
            "target_sku_name": name_by_id.get(m.target_sku_id),
            "linked_in_accounts": c["accounts"],
            "linked_in_leads": c["leads"],
            "linked_in_sampling_trials": c["sampling_trials"],
            "total_linked": c["accounts"] + c["leads"] + c["sampling_trials"],
        })

    return {
        "tenant_id": tenant_id,
        "mappings_applied": len(report),
        "totals": {
            "rows_relinked": sum(r["total_linked"] for r in report),
        },
        "results": report,
    }
