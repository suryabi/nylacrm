"""
Authentication routes - Login, Register, OAuth, Sessions
Multi-tenant aware - queries filter by tenant_id
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from datetime import datetime, timezone, timedelta
import uuid
import httpx
import os
import logging

from database import get_tenant_db, db
from models.user import User, UserCreate, UserLogin
from deps import hash_password, verify_password, get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()
logger = logging.getLogger(__name__)

def get_tdb():
    """Get tenant-aware database wrapper"""
    return get_tenant_db()


async def get_tenant_google_config(tenant_id: str):
    """Get Google Workspace config for a tenant"""
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0, "auth_config": 1})
    if not tenant:
        return None
    
    auth_config = tenant.get('auth_config', {})
    google_ws = auth_config.get('google_workspace', {})
    
    return {
        "enabled": google_ws.get('enabled', False),
        "allowed_domain": google_ws.get('allowed_domain'),
        "client_id": google_ws.get('client_id'),
        "client_secret": google_ws.get('client_secret')
    }


@router.post("/register", response_model=User)
async def register(user_input: UserCreate):
    """Register a new user"""
    tdb = get_tdb()
    existing = await tdb.users.find_one({'email': user_input.email}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    hashed_pw = hash_password(user_input.password)
    user_data = user_input.model_dump()
    user_data.pop('password')
    user_obj = User(**user_data)
    
    doc = user_obj.model_dump()
    doc['password'] = hashed_pw
    doc['created_at'] = doc['created_at'].isoformat()
    
    await tdb.users.insert_one(doc)
    return user_obj


@router.post("/login")
async def login(credentials: UserLogin, response: Response):
    """Login with email and password"""
    tdb = get_tdb()
    user_doc = await tdb.users.find_one({'email': credentials.email}, {'_id': 0})
    if not user_doc or not user_doc.get('password') or not verify_password(credentials.password, user_doc['password']):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    if not user_doc.get('is_active', True):
        raise HTTPException(status_code=401, detail='Account is inactive')
    
    session_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    # Sessions are global (not tenant-filtered)
    await db.user_sessions.insert_one({
        'user_id': user_doc['id'],
        'tenant_id': get_current_tenant_id(),
        'session_token': session_token,
        'expires_at': expires_at.isoformat(),
        'created_at': datetime.now(timezone.utc).isoformat()
    })
    
    response.set_cookie(
        key='session_token',
        value=session_token,
        httponly=True,
        secure=True,
        samesite='none',
        max_age=7*24*60*60,
        path='/'
    )
    
    user_doc.pop('password')
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    return {
        'user': user_doc,
        'session_token': session_token
    }

@router.get("/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user"""
    if isinstance(current_user['created_at'], str):
        current_user['created_at'] = datetime.fromisoformat(current_user['created_at'])
    return current_user


@router.post("/logout")
async def logout_user(request: Request, response: Response):
    """Logout user by deleting session"""
    session_token = request.cookies.get('session_token')
    
    if session_token:
        # Sessions are global
        await db.user_sessions.delete_one({'session_token': session_token})
        response.delete_cookie('session_token', path='/')
    
    return {'message': 'Logged out successfully'}


