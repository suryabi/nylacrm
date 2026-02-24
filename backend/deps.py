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

security = HTTPBearer()

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
        # Look up session in database
        session = await db.sessions.find_one({'session_token': session_token})
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
                        return user
    
    # Fall back to Authorization header (JWT or session token)
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        
        # First try as session token (UUID format)
        if len(token) == 36 and '-' in token:
            session = await db.sessions.find_one({'session_token': token})
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
                return user
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail='Token expired')
        except jwt.InvalidTokenError:
            pass
    
    raise HTTPException(status_code=401, detail='Invalid session')

async def get_current_user(request: Request):
    """Get user from cookie or JWT token"""
    return await get_current_user_from_cookie_or_header(request)

async def create_session(user_id: str, response: Response = None):
    """Create a new session for a user"""
    import uuid
    session_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    
    # Store session in database
    await db.sessions.insert_one({
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
            samesite='none',
            max_age=JWT_EXPIRATION_HOURS * 3600
        )
    
    return session_token, expires_at
