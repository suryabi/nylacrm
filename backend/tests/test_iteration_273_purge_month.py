"""Iteration 273 — Admin purge MONTH-SCOPED isolation.
Synthetic tenant only. Verifies date {$gte 'YYYY-MM-01', $lt next-month-01}
boundary semantics; full-purge still works; month=13 -> 400.
"""
import sys
import uuid
import pytest
import pytest_asyncio
from fastapi import HTTPException

sys.path.insert(0, "/app/backend")
pytestmark = pytest.mark.asyncio(loop_scope="module")

from routes import accounting_transactions as at_mod  # noqa: E402
from database import db  # noqa: E402

TENANT = f"test-purge-iter273-{uuid.uuid4().hex[:8]}"
ADMIN = {"role": "CEO", "id": "u-admin"}


def _mk(date_str):
    return {
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "zoho_org_id": "ORG1",
        "zoho_transaction_id": f"ZT-{date_str}-{uuid.uuid4().hex[:6]}",
        "date": date_str, "amount": 100.0, "status": "untagged",
    }


async def _cleanup():
    await db[at_mod.COLL].delete_many({"tenant_id": TENANT})
    await db[at_mod.SYNC_JOB_COLL].delete_many({"tenant_id": TENANT})
    await db[at_mod.SYNC_COLL].delete_many({"tenant_id": TENANT})
    await db["counters"].delete_many({"_id": f"{TENANT}:accounting_txn"})


@pytest_asyncio.fixture(autouse=True, loop_scope="module")
async def _wrap(monkeypatch):
    await _cleanup()
    monkeypatch.setattr(at_mod, "get_current_tenant_id", lambda: TENANT)
    yield
    await _cleanup()


async def test_month_purge_isolation_and_boundaries():
    # Seed: 3 March 2025 docs + 2 adjacent-month boundary docs
    await db[at_mod.COLL].insert_many([
        _mk("2025-03-05"), _mk("2025-03-20"), _mk("2025-03-31"),
        _mk("2025-04-01"),  # boundary: should NOT be deleted by March purge
        _mk("2025-02-28"),  # boundary: should NOT be deleted by March purge
    ])
    # Also seed sync state + counter to verify month purge leaves them untouched
    await db[at_mod.SYNC_COLL].insert_one({"tenant_id": TENANT, "last_synced_date": "2025-04-30"})
    await db["counters"].insert_one({"_id": f"{TENANT}:accounting_txn", "seq": 99})

    res = await at_mod.purge_imported_transactions(
        at_mod.PurgePayload(confirmation="DELETE", year=2025, month=3),
        current_user=ADMIN,
    )
    assert res["ok"] is True
    assert res["scope"] == "month"
    assert res["period"] == "2025-03"
    assert res["deleted_transactions"] == 3

    # Verify only March docs gone; April + Feb remain
    remaining = await db[at_mod.COLL].find(
        {"tenant_id": TENANT}, {"_id": 0, "date": 1}
    ).to_list(None)
    dates = sorted(d["date"] for d in remaining)
    assert dates == ["2025-02-28", "2025-04-01"], f"unexpected remaining: {dates}"

    # Sync state + counter UNTOUCHED
    assert await db[at_mod.SYNC_COLL].count_documents({"tenant_id": TENANT}) == 1
    cnt = await db["counters"].find_one({"_id": f"{TENANT}:accounting_txn"})
    assert cnt is not None and cnt["seq"] == 99

    # Now purge April -> deletes only the April doc
    res2 = await at_mod.purge_imported_transactions(
        at_mod.PurgePayload(confirmation="DELETE", year=2025, month=4),
        current_user=ADMIN,
    )
    assert res2["scope"] == "month"
    assert res2["period"] == "2025-04"
    assert res2["deleted_transactions"] == 1
    remaining2 = await db[at_mod.COLL].find(
        {"tenant_id": TENANT}, {"_id": 0, "date": 1}
    ).to_list(None)
    assert [d["date"] for d in remaining2] == ["2025-02-28"]


async def test_month_purge_december_boundary():
    """Dec 2025 -> {$gte '2025-12-01', $lt '2026-01-01'} (year rollover)."""
    await db[at_mod.COLL].insert_many([
        _mk("2025-12-15"), _mk("2025-12-31"),
        _mk("2026-01-01"),  # boundary, must NOT be deleted
    ])
    res = await at_mod.purge_imported_transactions(
        at_mod.PurgePayload(confirmation="DELETE", year=2025, month=12),
        current_user=ADMIN,
    )
    assert res["scope"] == "month" and res["period"] == "2025-12"
    assert res["deleted_transactions"] == 2
    remaining = await db[at_mod.COLL].find(
        {"tenant_id": TENANT}, {"_id": 0, "date": 1}
    ).to_list(None)
    assert [d["date"] for d in remaining] == ["2026-01-01"]


async def test_month_13_raises_400():
    with pytest.raises(HTTPException) as exc:
        await at_mod.purge_imported_transactions(
            at_mod.PurgePayload(confirmation="DELETE", year=2025, month=13),
            current_user=ADMIN,
        )
    assert exc.value.status_code == 400


async def test_full_purge_no_month_year_clears_everything():
    # Seed txns + sync state + counter
    await db[at_mod.COLL].insert_many([_mk("2025-05-10"), _mk("2025-06-10")])
    await db[at_mod.SYNC_COLL].insert_one({"tenant_id": TENANT, "last_synced_date": "2025-06-30"})
    await db["counters"].insert_one({"_id": f"{TENANT}:accounting_txn", "seq": 5})

    res = await at_mod.purge_imported_transactions(
        at_mod.PurgePayload(confirmation="DELETE"),
        current_user=ADMIN,
    )
    assert res["ok"] is True
    assert res["scope"] == "all"
    assert res["deleted_transactions"] == 2
    assert res["reset_sync_state"] == 1
    assert await db[at_mod.COLL].count_documents({"tenant_id": TENANT}) == 0
    assert await db[at_mod.SYNC_COLL].count_documents({"tenant_id": TENANT}) == 0
    assert await db["counters"].find_one({"_id": f"{TENANT}:accounting_txn"}) is None
