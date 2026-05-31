"""Diagnostic: quantify why Revenue Analytics gross != SKU Performance achieved.

Run: python diag_revenue_gap.py
Compares, over an all_time window (and this_month), the two aggregation methods
on the SAME invoice set so we can see exactly what drives the gap.
"""
import asyncio
import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _gross(inv):
    return float(inv.get("gross_invoice_value") or inv.get("gross_amount")
                 or inv.get("grand_total") or inv.get("total_amount") or 0)


def _net(inv):
    v = inv.get("net_invoice_value")
    if v is None:
        v = inv.get("net_amount")
    if v is not None:
        return float(v)
    return _gross(inv) - float(inv.get("credit_note_value") or inv.get("credit_note") or 0)


def _parse_num(v):
    if v is None:
        return 0.0
    try:
        return float(str(v).replace('%', '').replace(',', '').strip())
    except Exception:
        return 0.0


def _line_value(item):
    if item.get('net_amount') is not None:
        return _parse_num(item.get('net_amount'))
    if item.get('gross_amount') is not None:
        return _parse_num(item.get('gross_amount'))
    qty = _parse_num(item.get('quantity'))
    rate = _parse_num(item.get('rate'))
    disc = _parse_num(item.get('discount_percent') or item.get('discount'))
    if disc > 100:
        disc = disc / 100.0
    return qty * rate * max(0.0, 1.0 - disc / 100.0)


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    # discover tenants
    tenants = await db.invoices.distinct("tenant_id")
    print("tenant_ids in invoices:", tenants)
    for tid in tenants:
        q = {"tenant_id": tid}
        invoices = await db.invoices.find(q, {"_id": 0}).to_list(50000)
        if not invoices:
            continue
        total_gross = sum(_gross(inv) for inv in invoices)
        total_net = sum(_net(inv) for inv in invoices)
        # line-item sum (all items, regardless of SKU resolution)
        line_sum_all = 0.0
        invoices_with_items = 0
        invoices_no_items = 0
        no_item_gross = 0.0
        sample_fields = {}
        for inv in invoices:
            items = inv.get("items") or inv.get("line_items") or []
            if items:
                invoices_with_items += 1
                for it in items:
                    line_sum_all += _line_value(it)
            else:
                invoices_no_items += 1
                no_item_gross += _gross(inv)
        # field coverage on invoices
        for inv in invoices[:1]:
            sample_fields = {k: inv.get(k) for k in (
                "source", "gross_invoice_value", "gross_amount", "grand_total",
                "total_amount", "net_invoice_value", "net_amount",
                "credit_note_value", "tax_amount", "sub_total", "invoice_date")}
        # sample line-item keys
        line_keys = set()
        for inv in invoices:
            for it in (inv.get("items") or [])[:3]:
                line_keys.update(it.keys())
            if len(line_keys) > 0:
                break
        print(f"\n=== tenant={tid} ===")
        print(f"invoices: {len(invoices)} | with_items={invoices_with_items} no_items={invoices_no_items}")
        print(f"SUM full-invoice gross  = {total_gross:,.2f}")
        print(f"SUM full-invoice net    = {total_net:,.2f}")
        print(f"SUM line-item values    = {line_sum_all:,.2f}  (ex-tax product lines, all items)")
        print(f"GAP gross - line_sum    = {total_gross - line_sum_all:,.2f}")
        print(f"  of which no-item invoices gross = {no_item_gross:,.2f}")
        print(f"  remaining gap (tax/charges/disc) = {total_gross - line_sum_all - no_item_gross:,.2f}")
        print(f"sample invoice fields: {sample_fields}")
        print(f"line-item keys seen: {sorted(line_keys)}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
