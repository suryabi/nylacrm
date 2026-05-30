"""
Iteration 197 — Revenue Analytics headline totals must be IDENTICAL regardless
of the `group_by` dimension.

Bug: Gross / Net / Invoice-count were summed from the grouped breakdown, which
aggregates differently per dimension (SKU = invoice line items → count = lines &
net = gross; City/Category = invoices → count = invoices & net = gross − credit).
So switching group_by changed the headline numbers.

Fix: `_window_totals` computes the headline from the invoices in the window,
independent of group_by. This test exercises that helper.
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


def test_window_totals_invoice_based(monkeypatch):
    # 3 invoices in-window + 1 out-of-window. Net = gross − credit note.
    docs = [
        {"invoice_date": "2026-05-03", "gross_invoice_value": 1000, "credit_note_value": 100},
        {"invoice_date": "2026-05-10", "gross_amount": 2000, "net_amount": 1800},
        {"invoice_date": "2026-05-20", "grand_total": 500},
        {"invoice_date": "2026-04-30", "gross_invoice_value": 9999},  # out of window
    ]
    monkeypatch.setattr(ra, "get_tdb", lambda: _FakeDB(docs))

    gross, net, count = _run(ra._window_totals("2026-05-01", "2026-05-31"))
    assert count == 3                       # invoices, not line items
    assert gross == 1000 + 2000 + 500       # 3500
    assert net == 900 + 1800 + 500          # 3200 (credit note applied on #1)


def test_window_totals_count_is_invoice_count(monkeypatch):
    docs = [
        {"invoice_date": "2026-05-05", "gross_invoice_value": 100,
         "items": [{"x": 1}, {"x": 2}, {"x": 3}]},  # 3 line items, still ONE invoice
    ]
    monkeypatch.setattr(ra, "get_tdb", lambda: _FakeDB(docs))
    gross, net, count = _run(ra._window_totals("2026-05-01", "2026-05-31"))
    assert count == 1
    assert gross == 100
