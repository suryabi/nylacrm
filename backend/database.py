"""
Database connection module - Single source of truth for MongoDB connection
Supports multi-tenant data isolation via tenant_id filtering
"""
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Import tenant context helpers
from core.tenant import get_current_tenant_id, TenantDB

def get_db():
    """Return database instance (raw, without tenant filtering)"""
    return db

def get_client():
    """Return MongoDB client"""
    return client

def get_tenant_db():
    """
    Return a tenant-aware database wrapper.
    All operations will automatically include tenant_id filtering.
    
    Usage in routes:
        from database import get_tenant_db
        tdb = get_tenant_db()
        leads = await tdb.leads.find({'status': 'active'}).to_list(100)
    """
    return TenantDB(db)

# Alias for convenience
tenant_db = property(lambda self: TenantDB(db))
