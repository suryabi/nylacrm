"""
Tenant Context and Middleware
Handles tenant identification and context management
"""
from fastapi import Request, HTTPException
from typing import Optional, Any
from contextvars import ContextVar
import os

# Context variable to store current tenant
_current_tenant_id: ContextVar[Optional[str]] = ContextVar('current_tenant_id', default=None)
_current_tenant: ContextVar[Optional[dict]] = ContextVar('current_tenant', default=None)

# Default tenant for development/fallback
DEFAULT_TENANT_ID = os.environ.get('DEFAULT_TENANT_ID', 'nyla-air-water')


def get_current_tenant_id() -> str:
    """Get the current tenant ID from context"""
    tenant_id = _current_tenant_id.get()
    return tenant_id or DEFAULT_TENANT_ID


def get_current_tenant() -> Optional[dict]:
    """Get the current tenant object from context"""
    return _current_tenant.get()


def set_current_tenant(tenant_id: str, tenant: dict = None):
    """Set the current tenant in context"""
    _current_tenant_id.set(tenant_id)
    if tenant:
        _current_tenant.set(tenant)


def extract_tenant_from_request(request: Request) -> str:
    """
    Extract tenant ID from the request.
    Priority:
    1. X-Tenant-ID header (for API calls)
    2. Domain mapping (for known production domains)
    3. Subdomain (for web requests)
    4. Default tenant
    """
    # Check header first (useful for API testing and mobile apps)
    tenant_header = request.headers.get('X-Tenant-ID')
    if tenant_header:
        return tenant_header
    
    # Extract from host
    host = request.headers.get('host', '')
    
    # Handle localhost and preview environments
    if 'localhost' in host or 'preview.emergentagent.com' in host or '127.0.0.1' in host:
        return DEFAULT_TENANT_ID
    
    # Domain-to-tenant mapping for production
    # This handles cases like crm.nylaairwater.earth -> nyla-air-water
    DOMAIN_TENANT_MAP = {
        'crm.nylaairwater.earth': 'nyla-air-water',
        'nylaairwater.earth': 'nyla-air-water',
        'www.nylaairwater.earth': 'nyla-air-water',
        # Add more domain mappings as needed
    }
    
    # Check if host matches a known domain
    host_lower = host.lower().split(':')[0]  # Remove port if present
    if host_lower in DOMAIN_TENANT_MAP:
        return DOMAIN_TENANT_MAP[host_lower]
    
    # Extract subdomain (e.g., "acme" from "acme.yourapp.com")
    parts = host.split('.')
    if len(parts) >= 3:
        subdomain = parts[0]
        # Ignore www
        if subdomain != 'www':
            return subdomain
    
    return DEFAULT_TENANT_ID


async def tenant_middleware(request: Request, call_next):
    """
    Middleware to extract and set tenant context for each request.
    Should be added to FastAPI app.
    """
    # Skip tenant resolution for health checks and static files
    path = request.url.path
    if path in ['/health', '/api/health', '/favicon.ico']:
        return await call_next(request)
    
    # Extract tenant ID
    tenant_id = extract_tenant_from_request(request)
    
    # Set tenant in context
    set_current_tenant(tenant_id)
    
    # Store in request state for easy access
    request.state.tenant_id = tenant_id
    
    # Continue with request
    response = await call_next(request)
    
    return response


def tenant_query(query: dict = None, tenant_id: str = None) -> dict:
    """
    Create a tenant-filtered query for MongoDB.
    Usage: 
        await db.leads.find(tenant_query({'status': 'active'}))
        await db.leads.find(tenant_query())  # Just tenant filter
    """
    if tenant_id is None:
        tenant_id = get_current_tenant_id()
    
    if query is None:
        return {'tenant_id': tenant_id}
    
    return {**query, 'tenant_id': tenant_id}


def add_tenant_filter(query: dict, tenant_id: str = None) -> dict:
    """Alias for tenant_query - backwards compatibility"""
    return tenant_query(query, tenant_id)


def with_tenant_id(data: dict, tenant_id: str = None) -> dict:
    """
    Add tenant_id to a document before insert.
    Usage: doc = with_tenant_id({'name': 'Test Lead'})
    """
    if tenant_id is None:
        tenant_id = get_current_tenant_id()
    
    return {**data, 'tenant_id': tenant_id}


class TenantDB:
    """
    Wrapper for MongoDB collections with automatic tenant filtering.
    Usage:
        tdb = TenantDB(db)
        await tdb.leads.find({'status': 'active'})  # Auto-adds tenant_id
        await tdb.leads.insert_one({'name': 'Test'})  # Auto-adds tenant_id
    """
    def __init__(self, db, tenant_id: str = None):
        self._db = db
        self._tenant_id = tenant_id
    
    def __getattr__(self, collection_name: str):
        return TenantCollection(self._db[collection_name], self._tenant_id)


