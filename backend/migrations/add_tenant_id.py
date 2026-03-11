"""
Migration Script: Add tenant_id to all existing documents
Run this once to migrate existing data to the default tenant
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

# Database connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
DEFAULT_TENANT_ID = 'nyla-air-water'

# Collections that need tenant_id
COLLECTIONS_TO_MIGRATE = [
    'users',
    'leads',
    'accounts',
    'contacts',
    'contact_categories',
    'activities',
    'tasks',
    'meetings',
    'comments',
    'files',
    'daily_statuses',
    'expense_categories',
    'expense_types',
    'invoices',
    'travel_requests',
    'budget_requests',
    'target_plans',
    'target_allocations',
    'lead_statuses',
    'business_categories',
    'locations',
    'territories',
    'skus',
    'notifications'
]


async def migrate_collection(db, collection_name: str, tenant_id: str):
    """Add tenant_id to all documents in a collection that don't have it"""
    collection = db[collection_name]
    
    # Count documents without tenant_id
    count_without = await collection.count_documents({'tenant_id': {'$exists': False}})
    
    if count_without == 0:
        print(f"  ✓ {collection_name}: Already migrated (0 documents need update)")
        return 0
    
    # Update all documents without tenant_id
    result = await collection.update_many(
        {'tenant_id': {'$exists': False}},
        {'$set': {'tenant_id': tenant_id}}
    )
    
    print(f"  ✓ {collection_name}: Migrated {result.modified_count} documents")
    return result.modified_count


async def create_default_tenant(db):
    """Create the default tenant if it doesn't exist"""
    tenant = await db.tenants.find_one({'tenant_id': DEFAULT_TENANT_ID})
    
    if tenant:
        print(f"  ✓ Default tenant '{DEFAULT_TENANT_ID}' already exists")
        return
    
    default_tenant = {
        'id': 'default-tenant-001',
        'tenant_id': DEFAULT_TENANT_ID,
        'name': 'Nyla Air Water',
        'is_active': True,
        'branding': {
            'logo_url': None,
            'favicon_url': None,
            'primary_color': '#0d9488',
            'accent_color': '#10b981',
            'app_name': 'Nyla Sales CRM',
            'tagline': 'Sales CRM'
        },
        'modules': {
            'leads': True,
            'accounts': True,
            'pipeline': True,
            'target_planning': True,
            'daily_status': True,
            'contacts': True,
            'expense_management': True,
            'travel_requests': True,
            'budget_requests': True,
            'meetings': True,
            'tasks': True,
            'files_documents': True,
            'inventory': False,
            'quality_control': False,
            'maintenance': False,
            'assets': False
        },
        'integrations': {
            'email_enabled': True,
            'calendar_enabled': True,
            'activemq_enabled': True,
            'activemq_queue': '/queue/order-invoice',
            'zoom_enabled': True,
            'google_maps_enabled': True
        },
        'settings': {
            'timezone': 'Asia/Kolkata',
            'currency': 'INR',
            'currency_symbol': '₹',
            'date_format': 'DD/MM/YYYY',
            'fiscal_year_start': '04-01'
        },
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.tenants.insert_one(default_tenant)
    print(f"  ✓ Created default tenant '{DEFAULT_TENANT_ID}'")


async def create_indexes(db):
    """Create indexes for tenant_id on all collections"""
    print("\n📊 Creating indexes...")
    
    for collection_name in COLLECTIONS_TO_MIGRATE:
        try:
            await db[collection_name].create_index('tenant_id')
            print(f"  ✓ {collection_name}: Index created")
        except Exception as e:
            print(f"  ⚠ {collection_name}: {str(e)}")


async def run_migration():
    """Main migration function"""
    print("=" * 60)
    print("🚀 Multi-Tenant Migration Script")
    print("=" * 60)
    print(f"\nDatabase: {DB_NAME}")
    print(f"Default Tenant: {DEFAULT_TENANT_ID}")
    print(f"Mongo URL: {MONGO_URL[:30]}...")
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Create default tenant
    print("\n📦 Creating default tenant...")
    await create_default_tenant(db)
    
    # Migrate collections
    print("\n📝 Migrating collections...")
    total_migrated = 0
    
    for collection_name in COLLECTIONS_TO_MIGRATE:
        try:
            count = await migrate_collection(db, collection_name, DEFAULT_TENANT_ID)
            total_migrated += count
        except Exception as e:
            print(f"  ✗ {collection_name}: Error - {str(e)}")
    
    # Create indexes
    await create_indexes(db)
    
    # Summary
    print("\n" + "=" * 60)
    print("✅ Migration Complete!")
    print(f"   Total documents migrated: {total_migrated}")
    print("=" * 60)
    
    client.close()


if __name__ == "__main__":
    asyncio.run(run_migration())
