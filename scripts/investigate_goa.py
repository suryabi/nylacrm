import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path('/app/backend/.env'))
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

def gross(inv):
    return float(inv.get("gross_invoice_value") or inv.get("gross_amount") or inv.get("grand_total") or inv.get("total_amount") or 0)
def net(inv):
    v = inv.get("net_invoice_value")
    if v is None: v = inv.get("net_amount")
    if v is not None: return float(v)
    return gross(inv) - float(inv.get("credit_note_value") or inv.get("credit_note") or 0)

async def main():
    # find tenants
    tenants = await db.invoices.distinct("tenant_id")
    print("tenant_ids in invoices:", tenants)
    for tid in tenants:
        invs = await db.invoices.find({"tenant_id": tid}).to_list(50000)
        accounts = await db.accounts.find({"tenant_id": tid}).to_list(20000)
        by_code = {a.get("account_id"): a for a in accounts if a.get("account_id")}
        by_uuid = {a.get("id"): a for a in accounts if a.get("id")}
        by_name = {(a.get("account_name") or "").strip().lower(): a for a in accounts if a.get("account_name")}
        # buckets by state
        state_sum = {}
        goa_invoices = []
        unmatched = []
        for inv in invs:
            acc=None
            f = inv.get("account_id") or inv.get("account_uuid")
            if f: acc = by_code.get(f) or by_uuid.get(f)
            if not acc:
                nm=(inv.get("account_name") or inv.get("customer_name") or "").strip().lower()
                if nm: acc=by_name.get(nm)
            state = (acc or {}).get("state") or "Uncategorised"
            city = (acc or {}).get("city") or "Uncategorised"
            state_sum.setdefault(state, [0.0,0]); state_sum[state][0]+=net(inv); state_sum[state][1]+=1
            blob = (str(inv.get("account_name",""))+str(inv.get("customer_name",""))+str(city)+str(state)).lower()
            if "goa" in blob:
                goa_invoices.append((inv.get("invoice_number") or inv.get("invoice_id"), inv.get("invoice_date"), inv.get("account_name") or inv.get("customer_name"), city, state, net(inv), gross(inv), bool(acc), inv.get("source") or inv.get("type")))
            if not acc:
                unmatched.append((inv.get("invoice_number"), inv.get("account_name") or inv.get("customer_name"), inv.get("account_id"), inv.get("account_uuid"), net(inv)))
        print(f"\n=== tenant {tid}: {len(invs)} invoices, {len(accounts)} accounts ===")
        for s,(v,c) in sorted(state_sum.items(), key=lambda x:-x[1][0]):
            print(f"  state={s!r:30} net={v:14.2f} count={c}")
        print(f"  -- GOA-related invoices: {len(goa_invoices)} --")
        tot=0
        for g in goa_invoices:
            print("    ", g); tot+=g[5]
        print("    GOA net total:", tot)
        print(f"  -- unmatched (no account) invoices: {len(unmatched)}, net sum={sum(u[4] for u in unmatched):.2f}")
        for u in unmatched[:20]:
            print("      UNMATCHED", u)

asyncio.run(main())
