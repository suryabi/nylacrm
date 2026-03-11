"""
Tenant Context and Middleware
Handles tenant identification and context management
"""
from fastapi import Request, HTTPException
from typing import Optional
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


def add_tenant_filter(query: dict, tenant_id: str = None) -> dict:
    """
    Add tenant_id filter to a MongoDB query.
    Usage: query = add_tenant_filter({'status': 'active'})
    """
    if tenant_id is None:
        tenant_id = get_current_tenant_id()
    
    return {**query, 'tenant_id': tenant_id}


def with_tenant_id(data: dict, tenant_id: str = None) -> dict:
    """
    Add tenant_id to a document before insert.
    Usage: doc = with_tenant_id({'name': 'Test Lead'})
    """
    if tenant_id is None:
        tenant_id = get_current_tenant_id()
    
    return {**data, 'tenant_id': tenant_id}
