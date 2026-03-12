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
    2. Subdomain (for web requests)
    3. Default tenant
    """
    # Check header first (useful for API testing and mobile apps)
    tenant_header = request.headers.get('X-Tenant-ID')
    if tenant_header:
        return tenant_header
    
    # Extract from subdomain
    host = request.headers.get('host', '')
    
    # Handle localhost and preview environments
    if 'localhost' in host or 'preview.emergentagent.com' in host or '127.0.0.1' in host:
        return DEFAULT_TENANT_ID
    
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
    """Wrapper for a MongoDB collection with tenant filtering"""
    
    # Collections that should NOT be filtered by tenant
    GLOBAL_COLLECTIONS = {'tenants', 'user_sessions', 'system_config'}
    
    def __init__(self, collection, tenant_id: str = None):
        self._collection = collection
        self._tenant_id = tenant_id
        self._name = collection.name
    
    @property
    def _tid(self):
        return self._tenant_id or get_current_tenant_id()
    
    def _add_tenant(self, query: dict) -> dict:
        if self._name in self.GLOBAL_COLLECTIONS:
            return query
        return {**query, 'tenant_id': self._tid} if query else {'tenant_id': self._tid}
    
    def _add_tenant_to_doc(self, doc: dict) -> dict:
        if self._name in self.GLOBAL_COLLECTIONS:
            return doc
        return {**doc, 'tenant_id': self._tid}
    
    async def find(self, query: dict = None, projection: dict = None):
        return self._collection.find(self._add_tenant(query or {}), projection)
    
    async def find_one(self, query: dict = None, projection: dict = None):
        return await self._collection.find_one(self._add_tenant(query or {}), projection)
    
    async def count_documents(self, query: dict = None):
        return await self._collection.count_documents(self._add_tenant(query or {}))
    
    async def insert_one(self, doc: dict):
        return await self._collection.insert_one(self._add_tenant_to_doc(doc))
    
    async def insert_many(self, docs: list):
        tenant_docs = [self._add_tenant_to_doc(d) for d in docs]
        return await self._collection.insert_many(tenant_docs)
    
    async def update_one(self, query: dict, update: dict, **kwargs):
        return await self._collection.update_one(self._add_tenant(query), update, **kwargs)
    
    async def update_many(self, query: dict, update: dict, **kwargs):
        return await self._collection.update_many(self._add_tenant(query), update, **kwargs)
    
    async def delete_one(self, query: dict):
        return await self._collection.delete_one(self._add_tenant(query))
    
    async def delete_many(self, query: dict):
        return await self._collection.delete_many(self._add_tenant(query))
    
    async def distinct(self, field: str, query: dict = None):
        return await self._collection.distinct(field, self._add_tenant(query or {}))
    
    async def aggregate(self, pipeline: list):
        # Add tenant match as first stage if not global collection
        if self._name not in self.GLOBAL_COLLECTIONS:
            tenant_match = {'$match': {'tenant_id': self._tid}}
            pipeline = [tenant_match] + list(pipeline)
        return self._collection.aggregate(pipeline)
