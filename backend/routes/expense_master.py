"""
Expense Category Master Module
Manages expense categories, types, role-based limits, and policy guidelines
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone
import uuid

from deps import get_current_user, db

router = APIRouter(prefix="/expense-master", tags=["Expense Master"])

# ============== Models ==============

class RoleLimit(BaseModel):
    """Role-specific expense limit configuration"""
    role: str
    max_limit: float
    is_allowed: bool = True
    requires_approval: bool = True
    approval_threshold: Optional[float] = None  # Amount above which approval is needed

class ExpenseTypeCreate(BaseModel):
    """Create/Update expense type"""
    category_id: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    requires_receipt: bool = True
    requires_justification: bool = False
    default_limit: float = 0
    role_limits: List[RoleLimit] = []
    policy_guidelines: Optional[str] = None

class ExpenseCategoryCreate(BaseModel):
    """Create/Update expense category"""
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None  # Icon name for UI
    color: Optional[str] = None  # Color code for UI
    is_active: bool = True
    display_order: int = 0
    policy_guidelines: Optional[str] = None

class ExpenseCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None
    policy_guidelines: Optional[str] = None

class ExpenseTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    requires_receipt: Optional[bool] = None
    requires_justification: Optional[bool] = None
    default_limit: Optional[float] = None
    role_limits: Optional[List[RoleLimit]] = None
    policy_guidelines: Optional[str] = None

# ============== Available Roles ==============

AVAILABLE_ROLES = [
    {'id': 'CEO', 'name': 'CEO', 'level': 1},
    {'id': 'Director', 'name': 'Director', 'level': 2},
    {'id': 'Vice President', 'name': 'Vice President', 'level': 3},
    {'id': 'National Sales Head', 'name': 'National Sales Head', 'level': 4},
    {'id': 'Regional Sales Manager', 'name': 'Regional Sales Manager', 'level': 5},
    {'id': 'Partner - Sales', 'name': 'Partner - Sales', 'level': 6},
    {'id': 'Business Development Executive', 'name': 'Business Development Executive', 'level': 7},
    {'id': 'Sales Representative', 'name': 'Sales Representative', 'level': 8},
    {'id': 'System Admin', 'name': 'System Admin', 'level': 1},
]

# ============== Default Categories ==============

DEFAULT_CATEGORIES = [
    {
        'name': 'Travel',
        'description': 'Travel-related expenses including flights, trains, and local transport',
        'icon': 'plane',
        'color': '#3B82F6',
        'display_order': 1,
        'policy_guidelines': 'All travel must be pre-approved. Book economy class for domestic travel. Business class allowed for international flights over 6 hours.'
    },
    {
        'name': 'Accommodation',
        'description': 'Hotel stays and lodging expenses',
        'icon': 'hotel',
        'color': '#8B5CF6',
        'display_order': 2,
        'policy_guidelines': 'Book hotels from approved vendor list. Maximum star rating based on role level.'
    },
    {
        'name': 'Meals & Entertainment',
        'description': 'Food, beverages, and client entertainment',
        'icon': 'utensils',
        'color': '#F59E0B',
        'display_order': 3,
        'policy_guidelines': 'Client entertainment requires pre-approval for amounts exceeding daily limits.'
    },
    {
        'name': 'Communication',
        'description': 'Phone, internet, and communication expenses',
        'icon': 'phone',
        'color': '#10B981',
        'display_order': 4,
        'policy_guidelines': 'Monthly mobile reimbursement as per role eligibility.'
    },
    {
        'name': 'Office Supplies',
        'description': 'Stationery, equipment, and office supplies',
        'icon': 'briefcase',
        'color': '#6366F1',
        'display_order': 5,
        'policy_guidelines': 'Purchase through approved vendors. Items over threshold require manager approval.'
    },
    {
        'name': 'Training & Development',
        'description': 'Courses, certifications, and professional development',
        'icon': 'graduation-cap',
        'color': '#EC4899',
        'display_order': 6,
        'policy_guidelines': 'Training must be pre-approved by manager and HR. Annual training budget applies.'
    },
    {
        'name': 'Client Gifting',
        'description': 'Gifts and promotional items for clients',
        'icon': 'gift',
        'color': '#EF4444',
        'display_order': 7,
        'policy_guidelines': 'All client gifts must comply with company policy and anti-bribery guidelines.'
    },
    {
        'name': 'Miscellaneous',
        'description': 'Other business expenses not covered elsewhere',
        'icon': 'more-horizontal',
        'color': '#64748B',
        'display_order': 8,
        'policy_guidelines': 'Must provide detailed justification. Subject to manager discretion.'
    }
]

DEFAULT_EXPENSE_TYPES = {
    'Travel': [
        {'name': 'Domestic Flight', 'default_limit': 15000, 'requires_receipt': True},
        {'name': 'International Flight', 'default_limit': 100000, 'requires_receipt': True},
        {'name': 'Train Travel', 'default_limit': 5000, 'requires_receipt': True},
        {'name': 'Bus Travel', 'default_limit': 2000, 'requires_receipt': True},
        {'name': 'Taxi/Cab', 'default_limit': 3000, 'requires_receipt': True},
        {'name': 'Car Rental', 'default_limit': 5000, 'requires_receipt': True},
        {'name': 'Fuel/Mileage', 'default_limit': 4000, 'requires_receipt': True},
        {'name': 'Parking & Tolls', 'default_limit': 1000, 'requires_receipt': True},
    ],
    'Accommodation': [
        {'name': 'Hotel - Metro Cities', 'default_limit': 8000, 'requires_receipt': True},
        {'name': 'Hotel - Tier 2 Cities', 'default_limit': 5000, 'requires_receipt': True},
        {'name': 'Hotel - Other Cities', 'default_limit': 3000, 'requires_receipt': True},
        {'name': 'Service Apartment', 'default_limit': 6000, 'requires_receipt': True},
    ],
    'Meals & Entertainment': [
        {'name': 'Daily Meals', 'default_limit': 1500, 'requires_receipt': False},
        {'name': 'Client Entertainment', 'default_limit': 5000, 'requires_receipt': True, 'requires_justification': True},
        {'name': 'Team Meals', 'default_limit': 3000, 'requires_receipt': True},
    ],
    'Communication': [
        {'name': 'Mobile Recharge', 'default_limit': 1000, 'requires_receipt': True},
        {'name': 'Internet/Data', 'default_limit': 500, 'requires_receipt': True},
        {'name': 'International Roaming', 'default_limit': 2000, 'requires_receipt': True},
    ],
    'Office Supplies': [
        {'name': 'Stationery', 'default_limit': 500, 'requires_receipt': True},
        {'name': 'Printing/Copying', 'default_limit': 300, 'requires_receipt': True},
        {'name': 'Computer Accessories', 'default_limit': 2000, 'requires_receipt': True},
    ],
    'Training & Development': [
        {'name': 'Online Courses', 'default_limit': 10000, 'requires_receipt': True},
        {'name': 'Certifications', 'default_limit': 25000, 'requires_receipt': True},
        {'name': 'Conference/Seminar', 'default_limit': 15000, 'requires_receipt': True},
        {'name': 'Books/Subscriptions', 'default_limit': 2000, 'requires_receipt': True},
    ],
    'Client Gifting': [
        {'name': 'Festival Gifts', 'default_limit': 2000, 'requires_receipt': True, 'requires_justification': True},
        {'name': 'Corporate Gifts', 'default_limit': 5000, 'requires_receipt': True, 'requires_justification': True},
        {'name': 'Promotional Items', 'default_limit': 1000, 'requires_receipt': True},
    ],
    'Miscellaneous': [
        {'name': 'Visa/Passport', 'default_limit': 5000, 'requires_receipt': True},
        {'name': 'Medical (Travel)', 'default_limit': 2000, 'requires_receipt': True},
        {'name': 'Other Business Expense', 'default_limit': 1000, 'requires_receipt': True, 'requires_justification': True},
    ]
}

# Role-based limit multipliers (base limit * multiplier)
ROLE_LIMIT_MULTIPLIERS = {
    'CEO': 5.0,
    'Director': 3.0,
    'Vice President': 2.5,
    'National Sales Head': 2.0,
    'Regional Sales Manager': 1.5,
    'Partner - Sales': 1.2,
    'Business Development Executive': 1.0,
    'Sales Representative': 1.0,
    'System Admin': 2.0,
}


# ============== Endpoints ==============

@router.get("/roles")
async def get_available_roles(current_user: dict = Depends(get_current_user)):
    """Get list of available roles for expense configuration"""
    return AVAILABLE_ROLES


@router.get("/categories")
async def get_expense_categories(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get all expense categories with their expense types"""
    query = {} if include_inactive else {'is_active': True}
    
    categories = await db.expense_categories.find(query, {'_id': 0}).sort('display_order', 1).to_list(100)
    
    # If no categories exist, initialize with defaults
    if not categories:
        await initialize_default_data()
        categories = await db.expense_categories.find(query, {'_id': 0}).sort('display_order', 1).to_list(100)
    
    # Fetch expense types for each category
    for category in categories:
        types_query = {'category_id': category['id']}
        if not include_inactive:
            types_query['is_active'] = True
        expense_types = await db.expense_types.find(types_query, {'_id': 0}).to_list(100)
        category['expense_types'] = expense_types
    
    return categories


