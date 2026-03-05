"""
Users routes - User management, team hierarchy
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field, EmailStr
import uuid

from database import db
from deps import get_current_user, hash_password

router = APIRouter()

# ============= MODELS =============

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    role: str
    designation: Optional[str] = None
    department: Optional[str] = 'Sales'
    phone: Optional[str] = None
    avatar: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    territory: Optional[str] = None
    reports_to: Optional[str] = None
    dotted_line_to: Optional[str] = None
    is_active: bool = True
    ctc_monthly: Optional[float] = None
    joining_date: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "ignore"


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = 'sales_rep'
    designation: Optional[str] = None
    department: Optional[str] = 'Sales'
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    territory: Optional[str] = None
    reports_to: Optional[str] = None
    dotted_line_to: Optional[str] = None
    ctc_monthly: Optional[float] = None
    joining_date: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    territory: Optional[str] = None
    reports_to: Optional[str] = None
    dotted_line_to: Optional[str] = None
    is_active: Optional[bool] = None
    ctc_monthly: Optional[float] = None
    joining_date: Optional[str] = None


class HRDataUpdate(BaseModel):
    ctc_monthly: Optional[float] = None
    joining_date: Optional[str] = None


# ============= USER ROUTES =============

@router.get("")
async def get_users(
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    department: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all users with optional filters"""
    query = {}
    
    if role:
        query['role'] = role
    
    if is_active is not None:
        query['is_active'] = is_active
    
    if department:
        query['department'] = department
    
    users = await db.users.find(query, {'_id': 0, 'password': 0}).to_list(1000)
    
    # Add default department if missing
    for user in users:
        if not user.get('department'):
            user['department'] = 'Sales'
    
    return users


@router.post("/create", response_model=User)
async def create_user(user: UserCreate, current_user: dict = Depends(get_current_user)):
    """Create a new user (admin only)"""
    # Check permissions
    allowed_roles = ['ceo', 'director', 'admin', 'CEO', 'Director', 'Admin']
    if current_user.get('role') not in allowed_roles:
        raise HTTPException(status_code=403, detail='Not authorized to create users')
    
    # Check if email exists
    existing = await db.users.find_one({'email': user.email}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    hashed_pw = hash_password(user.password)
    
    user_data = user.model_dump()
    user_data.pop('password')
    user_data['id'] = str(uuid.uuid4())
    user_data['password'] = hashed_pw
    user_data['is_active'] = True
    user_data['created_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.users.insert_one(user_data)
    
    user_data.pop('password')
    user_data['created_at'] = datetime.fromisoformat(user_data['created_at'])
    
    return User(**user_data)


@router.get("/org-chart")
async def get_org_chart(current_user: dict = Depends(get_current_user)):
    """Get organization hierarchy"""
    users = await db.users.find({'is_active': True}, {'_id': 0, 'password': 0}).to_list(1000)
    
    # Build hierarchy
    user_map = {u['id']: u for u in users}
    
    for user in users:
        user['direct_reports'] = []
        user['dotted_line_reports'] = []
    
    for user in users:
        if user.get('reports_to') and user['reports_to'] in user_map:
            user_map[user['reports_to']]['direct_reports'].append(user['id'])
        if user.get('dotted_line_to') and user['dotted_line_to'] in user_map:
            user_map[user['dotted_line_to']]['dotted_line_reports'].append(user['id'])
    
    # Find top-level users (no reports_to)
    top_level = [u for u in users if not u.get('reports_to')]
    
    return {'users': users, 'top_level': [u['id'] for u in top_level]}


@router.get("/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single user"""
    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    return user


@router.put("/{user_id}")
async def update_user(user_id: str, update: UserUpdate, current_user: dict = Depends(get_current_user)):
    """Update a user"""
    existing = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='User not found')
    
    # Check permissions for updating other users
    if user_id != current_user['id']:
        allowed_roles = ['ceo', 'director', 'admin', 'CEO', 'Director', 'Admin']
        if current_user.get('role') not in allowed_roles:
            raise HTTPException(status_code=403, detail='Not authorized to update other users')
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.users.update_one({'id': user_id}, {'$set': update_data})
    
    return await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})


@router.put("/{user_id}/hr-data")
async def update_user_hr_data(user_id: str, update: HRDataUpdate, current_user: dict = Depends(get_current_user)):
    """Update HR data for a user (CEO/Director only)"""
    allowed_roles = ['ceo', 'director', 'CEO', 'Director']
    if current_user.get('role') not in allowed_roles:
        raise HTTPException(status_code=403, detail='Not authorized to update HR data')
    
    existing = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='User not found')
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.users.update_one({'id': user_id}, {'$set': update_data})
    
    return await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})


@router.delete("/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Delete (deactivate) a user"""
    allowed_roles = ['ceo', 'director', 'admin', 'CEO', 'Director', 'Admin']
    if current_user.get('role') not in allowed_roles:
        raise HTTPException(status_code=403, detail='Not authorized to delete users')
    
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail='Cannot delete yourself')
    
    result = await db.users.update_one(
        {'id': user_id},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    return {'message': 'User deactivated successfully'}


@router.get("/{user_id}/reporting-manager")
async def get_reporting_manager(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get user's reporting manager"""
    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'reports_to': 1})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    
    if not user.get('reports_to'):
        return {'manager': None}
    
    manager = await db.users.find_one({'id': user['reports_to']}, {'_id': 0, 'password': 0})
    return {'manager': manager}
