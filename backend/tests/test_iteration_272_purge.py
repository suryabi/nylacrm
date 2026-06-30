"""Iteration 272 — Admin purge: deletes ALL Zoho-imported accounting data for
the tenant (transactions + sync jobs + sync state + txn-code counter), guarded
by confirmation='DELETE' + admin role.

We use a SYNTHETIC tenant_id (do NOT touch the real nyla tenant).
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

TENANT = f"test-purge-iter272-{uuid.uuid4().hex[:8]}"
ADMIN_USER = {"role": "CEO", "id": "u-admin"}
NON_ADMIN_USER = {"role": "Sales Rep", "id": "u-rep"}


async def _seed():
    # 3 transactions
    docs = [
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "zoho_org_id": "ORG1",
         "zoho_transaction_id": f"ZT{i}", "amount": 100 + i, "status": "untagged"}
        for i in range(3)
    ]
    await db[at_mod.COLL].insert_many(docs)
    # 1 sync job
    await db[at_mod.SYNC_JOB_COLL].insert_one(
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "status": "completed"}
    )
    # 1 sync state
    await db[at_mod.SYNC_COLL].insert_one(
        {"tenant_id": TENANT, "last_synced_date": "2026-01-31"}
    )
    # counters doc
    await db["counters"].insert_one(
        {"_id": f"{TENANT}:accounting_txn", "seq": 42}
    )


async def _cleanup():
    await db[at_mod.COLL].delete_many({"tenant_id": TENANT})
    await db[at_mod.SYNC_JOB_COLL].delete_many({"tenant_id": TENANT})
    await db[at_mod.SYNC_COLL].delete_many({"tenant_id": TENANT})
    await db["counters"].delete_many({"_id": f"{TENANT}:accounting_txn"})


@pytest_asyncio.fixture(autouse=True, loop_scope="module")
async def _wrap():
    await _cleanup()
    yield
    await _cleanup()


async def test_purge_happy_path(monkeypatch):
    await _seed()
    monkeypatch.setattr(at_mod, "get_current_tenant_id", lambda: TENANT)

    payload = at_mod.PurgePayload(confirmation="DELETE")
    res = await at_mod.purge_imported_transactions(payload, current_user=ADMIN_USER)

    assert res["ok"] is True
    assert res["deleted_transactions"] == 3
    assert res["deleted_sync_jobs"] == 1
    assert res["reset_sync_state"] == 1

    # Verify db state
    assert await db[at_mod.COLL].count_documents({"tenant_id": TENANT}) == 0
    assert await db[at_mod.SYNC_JOB_COLL].count_documents({"tenant_id": TENANT}) == 0
    assert await db[at_mod.SYNC_COLL].count_documents({"tenant_id": TENANT}) == 0
    assert await db["counters"].find_one({"_id": f"{TENANT}:accounting_txn"}) is None


async def test_purge_wrong_confirmation_raises_400(monkeypatch):
    await _seed()
    monkeypatch.setattr(at_mod, "get_current_tenant_id", lambda: TENANT)

    with pytest.raises(HTTPException) as exc:
        await at_mod.purge_imported_transactions(
            at_mod.PurgePayload(confirmation="delete"),
            current_user=ADMIN_USER,
        )
    assert exc.value.status_code == 400
    # Nothing should be deleted
    assert await db[at_mod.COLL].count_documents({"tenant_id": TENANT}) == 3


async def test_purge_non_admin_raises_403(monkeypatch):
    await _seed()
    monkeypatch.setattr(at_mod, "get_current_tenant_id", lambda: TENANT)

    with pytest.raises(HTTPException) as exc:
        await at_mod.purge_imported_transactions(
            at_mod.PurgePayload(confirmation="DELETE"),
            current_user=NON_ADMIN_USER,
        )
    assert exc.value.status_code == 403
    assert await db[at_mod.COLL].count_documents({"tenant_id": TENANT}) == 3


async def test_purge_empty_confirmation_raises_400(monkeypatch):
    monkeypatch.setattr(at_mod, "get_current_tenant_id", lambda: TENANT)
    with pytest.raises(HTTPException) as exc:
        await at_mod.purge_imported_transactions(
            at_mod.PurgePayload(confirmation=""),
            current_user=ADMIN_USER,
        )
    assert exc.value.status_code == 400
