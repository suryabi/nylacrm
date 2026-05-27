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
from typing import Optional

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
    }
    return report
