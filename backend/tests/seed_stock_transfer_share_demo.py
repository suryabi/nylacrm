"""Seed demo Stock Transfers (with generic + branded Child SKU lines) so the
Share-by-email flow (table body + xlsx attachment) can be verified in Preview.

Creates a 'Seed Demo Distributor' (contact email = the admin's own address, so
test sends land in your inbox) with a Pune warehouse, and three transfers from
Brian / Bangalore Warehouse:
  ST-SEED-0001  Invoice, synced, 4 lines (2 generic, 2 branded) — share-ready
  ST-SEED-0002  Delivery Challan, synced, 2 lines               — share-ready
  ST-SEED-0003  pending (not synced)                             — share blocked
Zoho is not connected in Preview, so the PDF is skipped at send time (link +
table + spreadsheet still go out). Idempotent. Run with --clean to remove."""
import sys, pathlib
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

env = {}
for line in pathlib.Path("/app/backend/.env").read_text().splitlines():
    if "=" in line:
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
TENANT = "nyla-air-water"
TAG = "SEED-STS"
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
DIST_ID, LOC_ID = "seed-sts-dist", "seed-sts-loc"
SRC_DIST, SRC_LOC = "bb12d90e-4d33-4890-ac5f-17573c551b5c", "5fff767e-7aed-4a36-b805-313ac286963d"
SKU600, SKU330 = "20d525e8-c4af-4f40-965a-549dcd50c0a9", "b39203a7-4067-458b-a316-5831a98be946"
CHILD600 = ("208de0cb-63df-406a-ab45-61c7e97b401c", "Demo Franchise – 600 ml")
CHILD330 = ("seed-csd-child-2-24", "Seed C – 330 ml")

if "--clean" in sys.argv:
    n = db.distributor_stock_transfers.delete_many({"tenant_id": TENANT, "seed_tag": TAG}).deleted_count
    db.distributor_locations.delete_many({"tenant_id": TENANT, "id": LOC_ID})
    db.distributors.delete_many({"tenant_id": TENANT, "id": DIST_ID})
    print(f"cleaned {n} transfers + demo distributor")
    sys.exit(0)

now = datetime.now(timezone.utc)
iso = now.isoformat()
db.distributors.update_one({"id": DIST_ID}, {"$set": {
    "id": DIST_ID, "tenant_id": TENANT, "distributor_code": "DIST-SEED", "distributor_name": "Seed Demo Distributor",
    "legal_entity_name": "Seed Demo Distributor Pvt Ltd", "city": "Pune", "gstin": "27AAACS1234A1Z5", "status": "active",
    "is_self_managed": False, "primary_contact_name": "Seed Demo Contact", "primary_contact_email": ADMIN_EMAIL,
    "primary_contact_mobile": "+919876500000", "seed_tag": TAG, "created_at": iso, "updated_at": iso}}, upsert=True)
db.distributor_locations.update_one({"id": LOC_ID}, {"$set": {
    "id": LOC_ID, "tenant_id": TENANT, "distributor_id": DIST_ID, "location_code": "SEED-PUNE", "location_name": "Pune Warehouse",
    "city": "Pune", "state": "Maharashtra", "is_default": True, "is_factory": False, "status": "active", "track_batches": True,
    "seed_tag": TAG, "created_at": iso, "updated_at": iso}}, upsert=True)


def line(sku_id, sku_name, upp, pkg_name, pkg_id, qty, child=None, batch=None, rate_pb=10.0):
    return {
        "sku_id": sku_id, "sku_name": sku_name, "packaging_type_id": pkg_id, "packaging_type_name": pkg_name,
        "units_per_package": upp, "quantity": qty, "quantity_units": qty * upp,
        "batch_id": f"seed-batch-{batch}" if batch else None, "batch_code": batch,
        "child_sku_id": child[0] if child else None, "child_sku_name": child[1] if child else None,
        "rate": round(rate_pb * upp, 2), "rate_per_bottle": rate_pb, "rate_source": "master_sku.base_price",
        "rate_source_entry_id": None, "line_total": round(qty * rate_pb * upp, 2),
    }


CR12 = ("Crate - 12", "864f1d58-e21c-43eb-91a5-4bfd787f7e64")
CR24 = ("Crate - 24", "b6eca15e-de09-4265-a64c-c5ada1e62289")
S600, S330 = "Nyla – 600 ml / Silver", "Nyla – 330 ml / Silver"
TRANSFERS = [
    ("ST-SEED-0001", "invoice", "synced", "INV-SEED-0001", "completed", 3, "MH-12-AB-4567",
     "Demo transfer — verify email table & spreadsheet", [
         line(SKU600, S600, 12, *CR12, 20, batch="B2606-0412"),
         line(SKU330, S330, 24, *CR24, 15, batch="B2606-0398"),
         line(SKU600, S600, 12, *CR12, 10, child=CHILD600, batch="B2606-0412"),
         line(SKU330, S330, 24, *CR24, 6, child=CHILD330, batch="B2606-0398"),
     ]),
    ("ST-SEED-0002", "delivery_challan", "synced", "DC-SEED-0002", "completed", 1, "MH-12-CD-8910", None, [
         line(SKU600, S600, 12, *CR12, 8, child=CHILD600, batch="B2606-0455"),
         line(SKU600, S600, 12, *CR12, 12, batch="B2606-0455"),
     ]),
    ("ST-SEED-0003", "invoice", "pending", None, "draft", 0, None, "Not yet synced to Zoho — share is blocked", [
         line(SKU330, S330, 24, *CR24, 5, batch="B2606-0470"),
     ]),
]
for num, doc_type, zstatus, znum, status, days_ago, vehicle, notes, items in TRANSFERS:
    tid = f"seed-sts-{num.lower()}"
    db.distributor_stock_transfers.update_one({"id": tid}, {"$set": {
        "id": tid, "tenant_id": TENANT, "seed_tag": TAG, "transfer_number": num,
        "transfer_date": (now - timedelta(days=days_ago)).strftime("%Y-%m-%d"),
        "source_distributor_id": SRC_DIST, "source_distributor_name": "Brian", "source_location_id": SRC_LOC,
        "source_location_name": "Bangalore Warehouse", "source_kind": "factory", "source_is_factory": True,
        "source_gstin": "06AAFCJ4820K1ZJ", "source_pan": "AAFCJ4820K", "source_is_self_managed": True,
        "dest_distributor_id": DIST_ID, "dest_distributor_name": "Seed Demo Distributor", "dest_location_id": LOC_ID,
        "dest_location_name": "Pune Warehouse", "dest_kind": "distributor", "dest_is_factory": False,
        "dest_gstin": "27AAACS1234A1Z5", "dest_pan": "AAACS1234A", "dest_is_self_managed": False,
        "items": items, "total_packages": sum(i["quantity"] for i in items), "total_units": sum(i["quantity_units"] for i in items),
        "total_value": round(sum(i["line_total"] for i in items), 2), "notes": notes, "vehicle_number": vehicle,
        "zoho_doc_type": doc_type, "zoho_status": zstatus,
        "zoho_invoice_id": f"seed-zoho-{num.lower()}" if zstatus == "synced" else None,
        "zoho_invoice_number": znum, "zoho_invoice_url": None, "zoho_error": None,
        "status": status, "created_at": (now - timedelta(days=days_ago)).isoformat(), "created_by": "seed",
        "created_by_name": "Seed Script", "updated_at": iso}}, upsert=True)
    print(f"{num}: {len(items)} lines, {sum(i['quantity'] for i in items)} crates, zoho={zstatus}")
print(f"Done. Share emails default To → {ADMIN_EMAIL}. Remove with --clean.")
