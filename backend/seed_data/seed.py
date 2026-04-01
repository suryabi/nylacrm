"""
Seed Script — Populate a fresh MongoDB with test data from exported JSON files.

Usage:
    python seed_data/seed.py                          # Uses MONGO_URL from .env, DB_NAME from .env
    python seed_data/seed.py --db-name my_new_db      # Override database name
    python seed_data/seed.py --mongo-url mongodb://... # Override connection string
    python seed_data/seed.py --drop                    # Drop existing collections before seeding
    python seed_data/seed.py --collections users leads accounts  # Seed only specific collections

This script reads all .json files in the seed_data/ directory and inserts them
into the target MongoDB database. Each file corresponds to one collection.
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from pymongo import MongoClient
except ImportError:
    print("pymongo not installed. Run: pip install pymongo")
    sys.exit(1)


def load_env(env_path):
    """Simple .env parser (no dependencies needed)."""
    env = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    env[key.strip()] = val.strip().strip('"').strip("'")
    return env


def seed(mongo_url, db_name, drop=False, only_collections=None):
    """Seed the database from JSON files."""
    client = MongoClient(mongo_url)
    db = client[db_name]
    
    seed_dir = Path(__file__).parent
    json_files = sorted(seed_dir.glob("*.json"))
    
    if not json_files:
        print(f"No JSON files found in {seed_dir}")
        return
    
    print(f"Connecting to: {mongo_url}")
    print(f"Database: {db_name}")
    print(f"Found {len(json_files)} collection files")
    print("-" * 50)
    
    total_docs = 0
    seeded_collections = 0
    
    for json_file in json_files:
        coll_name = json_file.stem  # filename without .json
        
        # Skip if only specific collections requested
        if only_collections and coll_name not in only_collections:
            continue
        
        with open(json_file) as f:
            docs = json.load(f)
        
        if not docs:
            continue
        
        if drop:
            db[coll_name].drop()
        
        # Check if collection already has data
        existing = db[coll_name].count_documents({})
        if existing > 0 and not drop:
            print(f"  SKIP {coll_name}: already has {existing} docs (use --drop to overwrite)")
            continue
        
        # Insert documents
        if isinstance(docs, list) and len(docs) > 0:
            db[coll_name].insert_many(docs)
            print(f"  OK   {coll_name}: {len(docs)} docs inserted")
            total_docs += len(docs)
            seeded_collections += 1
    
    print("-" * 50)
    print(f"Done! Seeded {seeded_collections} collections, {total_docs} total documents")
    client.close()


def main():
    parser = argparse.ArgumentParser(description="Seed MongoDB with test data")
    parser.add_argument("--mongo-url", help="MongoDB connection string (default: from .env)")
    parser.add_argument("--db-name", help="Database name (default: from .env)")
    parser.add_argument("--drop", action="store_true", help="Drop existing collections before seeding")
    parser.add_argument("--collections", nargs="+", help="Only seed specific collections")
    
    args = parser.parse_args()
    
    # Load defaults from .env
    env_path = Path(__file__).parent.parent / ".env"
    env = load_env(str(env_path))
    
    mongo_url = args.mongo_url or env.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = args.db_name or env.get("DB_NAME", "test_database")
    
    seed(mongo_url, db_name, drop=args.drop, only_collections=args.collections)


if __name__ == "__main__":
    main()