class TenantCollection:
    """
    Wrapper for a MongoDB collection with automatic tenant filtering.
    
    IMPORTANT: This is a synchronous wrapper that returns cursor objects.
    You still need to call .to_list(), .sort(), etc. on the result of find().
    
    Usage:
        tdb = TenantDB(db)
        cursor = tdb.leads.find({'status': 'active'})  # Returns cursor synchronously
        leads = await cursor.sort('created_at', -1).to_list(100)  # Await here
        
        # find_one, count_documents, insert_one, etc. are already awaitable
        lead = await tdb.leads.find_one({'id': lead_id})
    """
    
    # Collections that should NOT be filtered by tenant (global data)
    GLOBAL_COLLECTIONS = {
        'tenants',           # Tenant definitions
        'user_sessions',     # Auth sessions (include tenant_id but don't filter)
        'system_config',     # System-wide configuration
        'master_skus',       # Product catalog (shared)
        'master_territories',# Location hierarchy (shared)
        'master_states',     # State master data (shared)
        'master_cities',     # City master data (shared)
        'lead_statuses',     # Status definitions (shared)
        'business_categories', # Category definitions (shared)
        'document_categories',  # Document category definitions (shared)
        'document_subcategories', # Document subcategory definitions (shared)
        'user_activity',     # Activity tracking (cross-tenant analytics)
        'target_plans',      # Target plans (may need review)
        'sku_targets',       # SKU targets (may need review)
        'sales_targets',     # Sales targets (may need review)
        'city_targets',      # City targets (may need review)
        'resource_invoice_summary', # Invoice summaries
        'payments',          # Payments
        'bottle_previews',   # Bottle previews
    }
    
    def __init__(self, collection, tenant_id: str = None):
        self._collection = collection
        self._tenant_id = tenant_id
        self._name = collection.name
    
    @property
    def _tid(self):
        """Get tenant ID from context or use provided value"""
        return self._tenant_id or get_current_tenant_id()
    
    @property
    def name(self):
        """Return collection name"""
        return self._name
    
    def _add_tenant(self, query: dict) -> dict:
        """Add tenant_id to query if not a global collection"""
        if self._name in self.GLOBAL_COLLECTIONS:
            return query
        return {**query, 'tenant_id': self._tid} if query else {'tenant_id': self._tid}
    
    def _add_tenant_to_doc(self, doc: dict) -> dict:
        """Add tenant_id to document for insert if not a global collection"""
        if self._name in self.GLOBAL_COLLECTIONS:
            return doc
        return {**doc, 'tenant_id': self._tid}
    
    def find(self, query: dict = None, projection: dict = None):
        """
        Find documents with tenant filtering. Returns a cursor (synchronous).
        Call .to_list(), .sort(), etc. on the result.
        """
        return self._collection.find(self._add_tenant(query or {}), projection)
    
    async def find_one(self, query: dict = None, projection: dict = None, sort: list = None):
        """Find one document with tenant filtering. Optionally sort before picking the first one."""
        if sort:
            # If sort is provided, use find().sort().limit(1) instead
            cursor = self._collection.find(self._add_tenant(query or {}), projection)
            cursor = cursor.sort(sort).limit(1)
            results = await cursor.to_list(1)
            return results[0] if results else None
        return await self._collection.find_one(self._add_tenant(query or {}), projection)
    
    async def count_documents(self, query: dict = None):
        """Count documents with tenant filtering"""
        return await self._collection.count_documents(self._add_tenant(query or {}))
    
    async def insert_one(self, doc: dict):
        """Insert document with tenant_id automatically added"""
        return await self._collection.insert_one(self._add_tenant_to_doc(doc))
    
    async def insert_many(self, docs: list):
        """Insert multiple documents with tenant_id automatically added"""
        tenant_docs = [self._add_tenant_to_doc(d) for d in docs]
        return await self._collection.insert_many(tenant_docs)
    
    async def update_one(self, query: dict, update: dict, **kwargs):
        """Update one document with tenant filtering"""
        return await self._collection.update_one(self._add_tenant(query), update, **kwargs)
    
    async def update_many(self, query: dict, update: dict, **kwargs):
        """Update multiple documents with tenant filtering"""
        return await self._collection.update_many(self._add_tenant(query), update, **kwargs)
    
    async def delete_one(self, query: dict):
        """Delete one document with tenant filtering"""
        return await self._collection.delete_one(self._add_tenant(query))
    
    async def delete_many(self, query: dict):
        """Delete multiple documents with tenant filtering"""
        return await self._collection.delete_many(self._add_tenant(query))
    
    async def distinct(self, field: str, query: dict = None):
        """Get distinct values with tenant filtering"""
        return await self._collection.distinct(field, self._add_tenant(query or {}))
    
    def aggregate(self, pipeline: list):
        """
        Run aggregation pipeline with tenant filtering.
        Adds $match for tenant_id as the first stage if not a global collection.
        Returns a cursor (synchronous) - call .to_list() on the result.
        """
        if self._name not in self.GLOBAL_COLLECTIONS:
            tenant_match = {'$match': {'tenant_id': self._tid}}
            pipeline = [tenant_match] + list(pipeline)
        return self._collection.aggregate(pipeline)
    
    async def find_one_and_update(self, query: dict, update: dict, **kwargs):
        """Find and update one document with tenant filtering"""
        return await self._collection.find_one_and_update(self._add_tenant(query), update, **kwargs)
    
    async def find_one_and_delete(self, query: dict, **kwargs):
        """Find and delete one document with tenant filtering"""
        return await self._collection.find_one_and_delete(self._add_tenant(query), **kwargs)
