"""
Authentication and authorization dependencies
"""
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request, Response
from fastapi.security import HTTPBearer
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS
from database import db
from core.tenant import set_current_tenant

security = HTTPBearer()


def _bind_tenant(user: dict, request: Request) -> dict:
    """SEC-001: derive the tenant from the authenticated user, never from the
    client-supplied X-Tenant-ID header. A mismatching header is rejected
    (403) unless the caller is a platform admin."""
    user_tid = (user.get('tenant_id') or '').strip()
    if not user_tid:
        return user
    header_tid = (request.headers.get('X-Tenant-ID') or '').strip()
    if header_tid and header_tid != user_tid:
        from routes.platform_admin import is_platform_admin
        if is_platform_admin(user):
            set_current_tenant(header_tid)
            request.state.tenant_id = header_tid
            return user
        raise HTTPException(status_code=403, detail='Tenant mismatch')
    set_current_tenant(user_tid)
    request.state.tenant_id = user_tid
    return user


# ── Login brute-force protection (Mongo-backed lockout) ──────────────────
LOCKOUT_MAX_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 15


def _lockout_ident(email: str, ip: str) -> str:
    return f"{(ip or 'unknown').strip()}:{(email or '').lower().strip()}"


async def check_login_lockout(email: str, ip: str):
    """Raise 429 if this ip+email pair is currently locked out."""
    doc = await db.login_attempts.find_one({'identifier': _lockout_ident(email, ip)})
    locked_until = doc.get('locked_until') if doc else None
    if locked_until:
        locked_dt = datetime.fromisoformat(locked_until)
        now = datetime.now(timezone.utc)
        if locked_dt > now:
            mins = int((locked_dt - now).total_seconds() // 60) + 1
            raise HTTPException(
                status_code=429,
                detail=f'Too many failed login attempts. Try again in {mins} minute(s).'
            )


async def record_login_failure(email: str, ip: str):
    """Count a failed login; lock the ip+email pair after LOCKOUT_MAX_ATTEMPTS
    failures within the rolling window."""
    ident = _lockout_ident(email, ip)
    now = datetime.now(timezone.utc)
    doc = await db.login_attempts.find_one({'identifier': ident})
    count = 1
    if doc and doc.get('last_attempt_at'):
        last = datetime.fromisoformat(doc['last_attempt_at'])
        if now - last < timedelta(minutes=LOCKOUT_WINDOW_MINUTES):
            count = doc.get('count', 0) + 1
    update = {'count': count, 'last_attempt_at': now.isoformat(), 'locked_until': None}
    if count >= LOCKOUT_MAX_ATTEMPTS:
        update['locked_until'] = (now + timedelta(minutes=LOCKOUT_WINDOW_MINUTES)).isoformat()
        update['count'] = 0
    await db.login_attempts.update_one({'identifier': ident}, {'$set': update}, upsert=True)


async def clear_login_failures(email: str, ip: str):
    await db.login_attempts.delete_one({'identifier': _lockout_ident(email, ip)})


def get_client_ip(request: Request) -> str:
    ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'unknown')
    if ip and ',' in ip:
        ip = ip.split(',')[0].strip()
    return ip or 'unknown'

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(user_id: str, email: str, role: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user_from_cookie_or_header(request: Request):
    """Extract and validate user from session cookie or Authorization header"""
    
    # First try session cookie
    session_token = request.cookies.get('session_token')
    
    if session_token:
        # Look up session in database (use user_sessions collection)
        session = await db.user_sessions.find_one({'session_token': session_token})
        if session:
            # Check if session is expired
            expires_at = session.get('expires_at')
            if expires_at:
                if isinstance(expires_at, str):
                    expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                if expires_at > datetime.now(timezone.utc):
                    # Valid session - get user
                    user = await db.users.find_one({'id': session['user_id']}, {'_id': 0, 'password': 0})
                    if user:
                        return _bind_tenant(user, request)
    
    # Fall back to Authorization header (JWT or session token)
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        
        # First try as session token (UUID format)
        if len(token) == 36 and '-' in token:
            session = await db.user_sessions.find_one({'session_token': token})
            if session:
                expires_at = session.get('expires_at')
                if expires_at:
                    if isinstance(expires_at, str):
                        expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                    if expires_at > datetime.now(timezone.utc):
                        user = await db.users.find_one({'id': session['user_id']}, {'_id': 0, 'password': 0})
                        if user:
                            return user
        
        # Try as JWT token
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user = await db.users.find_one({'id': payload['user_id']}, {'_id': 0, 'password': 0})
            if user:
                return _bind_tenant(user, request)
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail='Token expired')
        except jwt.InvalidTokenError:
            pass
    
    raise HTTPException(status_code=401, detail='Invalid session')

async def get_current_user(request: Request):
    """Get user from cookie or JWT token"""
    return await get_current_user_from_cookie_or_header(request)


async def get_user_or_factory_staff(request: Request):
    """App user session OR a Factory Staff scan session (`X-Staff-Token`, issued by
    /maintenance/staff-auth/login after Face/PIN). Staff actors carry `is_factory_staff=True`."""
    try:
        return await get_current_user_from_cookie_or_header(request)
    except HTTPException:
        pass
    token = (request.headers.get('X-Staff-Token') or '').strip()
    if token:
        sess = await db.factory_staff_sessions.find_one({'token': token}, {'_id': 0})
        if sess and datetime.fromisoformat(sess['expires_at']) > datetime.now(timezone.utc):
            member = await db.qc_team.find_one({'tenant_id': sess['tenant_id'], 'id': sess['member_id']},
                                               {'_id': 0, 'id': 1, 'name': 1, 'role': 1})
            if member:
                set_current_tenant(sess['tenant_id'])
                request.state.tenant_id = sess['tenant_id']
                return {**member, 'tenant_id': sess['tenant_id'], 'is_factory_staff': True}
    raise HTTPException(status_code=401, detail='Invalid session')


async def get_user_or_api_key(request: Request):
    """Authenticate via API key (X-API-Key or 'Authorization: Bearer ak_...') OR fall back to JWT/session.

    When authenticated via API key, returns a synthetic user dict with `is_api_key=True`.
    When the request method+path is not in the key's allowed_endpoints, raises 403.
    """
    # Lazy import to avoid circular import (routes/api_keys imports deps.get_current_user)
    from routes.api_keys import authenticate_api_key

    api_user = await authenticate_api_key(request)
    if api_user:
        return api_user
    return await get_current_user_from_cookie_or_header(request)

async def create_session(user_id: str, response: Response = None):
    """Create a new session for a user"""
    import uuid
    session_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    
    # Store session in database (use user_sessions collection)
    await db.user_sessions.insert_one({
        'session_token': session_token,
        'user_id': user_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'expires_at': expires_at.isoformat()
    })
    
    # Set cookie if response provided
    if response:
        response.set_cookie(
            key='session_token',
            value=session_token,
            httponly=True,
            secure=True,
            samesite='lax',
            max_age=JWT_EXPIRATION_HOURS * 3600
        )
    
    return session_token, expires_at
