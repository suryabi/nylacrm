"""
Script to backdate WON leads to February 2026

This script updates the `updated_at` field for leads that:
1. Are currently in 'won' status, OR
2. Have been converted to accounts (converted_to_account: true)

Run this script in production to ensure the Target Plan dashboard
correctly calculates "Estimated Revenue from Customers On-boarded"
for the target period.

Usage:
  python backdate_won_leads.py

Environment Variables Required:
  MONGO_URL - MongoDB connection string

Options:
  --dry-run    Preview changes without applying them
  --date       Specific date to set (format: YYYY-MM-DD), default: 2026-02-15
"""

import os
import sys
from datetime import datetime, timezone
from pymongo import MongoClient

# Configuration
DEFAULT_BACKDATE = "2026-02-15"  # Middle of February
DRY_RUN = "--dry-run" in sys.argv

# Parse date argument
backdate_str = DEFAULT_BACKDATE
for arg in sys.argv:
    if arg.startswith("--date="):
        backdate_str = arg.split("=")[1]

try:
    backdate = datetime.strptime(backdate_str, "%Y-%m-%d").replace(
        hour=12, minute=0, second=0, microsecond=0, tzinfo=timezone.utc
    )
except ValueError:
    print(f"Error: Invalid date format '{backdate_str}'. Use YYYY-MM-DD")
    sys.exit(1)

# Connect to MongoDB
MONGO_URL = os.environ.get("MONGO_URL")
if not MONGO_URL:
    print("Error: MONGO_URL environment variable not set")
    print("Set it with: export MONGO_URL='mongodb://...'")
    sys.exit(1)

DB_NAME = os.environ.get("DB_NAME", "nyla_crm")

print("=" * 60)
print("BACKDATE WON LEADS SCRIPT")
print("=" * 60)
print(f"Mode: {'DRY RUN (no changes will be made)' if DRY_RUN else 'LIVE'}")
print(f"Target Date: {backdate.strftime('%Y-%m-%d %H:%M:%S')} UTC")
print(f"Database: {DB_NAME}")
print("=" * 60)

# Connect
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Find leads to update
query = {
    "$or": [
        {"status": "won"},
        {"converted_to_account": True}
    ]
}

leads_to_update = list(db.leads.find(query, {
    "_id": 0,
    "id": 1,
    "lead_id": 1,
    "company": 1,
    "status": 1,
    "converted_to_account": 1,
    "estimated_value": 1,
    "updated_at": 1
}))

print(f"\nFound {len(leads_to_update)} leads matching criteria:\n")

total_estimated_value = 0

for i, lead in enumerate(leads_to_update, 1):
    estimated = lead.get("estimated_value", 0) or 0
    total_estimated_value += estimated
    
    print(f"{i}. {lead.get('lead_id', 'N/A')} - {lead.get('company', 'Unknown')}")
    print(f"   Status: {lead.get('status', 'N/A')}")
    print(f"   Converted to Account: {lead.get('converted_to_account', False)}")
    print(f"   Estimated Value: ₹{estimated:,.2f}")
    print(f"   Current updated_at: {lead.get('updated_at', 'N/A')}")
    print()

print("=" * 60)
print(f"SUMMARY")
print("=" * 60)
print(f"Total Leads to Update: {len(leads_to_update)}")
print(f"Total Estimated Value: ₹{total_estimated_value:,.2f}")
print(f"New updated_at: {backdate.isoformat()}")
print("=" * 60)

if DRY_RUN:
    print("\n[DRY RUN] No changes made. Remove --dry-run to apply changes.")
else:
    # Confirm before proceeding
    confirm = input("\nProceed with update? (yes/no): ").strip().lower()
    
    if confirm != "yes":
        print("Aborted.")
        sys.exit(0)
    
    # Perform update
    lead_ids = [lead["id"] for lead in leads_to_update]
    
    result = db.leads.update_many(
        {"id": {"$in": lead_ids}},
        {"$set": {"updated_at": backdate.isoformat()}}
    )
    
    print(f"\n✅ Updated {result.modified_count} leads")
    print(f"   updated_at set to: {backdate.isoformat()}")

# Close connection
client.close()

print("\nDone!")
