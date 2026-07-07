import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv()
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

async def main():
    # Find A330-ish SKU
    skus = await db.master_skus.find(
        {"$or": [{"name": {"$regex": "330", "$options": "i"}},
                 {"sku_name": {"$regex": "330", "$options": "i"}},
                 {"sku_code": {"$regex": "A330|330", "$options": "i"}}]},
        {"_id": 0, "id": 1, "name": 1, "sku_name": 1, "sku_code": 1, "base_uom": 1,
         "bottles_per_crate": 1, "unit": 1, "packaging_config": 1}
    ).to_list(20)
    for s in skus:
        print("=== SKU", s.get("sku_code"), s.get("name") or s.get("sku_name"), "id=", s.get("id"))
        print("   base_uom=", s.get("base_uom"), "bottles_per_crate=", s.get("bottles_per_crate"), "unit=", s.get("unit"))
        pc = s.get("packaging_config") or {}
        for k in ("production", "stock_out", "master", "stock_in"):
            arr = pc.get(k) or []
            print("   pkg[%s]:" % k, [(p.get("packaging_type_name"), p.get("units_per_package"), p.get("is_default")) for p in arr])

    print("\n\n=== Recent stock transfers (last 8) ===")
    trs = await db.distributor_stock_transfers.find({}, {"_id": 0}).sort("created_at", -1).to_list(8)
    for t in trs:
        print("TR", t.get("transfer_number"), "|", t.get("source_location_name"), "(fac=%s)"%t.get("source_is_factory"),
              "->", t.get("dest_location_name"), "(fac=%s)"%t.get("dest_is_factory"), "| total_pkgs=", t.get("total_packages"), "total_units=", t.get("total_units"))
        for it in t.get("items", []):
            print("     item:", it.get("sku_name"), "qty(pkgs)=", it.get("quantity"), "upp=", it.get("units_per_package"), "qty_units=", it.get("quantity_units"), "pkg=", it.get("packaging_type_name"))

asyncio.run(main())
