"""Seed persistent UI demo data for retro-categorization frontend testing."""
import asyncio, os, uuid, requests
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0]
TENANT = "nyla-air-water"
from motor.motor_asyncio import AsyncIOMotorClient

TAG = "uiretro"

async def main(clean_only=False):
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    # cleanup previous
    await db.child_skus.delete_many({"id": {"$regex": f"^{TAG}"}})
    await db.distributor_deliveries.delete_many({"id": {"$regex": f"^{TAG}"}})
    await db.distributor_delivery_items.delete_many({"delivery_id": {"$regex": f"^{TAG}"}})
    await db.distributor_stock_transfers.delete_many({"id": {"$regex": f"^{TAG}"}})
    await db.distributor_stock.delete_many({"id": {"$regex": f"^{TAG}"}})
    ships = await db.distributor_shipments.find({"tenant_id": TENANT, "$or": [{"id": {"$regex": f"^{TAG}"}}, {"shipment_number": "SHP-UIRETRO-1"}]}, {"_id": 0, "id": 1}).to_list(20)
    for s in ships:
        await db.distributor_shipments.delete_one({"id": s["id"]})
        await db.distributor_shipment_items.delete_many({"shipment_id": s["id"]})
    await db.branding_entries.delete_many({"source": "retro_categorization"})
    if clean_only:
        print("cleaned"); c.close(); return

    sku = await db.master_skus.find_one({}, {"_id": 0, "id": 1, "sku_name": 1})
    wh = await db.distributor_locations.find_one({"tenant_id": TENANT, "is_factory": True, "status": "active"}, {"_id": 0, "id": 1, "location_name": 1})
    dist = await db.distributors.find_one({"tenant_id": TENANT, "distributor_name": "Test"}, {"_id": 0, "id": 1, "distributor_name": 1})
    loc = await db.distributor_locations.find_one({"tenant_id": TENANT, "distributor_id": dist["id"], "is_factory": {"$ne": True}, "status": "active"}, {"_id": 0, "id": 1, "location_name": 1})
    acct = await db.accounts.find_one({"tenant_id": TENANT}, {"_id": 0, "id": 1, "account_name": 1})
    await db.child_skus.insert_one({"id": f"{TAG}-child", "tenant_id": TENANT, "parent_sku_id": sku["id"],
        "child_sku_name": "UIRetro BrandedCo", "child_sku_code": "UIRETRO-01", "child_type": "customer",
        "customer_account_id": acct["id"], "customer_account_name": acct.get("account_name"), "is_active": True,
        "created_at": "2026-06-01T00:00:00Z"})
    now = "2026-06-20T00:00:00Z"
    # Delivered Stock In shipment (generic line 240 units = 20 crates of 12)
    ship_id = f"{TAG}-ship"
    await db.distributor_shipments.insert_one({"id": ship_id, "tenant_id": TENANT, "shipment_number": "SHP-UIRETRO-1",
        "distributor_id": dist["id"], "distributor_name": dist["distributor_name"],
        "distributor_location_id": loc["id"], "distributor_location_name": loc["location_name"],
        "source_warehouse_id": wh["id"], "source_warehouse_name": wh["location_name"],
        "shipment_date": "2026-06-20", "status": "delivered", "total_quantity": 240,
        "total_gross_amount": 2400.0, "total_discount_amount": 0, "total_tax_amount": 0,
        "total_net_amount": 2400.0, "gst_percent": 0, "created_at": now, "updated_at": now})
    await db.distributor_shipment_items.insert_one({"id": f"{TAG}-shipitem", "tenant_id": TENANT,
        "shipment_id": ship_id, "sku_id": sku["id"], "sku_name": sku["sku_name"], "quantity": 240,
        "unit_price": 10.0, "discount_percent": 0, "tax_percent": 0, "gross_amount": 2400.0,
        "discount_amount": 0, "taxable_amount": 2400.0, "tax_amount": 0, "net_amount": 2400.0,
        "packaging_units": 12, "packages": 20, "packaging_type_name": "Crate - 12",
        "batch_id": None, "batch_code": None, "child_sku_id": None})
    # Generic on-hand stock at destination (matches the shipment)
    await db.distributor_stock.insert_one({"id": f"{TAG}-stock", "tenant_id": TENANT,
        "distributor_id": dist["id"], "distributor_location_id": loc["id"],
        "sku_id": sku["id"], "sku_name": sku["sku_name"], "batch_id": None, "child_sku_id": None,
        "quantity": 240, "created_at": now})
    # Delivered Stock Out delivery (generic line) for the account
    del_id = f"{TAG}-del"
    await db.distributor_deliveries.insert_one({"id": del_id, "tenant_id": TENANT,
        "delivery_number": "DEL-UIRETRO-1", "distributor_id": dist["id"],
        "distributor_location_id": loc["id"], "distributor_location_name": loc["location_name"],
        "account_id": acct["id"], "account_name": acct.get("account_name"), "status": "delivered",
        "delivery_date": "2026-06-21", "total_quantity": 120, "created_at": now, "updated_at": now})
    await db.distributor_delivery_items.insert_one({"id": f"{TAG}-delitem", "tenant_id": TENANT,
        "delivery_id": del_id, "sku_id": sku["id"], "sku_name": sku["sku_name"], "quantity": 120,
        "packaging_units": 12, "packages": 10, "packaging_type_name": "Crate - 12", "unit_price": 20.0,
        "gross_amount": 2400.0, "discount_amount": 0.0, "taxable_amount": 2400.0, "tax_amount": 0.0,
        "net_amount": 2400.0, "margin_amount": 240.0, "child_sku_id": None, "batch_id": None})
    # Completed Stock Transfer (generic line)
    await db.distributor_stock_transfers.insert_one({"id": f"{TAG}-tr", "tenant_id": TENANT,
        "transfer_number": "ST-UIRETRO-1", "status": "completed", "transfer_date": "2026-06-22",
        "source_distributor_id": dist["id"], "source_distributor_name": dist["distributor_name"],
        "source_location_id": wh["id"], "source_location_name": wh["location_name"],
        "dest_distributor_id": dist["id"], "dest_distributor_name": dist["distributor_name"],
        "dest_location_id": loc["id"], "dest_location_name": loc["location_name"],
        "items": [{"sku_id": sku["id"], "sku_name": sku["sku_name"], "packaging_type_name": "Crate - 12",
                   "units_per_package": 12, "quantity": 10, "quantity_units": 120, "batch_id": None,
                   "batch_code": None, "child_sku_id": None, "child_sku_name": None, "rate": 100.0,
                   "line_total": 1000.0}],
        "total_packages": 10, "total_units": 120, "total_value": 1000.0,
        "zoho_doc_type": "delivery_challan", "zoho_status": "skipped",
        "created_at": now, "created_by_name": "Seed", "updated_at": now})
    print(f"Seeded UI data: distributor={dist['id']} sku={sku['sku_name']} acct={acct['account_name']}")
    print(f"shipment=SHP-UIRETRO-1 delivery=DEL-UIRETRO-1 transfer=ST-UIRETRO-1 child=UIRetro BrandedCo")
    c.close()

import sys
asyncio.run(main(clean_only='--clean' in sys.argv))
