"""
Regression: Credit notes must not be double-counted in settlement math, AND
return-linked CNs paid as cash (no delivery application) must still be counted.

Bug history:
1. (Original): Same CN counted in both `credit_applied` (via delivery) AND
   `direct_credit_issued` (via issuance row). Inflated settlement credits.
2. (Over-correction): All return-linked issuances were filtered out, dropping
   legitimate cash issuances for return-linked CNs that were never applied
   to a delivery. Settlement under-deducted.

Correct rule (per credit note):
   effective_issuance_credit = max(0, min(sum_of_issuances, original − delivery_applied))

The two channels (delivery applications, cash issuances) can both happen on the
same CN, but together they cannot exceed the CN's original amount.

This file invokes the enrichment helper directly with stubbed Mongo data so we
do not depend on a particular dataset.
"""
import asyncio
import os
import sys
import types

import pytest

# Allow `import server` from the project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routes import distributors as dist_module  # noqa: E402


class _Cursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *_args, **_kwargs):
        return self

    def __aiter__(self):
        async def _gen():
            for r in self._rows:
                yield r
        return _gen()

    async def to_list(self, _limit):
        return list(self._rows)


class _Coll:
    def __init__(self, rows):
        self._rows = rows

    def find(self, *_args, **_kwargs):
        return _Cursor(self._rows)


class _DB:
    def __init__(self, **collections):
        for name, rows in collections.items():
            setattr(self, name, _Coll(rows))


def _make_settlement(**kw):
    base = {
        "id": "stl-1",
        "tenant_id": "T",
        "distributor_id": "D",
        "account_id": "A",
        "account_name": "Empire",
        "settlement_year": 2026,
        "settlement_month": 5,
        "total_factory_return_credit": 0,
    }
    base.update(kw)
    return base


@pytest.mark.asyncio
async def test_cash_only_return_linked_cn_is_counted_once(monkeypatch):
    """CN-2026-0001 ₹1,400 fully paid as CASH (no delivery application) must
    still be counted in direct_credit_issued."""
    settlement_items = []  # delivery items not relevant
    issuances = [{
        "id": "iss1", "credit_note_id": "cn1", "credit_note_number": "CN-1",
        "amount": 1400.0, "status": "issued", "issued_at": "2026-05-10",
        "return_id": "ret-2026-0002",
    }]
    credit_notes = [{
        "id": "cn1", "tenant_id": "T", "original_amount": 1400.0,
        "applications": [],   # never applied to any delivery
    }]
    fake_db = _DB(
        distributor_settlement_items=settlement_items,
        credit_note_issuances=issuances,
        credit_notes=credit_notes,
    )
    monkeypatch.setattr(dist_module, "db", fake_db)
    settlements = [_make_settlement()]
    await dist_module._enrich_settlements_with_stockout_totals("T", settlements)
    assert settlements[0]["stockout_totals"]["direct_credit_issued"] == 1400.0


@pytest.mark.asyncio
async def test_delivery_and_issuance_for_same_cn_not_double_counted(monkeypatch):
    """Original bug case: same CN ₹450 applied to a delivery AND issued as
    cash. Issuance must contribute 0 because delivery already counted it."""
    # The delivery items will report credit_applied=450 via stockout_totals;
    # but for this test we only check direct_credit_issued. The cn doc has
    # delivery_applied=450, so capacity=0.
    issuances = [{
        "id": "iss2", "credit_note_id": "cn2", "credit_note_number": "CN-2",
        "amount": 450.0, "status": "issued", "issued_at": "2026-05-10",
        "return_id": "ret-2026-0001",
    }]
    credit_notes = [{
        "id": "cn2", "tenant_id": "T", "original_amount": 450.0,
        "applications": [{"amount_applied": 450.0, "delivery_id": "d1"}],
    }]
    fake_db = _DB(
        distributor_settlement_items=[],
        credit_note_issuances=issuances,
        credit_notes=credit_notes,
    )
    monkeypatch.setattr(dist_module, "db", fake_db)
    settlements = [_make_settlement(id="stl-2")]
    await dist_module._enrich_settlements_with_stockout_totals("T", settlements)
    assert settlements[0]["stockout_totals"]["direct_credit_issued"] == 0.0


@pytest.mark.asyncio
async def test_partial_delivery_partial_cash(monkeypatch):
    """CN ₹1,000: ₹400 applied to a delivery + ₹1,000 cash issuance.
    Effective issuance = min(1000, 1000-400) = 600.
    """
    issuances = [{
        "id": "iss3", "credit_note_id": "cn3", "credit_note_number": "CN-3",
        "amount": 1000.0, "status": "issued", "issued_at": "2026-05-10",
        "return_id": "ret-X",
    }]
    credit_notes = [{
        "id": "cn3", "tenant_id": "T", "original_amount": 1000.0,
        "applications": [{"amount_applied": 400.0, "delivery_id": "d1"}],
    }]
    fake_db = _DB(
        distributor_settlement_items=[],
        credit_note_issuances=issuances,
        credit_notes=credit_notes,
    )
    monkeypatch.setattr(dist_module, "db", fake_db)
    settlements = [_make_settlement(id="stl-3")]
    await dist_module._enrich_settlements_with_stockout_totals("T", settlements)
    assert settlements[0]["stockout_totals"]["direct_credit_issued"] == 600.0


@pytest.mark.asyncio
async def test_truly_standalone_cn_no_return_id(monkeypatch):
    """Standalone Pay-Customer CN (no return_id, no delivery applications).
    Full issuance amount counts."""
    issuances = [{
        "id": "iss4", "credit_note_id": "cn4", "credit_note_number": "CN-4",
        "amount": 800.0, "status": "issued", "issued_at": "2026-05-10",
        "return_id": None,
    }]
    credit_notes = [{
        "id": "cn4", "tenant_id": "T", "original_amount": 800.0,
        "applications": [],
    }]
    fake_db = _DB(
        distributor_settlement_items=[],
        credit_note_issuances=issuances,
        credit_notes=credit_notes,
    )
    monkeypatch.setattr(dist_module, "db", fake_db)
    settlements = [_make_settlement(id="stl-4")]
    await dist_module._enrich_settlements_with_stockout_totals("T", settlements)
    assert settlements[0]["stockout_totals"]["direct_credit_issued"] == 800.0
