"""
Iteration 199 — Revenue Reconciliation bridge.

The reconciliation endpoint must tie Revenue-Analytics GROSS back to the
SKU-Performance product-line revenue with an EXACT bridge:

    Gross = Product line revenue + Tax/charges + Invoices-without-SKU-lines
            + Lines-without-an-identifier
    Net   = Gross − Credit notes

It must also surface unmapped (old/retired) SKU line revenue as a subset of the
product line revenue. This exercises the endpoint with a fake DB + resolver.
"""
import asyncio

from routes import revenue_analytics as ra


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, _n):
        return self._docs


class _FakeInvoices:
    def __init__(self, docs):
        self._docs = docs

    def find(self, query, projection=None):
        fd = query["invoice_date"]["$gte"]
        td = query["invoice_date"]["$lte"]
        return _FakeCursor([d for d in self._docs if fd <= d["invoice_date"] <= td])


class _FakeDB:
    def __init__(self, docs):
        self.invoices = _FakeInvoices(docs)


class _FakeResolver:
    """resolve() is truthy when the line has any identifier (name / sku_id /
    code) — mirroring the real resolver's verbatim fallback. unmapped_key()
    flags a pure code (no sku_id, no name) that needs an alias."""
    def resolve(self, it):
        return it.get("sku_name") or it.get("sku_id") or it.get("external_sku_id") or None

    def unmapped_key(self, it):
        if it.get("external_sku_id") and not it.get("sku_id") and not it.get("sku_name"):
            return ("code", it["external_sku_id"])
        return None


def _setup(monkeypatch, docs):
    monkeypatch.setattr(ra, "get_tdb", lambda: _FakeDB(docs))

    async def _fake_build(_tdb):
        return _FakeResolver()
    monkeypatch.setattr(ra, "build_sku_resolver", _fake_build)


def test_reconciliation_bridge_ties_out(monkeypatch):
    docs = [
        # inv1: line items sum 900 (both resolvable); gross 1000 → 100 tax; one
        # line is a pure unmapped code 'X' worth 300; credit note 100.
        {"invoice_date": "2026-05-03", "gross_invoice_value": 1000, "credit_note_value": 100,
         "items": [{"net_amount": 600, "sku_name": "A"}, {"net_amount": 300, "external_sku_id": "X"}]},
        # inv2: no line items → contributes wholly to invoices-without-SKU-lines.
        {"invoice_date": "2026-05-10", "grand_total": 500},
        # inv3: one line with NO identifier → unidentified bucket (200), product 0.
        {"invoice_date": "2026-05-20", "gross_amount": 200, "items": [{"net_amount": 200}]},
    ]
    _setup(monkeypatch, docs)

    r = _run(ra.revenue_reconciliation(time_filter="all_time", _user={}))

    assert r["gross"] == 1700.0
    assert r["product_line_revenue"] == 900.0          # matches SKU Performance basis
    assert r["tax_and_charges"] == 100.0
    assert r["invoices_without_sku_lines"] == 500.0
    assert r["invoices_without_sku_lines_count"] == 1
    assert r["unidentified_line_revenue"] == 200.0

    # The bridge must reconcile EXACTLY to gross.
    bridge = (r["product_line_revenue"] + r["tax_and_charges"]
              + r["invoices_without_sku_lines"] + r["unidentified_line_revenue"])
    assert round(bridge, 2) == r["gross"]

    # Net = gross − credit notes.
    assert r["net"] == 1600.0
    assert r["credit_notes"] == 100.0

    # Unmapped line revenue is a subset of product revenue (the 'X' code line).
    assert r["unmapped_line_revenue"] == 300.0
    assert r["unmapped_identifier_count"] == 1


def test_reconciliation_clean_data_matches_gross(monkeypatch):
    # Fully-mapped, no tax, no credit notes → product revenue == gross == net.
    docs = [
        {"invoice_date": "2026-05-05", "gross_invoice_value": 1234,
         "items": [{"net_amount": 1000, "sku_name": "A"}, {"net_amount": 234, "sku_id": "id-2"}]},
    ]
    _setup(monkeypatch, docs)
    r = _run(ra.revenue_reconciliation(time_filter="all_time", _user={}))
    assert r["gross"] == 1234.0
    assert r["product_line_revenue"] == 1234.0
    assert r["tax_and_charges"] == 0.0
    assert r["invoices_without_sku_lines"] == 0.0
    assert r["net"] == 1234.0
    assert r["unmapped_line_revenue"] == 0.0