@router.post("/google-callback")
async def google_oauth_callback(request: Request, response: Response):
    """Handle Google OAuth callback"""
    tdb = get_tdb()
    body = await request.json()
    code = body.get('code')
    redirect_uri = body.get('redirect_uri')
    
    if not code:
        raise HTTPException(status_code=400, detail='Authorization code required')
    
    try:
        client_id = os.environ['GOOGLE_OAUTH_CLIENT_ID']
        client_secret = os.environ['GOOGLE_OAUTH_CLIENT_SECRET']
        if not redirect_uri:
            redirect_uri = os.environ.get('GOOGLE_OAUTH_REDIRECT_URI', '')
        
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                'https://oauth2.googleapis.com/token',
                data={
                    'code': code,
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'redirect_uri': redirect_uri,
                    'grant_type': 'authorization_code'
                }
            )
            
            tokens = token_response.json()
            
            if 'error' in tokens:
                raise HTTPException(status_code=400, detail=tokens['error'])
            
            user_info_response = await client.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f"Bearer {tokens['access_token']}"}
            )
            
            user_info = user_info_response.json()
        
        user_email = user_info['email'].strip().lower()
        
        existing_user = await tdb.users.find_one(
            {'email': {'$regex': f'^{user_email}$', '$options': 'i'}},
            {'_id': 0}
        )
        
        if not existing_user:
            raise HTTPException(
                status_code=403,
                detail=f'No account found for {user_email}. Please contact your administrator.'
            )
        
        user_id = existing_user['id']
        
        await tdb.users.update_one(
            {'email': user_email},
            {'$set': {
                'name': user_info.get('name', existing_user.get('name')),
                'avatar': user_info.get('picture', ''),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
        
        session_token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        await db.user_sessions.insert_one({
            'user_id': user_id,
            'tenant_id': get_current_tenant_id(),
            'session_token': session_token,
            'expires_at': expires_at.isoformat(),
            'created_at': datetime.now(timezone.utc).isoformat()
        })
        
        response.set_cookie(
            key='session_token',
            value=session_token,
            httponly=True,
            secure=True,
            samesite='none',
            max_age=7*24*60*60,
            path='/'
        )
        
        user_doc = await tdb.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
        
        return {'user': user_doc, 'message': 'Login successful'}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'OAuth callback error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Authentication failed: {str(e)}')

@router.post("/google-session")
async def exchange_google_session(request: Request, response: Response):
    """Exchange Emergent session_id for user data and create session"""
    tdb = get_tdb()
    body = await request.json()
    session_id = body.get('session_id')
    
    if not session_id:
        raise HTTPException(status_code=400, detail='session_id required')
    
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data',
            headers={'X-Session-ID': session_id}
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail='Invalid session_id')
        
        user_data = auth_response.json()
    
    user_email = user_data['email']
    user_name = user_data['name']
    user_picture = user_data.get('picture', '')
    session_token = user_data['session_token']
    
    existing_user = await tdb.users.find_one({'email': user_email}, {'_id': 0})
    
    if not existing_user:
        raise HTTPException(
            status_code=403, 
            detail='You do not have access. Please contact your manager to set up your account.'
        )
    
    user_id = existing_user['id']
    
    await tdb.users.update_one(
        {'email': user_email},
        {'$set': {
            'name': user_name,
            'avatar': user_picture,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        'user_id': user_id,
        'tenant_id': get_current_tenant_id(),
        'session_token': session_token,
        'expires_at': expires_at.isoformat(),
        'created_at': datetime.now(timezone.utc).isoformat()
    })
    
    response.set_cookie(
        key='session_token',
        value=session_token,
        httponly=True,
        secure=True,
        samesite='none',
        max_age=7*24*60*60,
        path='/'
    )
    
    user_doc = await tdb.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    
    return {
        'user': user_doc,
        'session_token': session_token
    }



@router.post("/google-workspace-login")
async def google_workspace_login(request: Request, response: Response):
    """
    Handle Google Workspace SSO login for a specific tenant.
    Validates that the user's email domain matches the tenant's allowed domain.
    Creates user if not exists (auto-provisioning for Workspace users).
    """
    tdb = get_tdb()
    body = await request.json()
    code = body.get('code')
    redirect_uri = body.get('redirect_uri')
    tenant_id = get_current_tenant_id()
    
    if not code:
        raise HTTPException(status_code=400, detail='Authorization code required')
    
    # Get tenant's Google Workspace config
    google_config = await get_tenant_google_config(tenant_id)
    
    if not google_config or not google_config.get('enabled'):
        raise HTTPException(status_code=403, detail='Google Workspace SSO is not enabled for this workspace')
    
    allowed_domain = google_config.get('allowed_domain')
    if not allowed_domain:
        raise HTTPException(status_code=403, detail='Google Workspace domain not configured')
    
    try:
        # Use tenant's client credentials if provided, otherwise use platform credentials
        client_id = google_config.get('client_id') or os.environ.get('GOOGLE_OAUTH_CLIENT_ID')
        client_secret = google_config.get('client_secret') or os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET')
        
        if not client_id or not client_secret:
            raise HTTPException(status_code=500, detail='Google OAuth not configured')
        
        if not redirect_uri:
            redirect_uri = os.environ.get('GOOGLE_OAUTH_REDIRECT_URI', '')
        
        async with httpx.AsyncClient() as client:
            # Exchange code for tokens
            token_response = await client.post(
                'https://oauth2.googleapis.com/token',
                data={
                    'code': code,
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'redirect_uri': redirect_uri,
                    'grant_type': 'authorization_code'
                }
            )
            
            tokens = token_response.json()
            
            if 'error' in tokens:
                logger.error(f"Google token error: {tokens}")
                raise HTTPException(status_code=400, detail=tokens.get('error_description', tokens['error']))
            
            # Get user info from Google
            user_info_response = await client.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f"Bearer {tokens['access_token']}"}
            )
            
            user_info = user_info_response.json()
        
        user_email = user_info['email'].strip().lower()
        user_domain = user_email.split('@')[1] if '@' in user_email else ''
        
        # Validate domain matches tenant's allowed domain
        if user_domain.lower() != allowed_domain.lower():
            raise HTTPException(
                status_code=403,
                detail=f'Access denied. Only @{allowed_domain} email addresses can access this workspace.'
            )
        
        # Check if user exists in this tenant
        existing_user = await tdb.users.find_one(
            {'email': {'$regex': f'^{user_email}$', '$options': 'i'}},
            {'_id': 0}
        )
        
        if existing_user:
            # Update existing user with Google info
            user_id = existing_user['id']
            await tdb.users.update_one(
                {'email': user_email},
                {'$set': {
                    'name': user_info.get('name', existing_user.get('name')),
                    'avatar': user_info.get('picture', ''),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }}
            )
        else:
            # Auto-provision new user from Google Workspace
            user_id = str(uuid.uuid4())
            new_user = {
                'id': user_id,
                'tenant_id': tenant_id,
                'email': user_email,
                'name': user_info.get('name', user_email.split('@')[0]),
                'avatar': user_info.get('picture', ''),
                'role': 'User',  # Default role for auto-provisioned users
                'is_active': True,
                'phone': '',
                'territory_id': None,
                'reports_to': None,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'provisioned_via': 'google_workspace'
            }
            await tdb.users.insert_one(new_user)
            logger.info(f"Auto-provisioned user {user_email} for tenant {tenant_id}")
        
        # Create session
        session_token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        await db.user_sessions.insert_one({
            'user_id': user_id,
            'tenant_id': tenant_id,
            'session_token': session_token,
            'expires_at': expires_at.isoformat(),
            'created_at': datetime.now(timezone.utc).isoformat(),
            'auth_method': 'google_workspace'
        })
        
        response.set_cookie(
            key='session_token',
            value=session_token,
            httponly=True,
            secure=True,
            samesite='none',
            max_age=7*24*60*60,
            path='/'
        )
        
        user_doc = await tdb.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
        
        return {
            'user': user_doc,
            'session_token': session_token,
            'message': 'Google Workspace login successful'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'Google Workspace login error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Authentication failed: {str(e)}')