@router.post("/categories")
async def create_expense_category(
    category: ExpenseCategoryCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new expense category"""
    # Check admin permission
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage expense categories")
    
    # Check for duplicate name
    existing = await db.expense_categories.find_one({'name': category.name}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    category_data = {
        'id': str(uuid.uuid4()),
        **category.model_dump(),
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.expense_categories.insert_one(category_data)
    # Return without MongoDB's _id field
    return {k: v for k, v in category_data.items() if k != '_id'}


@router.put("/categories/{category_id}")
async def update_expense_category(
    category_id: str,
    category_update: ExpenseCategoryUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an expense category"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage expense categories")
    
    existing = await db.expense_categories.find_one({'id': category_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_data = {k: v for k, v in category_update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.expense_categories.update_one({'id': category_id}, {'$set': update_data})
    
    updated = await db.expense_categories.find_one({'id': category_id}, {'_id': 0})
    return updated


@router.delete("/categories/{category_id}")
async def delete_expense_category(
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an expense category (soft delete)"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage expense categories")
    
    # Soft delete - just mark as inactive
    result = await db.expense_categories.update_one(
        {'id': category_id},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Also deactivate all expense types in this category
    await db.expense_types.update_many(
        {'category_id': category_id},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Category deleted successfully"}


@router.get("/types")
async def get_expense_types(
    category_id: Optional[str] = None,
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get expense types, optionally filtered by category"""
    query = {}
    if category_id:
        query['category_id'] = category_id
    if not include_inactive:
        query['is_active'] = True
    
    expense_types = await db.expense_types.find(query, {'_id': 0}).to_list(500)
    return expense_types


@router.post("/types")
async def create_expense_type(
    expense_type: ExpenseTypeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new expense type"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage expense types")
    
    # Verify category exists
    category = await db.expense_categories.find_one({'id': expense_type.category_id}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=400, detail="Category not found")
    
    # Check for duplicate name within category
    existing = await db.expense_types.find_one({
        'category_id': expense_type.category_id,
        'name': expense_type.name
    }, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail="Expense type with this name already exists in category")
    
    # Convert role_limits to dict format for storage
    role_limits_data = [rl.model_dump() for rl in expense_type.role_limits]
    
    type_data = {
        'id': str(uuid.uuid4()),
        **expense_type.model_dump(),
        'role_limits': role_limits_data,
        'category_name': category['name'],
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.expense_types.insert_one(type_data)
    # Return without MongoDB's _id field
    return {k: v for k, v in type_data.items() if k != '_id'}


@router.put("/types/{type_id}")
async def update_expense_type(
    type_id: str,
    type_update: ExpenseTypeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an expense type"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage expense types")
    
    existing = await db.expense_types.find_one({'id': type_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Expense type not found")
    
    update_data = {}
    for k, v in type_update.model_dump().items():
        if v is not None:
            if k == 'role_limits':
                update_data[k] = [rl.model_dump() if hasattr(rl, 'model_dump') else rl for rl in v]
            else:
                update_data[k] = v
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.expense_types.update_one({'id': type_id}, {'$set': update_data})
    
    updated = await db.expense_types.find_one({'id': type_id}, {'_id': 0})
    return updated


@router.delete("/types/{type_id}")
async def delete_expense_type(
    type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an expense type (soft delete)"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage expense types")
    
    result = await db.expense_types.update_one(
        {'id': type_id},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Expense type not found")
    
    return {"message": "Expense type deleted successfully"}


@router.get("/policy")
async def get_expense_policy(
    role: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get complete expense policy, optionally filtered for a specific role"""
    categories = await db.expense_categories.find({'is_active': True}, {'_id': 0}).sort('display_order', 1).to_list(100)
    
    policy = []
    for category in categories:
        expense_types = await db.expense_types.find({
            'category_id': category['id'],
            'is_active': True
        }, {'_id': 0}).to_list(100)
        
        # Filter by role if specified
        if role:
            for et in expense_types:
                role_config = next((rl for rl in et.get('role_limits', []) if rl['role'] == role), None)
                et['role_config'] = role_config
                et['is_allowed_for_role'] = role_config['is_allowed'] if role_config else True
                et['role_limit'] = role_config['max_limit'] if role_config else et.get('default_limit', 0)
        
        category['expense_types'] = expense_types
        policy.append(category)
    
    return policy


@router.post("/initialize")
async def initialize_expense_master(current_user: dict = Depends(get_current_user)):
    """Initialize expense master with default data (admin only)"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can initialize expense master")
    
    await initialize_default_data()
    return {"message": "Expense master initialized with default data"}


async def initialize_default_data():
    """Initialize default categories and expense types"""
    # Check if already initialized
    existing = await db.expense_categories.find_one({}, {'_id': 0})
    if existing:
        return
    
    # Create default categories
    for cat_data in DEFAULT_CATEGORIES:
        category_id = str(uuid.uuid4())
        category = {
            'id': category_id,
            **cat_data,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        await db.expense_categories.insert_one(category)
        
        # Create expense types for this category
        if cat_data['name'] in DEFAULT_EXPENSE_TYPES:
            for type_data in DEFAULT_EXPENSE_TYPES[cat_data['name']]:
                # Generate role-based limits
                base_limit = type_data.get('default_limit', 0)
                role_limits = []
                for role in AVAILABLE_ROLES:
                    multiplier = ROLE_LIMIT_MULTIPLIERS.get(role['id'], 1.0)
                    role_limits.append({
                        'role': role['id'],
                        'max_limit': base_limit * multiplier,
                        'is_allowed': True,
                        'requires_approval': True,
                        'approval_threshold': base_limit * multiplier * 0.8  # 80% of limit
                    })
                
                expense_type = {
                    'id': str(uuid.uuid4()),
                    'category_id': category_id,
                    'category_name': cat_data['name'],
                    'name': type_data['name'],
                    'description': None,
                    'is_active': True,
                    'requires_receipt': type_data.get('requires_receipt', True),
                    'requires_justification': type_data.get('requires_justification', False),
                    'default_limit': base_limit,
                    'role_limits': role_limits,
                    'policy_guidelines': None,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
                await db.expense_types.insert_one(expense_type)
