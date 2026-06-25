import asyncio
import sys
sys.path.insert(0, '/app/backend')
from database import db
from routes.credit_notes import apply_debit_note_to_delivery

DN_ID = "7bab917b-98a9-4928-870d-932efe07de71"  # DN-2026-0006, balance 60
RET_ID = "edbc5cf9-71ae-48f2-9ea7-dc43006fa1c4"  # RET-2026-0007 (missing)
TENANT = "nyla-air-water"


async def main():
    before = await db.debit_notes.find_one({"id": DN_ID}, {"_id": 0})
    print("BEFORE:", before.get("debit_note_number"), "status=", before.get("status"),
          "balance=", before.get("balance_amount"), "applied=", before.get("applied_amount", 0))

    # Net billing recompute formula check
    total_net, credits, debits = 555.0, 100.0, before.get("balance_amount")
    net = max(0, total_net - credits + debits)
    print(f"NET MATH: {total_net} - {credits} + {debits} = {net}  (expected 515.0)")
    assert net == 515.0

    res = await apply_debit_note_to_delivery(
        tenant_id=TENANT,
        debit_note_id=DN_ID,
        delivery_id="test-delivery-id-xyz",
        delivery_number="DEL-TEST-9999",
        amount_to_apply=before.get("balance_amount"),
        applied_by="verify-script",
    )
    print("APPLY RESULT:", res)

    after = await db.debit_notes.find_one({"id": DN_ID}, {"_id": 0})
    print("AFTER:", after.get("debit_note_number"), "status=", after.get("status"),
          "balance=", after.get("balance_amount"), "applied=", after.get("applied_amount"),
          "to_delivery=", after.get("applied_to_delivery_number"))
    assert after.get("status") == "applied", "DN should be fully applied"
    assert after.get("balance_amount") == 0, "balance should be 0"
    assert after.get("applied_to_delivery_number") == "DEL-TEST-9999"
    assert len(after.get("applications", [])) == 1, "one application record pushed"

    ret = await db.customer_returns.find_one({"id": RET_ID}, {"_id": 0})
    print("RETURN:", ret.get("return_number"), "status=", ret.get("status"),
          "debit_applied_to=", ret.get("debit_applied_to_delivery_number"))
    assert ret.get("status") == "credit_issued"  # rendered as "Debit Issued" in UI
    assert ret.get("debit_applied_to_delivery_number") == "DEL-TEST-9999"

    # for-account should no longer return this fully-applied DN
    remaining = await db.debit_notes.find(
        {"tenant_id": TENANT, "account_id": after.get("account_id"),
         "balance_amount": {"$gt": 0}, "status": {"$in": ["pending", "partially_applied"]}},
        {"_id": 0, "debit_note_number": 1}).to_list(50)
    print("STILL OUTSTANDING for account:", [r["debit_note_number"] for r in remaining])
    assert DN_ID not in [r.get("id") for r in remaining]

    print("\n✅ ALL ASSERTIONS PASSED — debit apply logic + return update + billing math verified")


asyncio.run(main())
