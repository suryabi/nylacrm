#!/usr/bin/env python3
"""
Script to Populate Lead Statuses in Production MongoDB

Usage:
    python populate_lead_statuses.py "mongodb+srv://user:password@cluster.mongodb.net/database"
    
Or set environment variable:
    export MONGO_URL="mongodb+srv://user:password@cluster.mongodb.net/database"
    python populate_lead_statuses.py
"""

import sys
import os
from pymongo import MongoClient

LEAD_STATUSES = [
    {
        "id": "new",
        "label": "New",
        "color": "blue",
        "order": 1,
        "is_active": True
    },
    {
        "id": "qualified",
        "label": "Qualified",
        "color": "green",
        "order": 2,
        "is_active": True
    },
    {
        "id": "contacted",
        "label": "Contacted",
        "color": "yellow",
        "order": 3,
        "is_active": True
    },
    {
        "id": "proposal_internal_review",
        "label": "Proposal - Internal Review",
        "color": "purple",
        "order": 4,
        "is_active": True
    },
    {
        "id": "ready_to_share_proposal",
        "label": "Ready to Share Proposal",
        "color": "cyan",
        "order": 5,
        "is_active": True
    },
    {
        "id": "proposal_shared_with_customer",
        "label": "Proposal - Shared with Customer",
        "color": "orange",
        "order": 6,
        "is_active": True
    },
    {
        "id": "trial_in_progress",
        "label": "Trial in Progress",
        "color": "indigo",
        "order": 7,
        "is_active": True
    },
    {
        "id": "won",
        "label": "Won",
        "color": "emerald",
        "order": 8,
        "is_active": True
    },
    {
        "id": "lost",
        "label": "Lost",
        "color": "red",
        "order": 9,
        "is_active": True
    },
    {
        "id": "not_qualified",
        "label": "Not Qualified",
        "color": "gray",
        "order": 10,
        "is_active": True
    }
]


def populate_lead_statuses(mongo_url: str):
    """Populate lead statuses in MongoDB"""
    
    print(f"Connecting to MongoDB...")
    client = MongoClient(mongo_url)
    
    # Extract database name from URL or use default
    db_name = mongo_url.split('/')[-1].split('?')[0] or 'nyla_crm'
    db = client[db_name]
    
    print(f"Using database: {db_name}")
    
    # Check current count
    current_count = db.lead_statuses.count_documents({})
    print(f"Current statuses in database: {current_count}")
    
    if current_count > 0:
        response = input("Statuses already exist. Do you want to replace them? (y/n): ")
        if response.lower() != 'y':
            print("Aborted.")
            return
    
    # Clear existing and insert new
    print("Clearing existing lead_statuses collection...")
    db.lead_statuses.delete_many({})
    
    print("Inserting lead statuses...")
    result = db.lead_statuses.insert_many(LEAD_STATUSES)
    
    print(f"\n✅ Successfully inserted {len(result.inserted_ids)} lead statuses!")
    
    # Verify
    print("\nVerifying inserted statuses:")
    for status in db.lead_statuses.find({}).sort('order', 1):
        print(f"  {status['order']}. {status['label']} ({status['id']}) - {status['color']}")
    
    client.close()
    print("\n✅ Done!")


if __name__ == "__main__":
    # Get MongoDB URL from argument or environment
    if len(sys.argv) > 1:
        mongo_url = sys.argv[1]
    else:
        mongo_url = os.environ.get('MONGO_URL')
    
    if not mongo_url:
        print("Error: MongoDB URL not provided.")
        print("\nUsage:")
        print('  python populate_lead_statuses.py "mongodb+srv://user:pass@cluster/db"')
        print("\nOr set environment variable:")
        print('  export MONGO_URL="mongodb+srv://user:pass@cluster/db"')
        print('  python populate_lead_statuses.py')
        sys.exit(1)
    
    populate_lead_statuses(mongo_url)
