"""
Iteration 194 — System-generated (company-billed Zoho) invoices must ADD their
net to the account's running outstanding balance, exactly once.

Bug: the delivery→Zoho mirror invoice was saved with `outstanding=0` and never
touched `account.outstanding_balance`, so the per-invoice "Outstanding" column
showed ₹0 and the account balance didn't move. External (`external_api`)
invoices OVERWRITE the balance; system-generated ones must INCREMENT it.

Fix: in `_ensure_mirror_invoice`, on the FIRST mirror of a delivery, add the
invoice's net to `outstanding_balance` and stamp the new running balance on the
invoice. Retries/re-syncs must not double-count.

These tests use a tiny in-memory fake of the Mongo handle used by the service.
"""
import asyncio
import copy

import pytest

from services import zoho_service


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _matches(doc, query):
    for k, v in query.items():
        if k == "$or":
            if not any(_matches(doc, clause) for clause in v):
                return False
        elif k in ("$ne",):
            return True  # not used at doc level here
        elif isinstance(v, dict) and "$ne" in v:
            if doc.get(k) == v["$ne"]:
                return False
        else:
            if doc.get(k) != v:
                return False
    return True


class _FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                return copy.deepcopy(d)
        return None

    async def update_one(self, query, update, upsert=False):
        target = None
        for d in self.docs:
            if _matches(d, query):
                target = d
                break
        if target is None:
            if not upsert:
                return
            target = {}
            # seed literal (non-operator) fields from the query
            for k, v in query.items():
                if not k.startswith("$"):
                    target[k] = v
            target.update(update.get("$setOnInsert", {}))
            self.docs.append(target)
        for k, v in update.get("$set", {}).items():
            target[k] = v
        for k, v in update.get("$inc", {}).items():
            target[k] = float(target.get(k) or 0) + v


class _FakeDB:
    def __init__(self):
        self.invoices = _FakeCollection()
        self.accounts = _FakeCollection()


def _delivery():
    return {
        "id": "DEL-UUID-1",
        "delivery_number": "DEL-001880",
        "delivery_date": "2026-05-29",
        "distributor_id": "DIST-1",
    }


def _items():
    return [{"sku_name": "Nyla 660ml", "quantity": 10, "unit_price": 20}]  # net = 200


def _account():
    return {"id": "ACCT-UUID-1", "account_name": "Forge Cafe", "sku_pricing": []}


def _setup(monkeypatch, starting_balance):
    fake = _FakeDB()
    fake.accounts.docs.append({
        "id": "ACCT-UUID-1", "account_id": "FORG-HYD-A26-001",
        "tenant_id": "nyla", "outstanding_balance": starting_balance,
    })
    monkeypatch.setattr(zoho_service, "db", fake)

    async def _fake_creds(_tid):
        return {"organization_id": "ORG1"}
    monkeypatch.setattr(zoho_service, "get_credentials", _fake_creds)
    return fake


def test_first_mirror_adds_net_to_outstanding(monkeypatch):
    fake = _setup(monkeypatch, starting_balance=1000.0)

    _run(zoho_service._ensure_mirror_invoice(
        tenant_id="nyla", delivery=_delivery(), items=_items(), account=_account(),
        zoho_invoice_id="ZID1", zoho_invoice_number="INV-001880", zoho_invoice_url="http://z",
    ))

    assert len(fake.invoices.docs) == 1
    inv = fake.invoices.docs[0]
    assert inv["net_invoice_value"] == 200
    # Per-invoice outstanding = new running balance (1000 + 200).
    assert inv["outstanding"] == 1200.0, inv["outstanding"]
    assert inv["outstanding_counted"] is True
    # Account balance incremented by the net.
    assert fake.accounts.docs[0]["outstanding_balance"] == 1200.0


def test_resync_does_not_double_count(monkeypatch):
    fake = _setup(monkeypatch, starting_balance=1000.0)

    for _ in range(3):  # simulate retries / repeated re-syncs
        _run(zoho_service._ensure_mirror_invoice(
            tenant_id="nyla", delivery=_delivery(), items=_items(), account=_account(),
            zoho_invoice_id="ZID1", zoho_invoice_number="INV-001880", zoho_invoice_url="http://z",
        ))

    # Still exactly one invoice; balance added only once.
    assert len(fake.invoices.docs) == 1
    assert fake.invoices.docs[0]["outstanding"] == 1200.0
    assert fake.accounts.docs[0]["outstanding_balance"] == 1200.0
