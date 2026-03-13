"""
Lead Scoring Model Routes - Tenant-specific account scoring configuration
Each tenant can define their own scoring categories and scoring tiers
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()

def get_tdb():
    """Get tenant-aware database wrapper"""
    return get_tenant_db()


# ============= MODELS =============

class ScoringTier(BaseModel):
    """A single scoring tier within a category"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str  # e.g., ">5000 bottles", "5-Star Global Hotel"
    description: Optional[str] = None  # e.g., "Bottles / Month"
    score: int  # Points for this tier
    min_value: Optional[float] = None  # For numeric ranges
    max_value: Optional[float] = None  # For numeric ranges
    order: int = 0  # Display order


class ScoringCategory(BaseModel):
    """A scoring category with weight and tiers"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g., "Volume Potential", "Brand Prestige"
    description: Optional[str] = None  # e.g., "Revenue scale"
    weight: int  # Weight out of 100, e.g., 25
    tiers: List[ScoringTier] = []
    order: int = 0  # Display order
    is_numeric: bool = False  # If true, uses min/max values for auto-scoring


class ScoringModel(BaseModel):
    """Complete scoring model for a tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Default Scoring Model"
    description: Optional[str] = None
    categories: List[ScoringCategory] = []
    total_weight: int = 100  # Should always sum to 100
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CategoryCreate(BaseModel):
    """Create a new category"""
    name: str
    description: Optional[str] = None
    weight: int
    is_numeric: bool = False


class CategoryUpdate(BaseModel):
    """Update a category"""
    name: Optional[str] = None
    description: Optional[str] = None
    weight: Optional[int] = None
    is_numeric: Optional[bool] = None
    order: Optional[int] = None


class TierCreate(BaseModel):
    """Create a new tier"""
    label: str
    description: Optional[str] = None
    score: int
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class TierUpdate(BaseModel):
    """Update a tier"""
    label: Optional[str] = None
    description: Optional[str] = None
    score: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    order: Optional[int] = None


class AccountScore(BaseModel):
    """Score breakdown for an account"""
    account_id: str
    total_score: int = 0
    category_scores: dict = {}  # {category_id: {score: int, tier_id: str, tier_label: str}}
    quadrant: str = "Puzzles"  # Stars, Showcase, Plough Horses, Puzzles
    scored_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AccountScoreInput(BaseModel):
    """Input for scoring an account"""
    category_scores: dict  # {category_id: tier_id}


# ============= HELPER FUNCTIONS =============

def calculate_quadrant(total_score: int, volume_score: int, volume_weight: int, commercial_score: int, commercial_weight: int) -> str:
    """
    Calculate portfolio quadrant based on scores.
    X-axis: Volume Potential (normalized)
    Y-axis: Commercial Value (Margin + Brand Visibility, normalized)
    """
    # Normalize scores to percentage of their respective weights
    volume_pct = (volume_score / volume_weight * 100) if volume_weight > 0 else 0
    commercial_pct = (commercial_score / commercial_weight * 100) if commercial_weight > 0 else 0
    
    # Use 50% as the threshold for high/low
    is_high_volume = volume_pct >= 50
    is_high_commercial = commercial_pct >= 50
    
    if is_high_volume and is_high_commercial:
        return "Stars"
    elif not is_high_volume and is_high_commercial:
        return "Showcase"
    elif is_high_volume and not is_high_commercial:
        return "Plough Horses"
    else:
        return "Puzzles"


async def get_or_create_scoring_model():
    """Get the active scoring model for current tenant, or create default"""
    tdb = get_tdb()
    model = await tdb.scoring_models.find_one({'is_active': True}, {'_id': 0})
    
    if not model:
        # Create default model with example categories
        default_model = {
            'id': str(uuid.uuid4()),
            'name': 'Default Scoring Model',
            'description': 'Account scoring based on volume, margin, prestige, influence, and sustainability',
            'categories': [],
            'total_weight': 100,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        await tdb.scoring_models.insert_one(default_model)
        return default_model
    
    return model


# ============= SCORING MODEL ROUTES =============

@router.get("/model")
async def get_scoring_model(current_user: dict = Depends(get_current_user)):
    """Get the active scoring model for the current tenant"""
    model = await get_or_create_scoring_model()
    return model


@router.put("/model")
async def update_scoring_model(
    name: Optional[str] = None,
    description: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Update scoring model name/description"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await get_or_create_scoring_model()
    
    update_data = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if name:
        update_data['name'] = name
    if description:
        update_data['description'] = description
    
    await tdb.scoring_models.update_one({'id': model['id']}, {'$set': update_data})
    return await tdb.scoring_models.find_one({'id': model['id']}, {'_id': 0})


# ============= CATEGORY ROUTES =============

@router.post("/categories")
async def create_category(category: CategoryCreate, current_user: dict = Depends(get_current_user)):
    """Add a new scoring category"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await get_or_create_scoring_model()
    
    # Calculate current total weight
    current_total = sum(c.get('weight', 0) for c in model.get('categories', []))
    if current_total + category.weight > 100:
        raise HTTPException(
            status_code=400, 
            detail=f"Total weight would exceed 100. Current: {current_total}, Adding: {category.weight}"
        )
    
    new_category = {
        'id': str(uuid.uuid4()),
        'name': category.name,
        'description': category.description,
        'weight': category.weight,
        'tiers': [],
        'order': len(model.get('categories', [])),
        'is_numeric': category.is_numeric
    }
    
    await tdb.scoring_models.update_one(
        {'id': model['id']},
        {
            '$push': {'categories': new_category},
            '$set': {
                'total_weight': current_total + category.weight,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return new_category


@router.put("/categories/{category_id}")
async def update_category(
    category_id: str, 
    category: CategoryUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Update a scoring category"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await get_or_create_scoring_model()
    
    categories = model.get('categories', [])
    cat_index = next((i for i, c in enumerate(categories) if c['id'] == category_id), None)
    
    if cat_index is None:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check weight constraint if updating weight
    if category.weight is not None:
        current_total = sum(c.get('weight', 0) for c in categories)
        old_weight = categories[cat_index].get('weight', 0)
        new_total = current_total - old_weight + category.weight
        
        if new_total > 100:
            raise HTTPException(
                status_code=400,
                detail=f"Total weight would exceed 100. New total would be: {new_total}"
            )
    
    # Update category
    update_dict = {}
    if category.name is not None:
        update_dict[f'categories.{cat_index}.name'] = category.name
    if category.description is not None:
        update_dict[f'categories.{cat_index}.description'] = category.description
    if category.weight is not None:
        update_dict[f'categories.{cat_index}.weight'] = category.weight
    if category.is_numeric is not None:
        update_dict[f'categories.{cat_index}.is_numeric'] = category.is_numeric
    if category.order is not None:
        update_dict[f'categories.{cat_index}.order'] = category.order
    
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Recalculate total weight
    new_total = sum(
        category.weight if i == cat_index and category.weight is not None else c.get('weight', 0)
        for i, c in enumerate(categories)
    )
    update_dict['total_weight'] = new_total
    
    await tdb.scoring_models.update_one({'id': model['id']}, {'$set': update_dict})
    
    return await tdb.scoring_models.find_one({'id': model['id']}, {'_id': 0})


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a scoring category"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await get_or_create_scoring_model()
    
    categories = model.get('categories', [])
    cat_to_remove = next((c for c in categories if c['id'] == category_id), None)
    
    if not cat_to_remove:
        raise HTTPException(status_code=404, detail="Category not found")
    
    new_total = model.get('total_weight', 0) - cat_to_remove.get('weight', 0)
    
    await tdb.scoring_models.update_one(
        {'id': model['id']},
        {
            '$pull': {'categories': {'id': category_id}},
            '$set': {
                'total_weight': new_total,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {'message': 'Category deleted', 'new_total_weight': new_total}


# ============= TIER ROUTES =============

@router.post("/categories/{category_id}/tiers")
async def create_tier(
    category_id: str, 
    tier: TierCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Add a new scoring tier to a category"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await get_or_create_scoring_model()
    
    categories = model.get('categories', [])
    cat_index = next((i for i, c in enumerate(categories) if c['id'] == category_id), None)
    
    if cat_index is None:
        raise HTTPException(status_code=404, detail="Category not found")
    
    category = categories[cat_index]
    
    # Validate score doesn't exceed category weight
    if tier.score > category.get('weight', 0):
        raise HTTPException(
            status_code=400,
            detail=f"Tier score ({tier.score}) cannot exceed category weight ({category.get('weight', 0)})"
        )
    
    new_tier = {
        'id': str(uuid.uuid4()),
        'label': tier.label,
        'description': tier.description,
        'score': tier.score,
        'min_value': tier.min_value,
        'max_value': tier.max_value,
        'order': len(category.get('tiers', []))
    }
    
    await tdb.scoring_models.update_one(
        {'id': model['id']},
        {
            '$push': {f'categories.{cat_index}.tiers': new_tier},
            '$set': {'updated_at': datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return new_tier


@router.put("/categories/{category_id}/tiers/{tier_id}")
async def update_tier(
    category_id: str,
    tier_id: str,
    tier: TierUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a scoring tier"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await get_or_create_scoring_model()
    
    categories = model.get('categories', [])
    cat_index = next((i for i, c in enumerate(categories) if c['id'] == category_id), None)
    
    if cat_index is None:
        raise HTTPException(status_code=404, detail="Category not found")
    
    category = categories[cat_index]
    tiers = category.get('tiers', [])
    tier_index = next((i for i, t in enumerate(tiers) if t['id'] == tier_id), None)
    
    if tier_index is None:
        raise HTTPException(status_code=404, detail="Tier not found")
    
    # Validate score if updating
    if tier.score is not None and tier.score > category.get('weight', 0):
        raise HTTPException(
            status_code=400,
            detail=f"Tier score ({tier.score}) cannot exceed category weight ({category.get('weight', 0)})"
        )
    
    # Build update
    update_dict = {'updated_at': datetime.now(timezone.utc).isoformat()}
    base_path = f'categories.{cat_index}.tiers.{tier_index}'
    
    if tier.label is not None:
        update_dict[f'{base_path}.label'] = tier.label
    if tier.description is not None:
        update_dict[f'{base_path}.description'] = tier.description
    if tier.score is not None:
        update_dict[f'{base_path}.score'] = tier.score
    if tier.min_value is not None:
        update_dict[f'{base_path}.min_value'] = tier.min_value
    if tier.max_value is not None:
        update_dict[f'{base_path}.max_value'] = tier.max_value
    if tier.order is not None:
        update_dict[f'{base_path}.order'] = tier.order
    
    await tdb.scoring_models.update_one({'id': model['id']}, {'$set': update_dict})
    
    return await tdb.scoring_models.find_one({'id': model['id']}, {'_id': 0})


@router.delete("/categories/{category_id}/tiers/{tier_id}")
async def delete_tier(
    category_id: str,
    tier_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a scoring tier"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await get_or_create_scoring_model()
    
    categories = model.get('categories', [])
    cat_index = next((i for i, c in enumerate(categories) if c['id'] == category_id), None)
    
    if cat_index is None:
        raise HTTPException(status_code=404, detail="Category not found")
    
    await tdb.scoring_models.update_one(
        {'id': model['id']},
        {
            '$pull': {f'categories.{cat_index}.tiers': {'id': tier_id}},
            '$set': {'updated_at': datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {'message': 'Tier deleted'}


# ============= ACCOUNT SCORING ROUTES =============

@router.post("/accounts/{account_id}/score")
async def score_account(
    account_id: str,
    score_input: AccountScoreInput,
    current_user: dict = Depends(get_current_user)
):
    """Score an account based on selected tiers"""
    tdb = get_tdb()
    
    # Verify account exists
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Get scoring model
    model = await get_or_create_scoring_model()
    categories = model.get('categories', [])
    
    if not categories:
        raise HTTPException(status_code=400, detail="No scoring categories defined. Please configure the scoring model first.")
    
    # Calculate scores
    total_score = 0
    category_scores = {}
    volume_score = 0
    volume_weight = 0
    commercial_score = 0
    commercial_weight = 0
    
    for category in categories:
        cat_id = category['id']
        cat_name = category.get('name', '').lower()
        cat_weight = category.get('weight', 0)
        
        selected_tier_id = score_input.category_scores.get(cat_id)
        
        if selected_tier_id:
            tier = next((t for t in category.get('tiers', []) if t['id'] == selected_tier_id), None)
            if tier:
                score = tier.get('score', 0)
                total_score += score
                category_scores[cat_id] = {
                    'score': score,
                    'tier_id': tier['id'],
                    'tier_label': tier.get('label', ''),
                    'category_name': category.get('name', ''),
                    'category_weight': cat_weight
                }
                
                # Track volume vs commercial for quadrant calculation
                if 'volume' in cat_name:
                    volume_score += score
                    volume_weight += cat_weight
                else:
                    commercial_score += score
                    commercial_weight += cat_weight
    
    # Calculate quadrant
    quadrant = calculate_quadrant(total_score, volume_score, volume_weight, commercial_score, commercial_weight)
    
    # Store score on account
    score_data = {
        'total_score': total_score,
        'category_scores': category_scores,
        'quadrant': quadrant,
        'scored_at': datetime.now(timezone.utc).isoformat(),
        'scored_by': current_user['id']
    }
    
    await tdb.accounts.update_one(
        {'id': account_id},
        {'$set': {
            'scoring': score_data,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        'account_id': account_id,
        'account_name': account.get('account_name'),
        **score_data
    }


@router.get("/accounts/{account_id}/score")
async def get_account_score(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get the score for a specific account"""
    tdb = get_tdb()
    
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    scoring = account.get('scoring')
    if not scoring:
        return {
            'account_id': account_id,
            'account_name': account.get('account_name'),
            'scored': False,
            'message': 'Account has not been scored yet'
        }
    
    return {
        'account_id': account_id,
        'account_name': account.get('account_name'),
        'scored': True,
        **scoring
    }


@router.get("/accounts/scores")
async def get_all_account_scores(
    quadrant: Optional[str] = None,
    min_score: Optional[int] = None,
    max_score: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get scores for all accounts, optionally filtered"""
    tdb = get_tdb()
    
    query = {'scoring': {'$exists': True}}
    
    if quadrant:
        query['scoring.quadrant'] = quadrant
    if min_score is not None:
        query['scoring.total_score'] = {'$gte': min_score}
    if max_score is not None:
        if 'scoring.total_score' in query:
            query['scoring.total_score']['$lte'] = max_score
        else:
            query['scoring.total_score'] = {'$lte': max_score}
    
    accounts = await tdb.accounts.find(
        query,
        {'_id': 0, 'id': 1, 'account_name': 1, 'account_id': 1, 'city': 1, 'scoring': 1}
    ).sort('scoring.total_score', -1).to_list(1000)
    
    return {
        'accounts': accounts,
        'total': len(accounts)
    }


@router.get("/portfolio-matrix")
async def get_portfolio_matrix(current_user: dict = Depends(get_current_user)):
    """Get portfolio matrix data for visualization"""
    tdb = get_tdb()
    
    # Get all scored accounts
    accounts = await tdb.accounts.find(
        {'scoring': {'$exists': True}},
        {'_id': 0, 'id': 1, 'account_name': 1, 'account_id': 1, 'city': 1, 'scoring': 1}
    ).to_list(1000)
    
    # Group by quadrant
    matrix = {
        'Stars': [],
        'Showcase': [],
        'Plough Horses': [],
        'Puzzles': []
    }
    
    for account in accounts:
        quadrant = account.get('scoring', {}).get('quadrant', 'Puzzles')
        matrix[quadrant].append({
            'id': account['id'],
            'account_name': account.get('account_name'),
            'account_id': account.get('account_id'),
            'city': account.get('city'),
            'total_score': account.get('scoring', {}).get('total_score', 0)
        })
    
    # Sort each quadrant by score
    for quadrant in matrix:
        matrix[quadrant].sort(key=lambda x: x['total_score'], reverse=True)
    
    return {
        'matrix': matrix,
        'summary': {
            'stars': len(matrix['Stars']),
            'showcase': len(matrix['Showcase']),
            'plough_horses': len(matrix['Plough Horses']),
            'puzzles': len(matrix['Puzzles']),
            'total_scored': len(accounts)
        }
    }


# ============= BULK OPERATIONS =============

@router.post("/seed-default-model")
async def seed_default_model(current_user: dict = Depends(get_current_user)):
    """Seed the default scoring model with example categories (for initial setup)"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    
    # Check if model already has categories
    model = await get_or_create_scoring_model()
    if model.get('categories') and len(model['categories']) > 0:
        raise HTTPException(status_code=400, detail="Scoring model already has categories. Delete them first to reseed.")
    
    # Default categories based on the user's example
    default_categories = [
        {
            'id': str(uuid.uuid4()),
            'name': 'Volume Potential',
            'description': 'Revenue scale based on estimated volume',
            'weight': 25,
            'is_numeric': True,
            'order': 0,
            'tiers': [
                {'id': str(uuid.uuid4()), 'label': '>5000', 'description': 'Units per month', 'score': 25, 'min_value': 5000, 'max_value': None, 'order': 0},
                {'id': str(uuid.uuid4()), 'label': '3000-5000', 'description': 'Units per month', 'score': 20, 'min_value': 3000, 'max_value': 5000, 'order': 1},
                {'id': str(uuid.uuid4()), 'label': '1500-3000', 'description': 'Units per month', 'score': 15, 'min_value': 1500, 'max_value': 3000, 'order': 2},
                {'id': str(uuid.uuid4()), 'label': '500-1500', 'description': 'Units per month', 'score': 10, 'min_value': 500, 'max_value': 1500, 'order': 3},
                {'id': str(uuid.uuid4()), 'label': '<500', 'description': 'Units per month', 'score': 5, 'min_value': 0, 'max_value': 500, 'order': 4},
            ]
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Margin Potential',
            'description': 'Profitability assessment',
            'weight': 20,
            'is_numeric': True,
            'order': 1,
            'tiers': [
                {'id': str(uuid.uuid4()), 'label': '>40%', 'description': 'Margin percentage', 'score': 20, 'min_value': 40, 'max_value': None, 'order': 0},
                {'id': str(uuid.uuid4()), 'label': '30-40%', 'description': 'Margin percentage', 'score': 15, 'min_value': 30, 'max_value': 40, 'order': 1},
                {'id': str(uuid.uuid4()), 'label': '20-30%', 'description': 'Margin percentage', 'score': 10, 'min_value': 20, 'max_value': 30, 'order': 2},
                {'id': str(uuid.uuid4()), 'label': '10-20%', 'description': 'Margin percentage', 'score': 5, 'min_value': 10, 'max_value': 20, 'order': 3},
                {'id': str(uuid.uuid4()), 'label': '<10%', 'description': 'Margin percentage', 'score': 0, 'min_value': 0, 'max_value': 10, 'order': 4},
            ]
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Brand Prestige',
            'description': 'Luxury association and brand value',
            'weight': 20,
            'is_numeric': False,
            'order': 2,
            'tiers': [
                {'id': str(uuid.uuid4()), 'label': '5-Star Global Hotel', 'description': 'JW Marriott, Taj, Four Seasons', 'score': 20, 'order': 0},
                {'id': str(uuid.uuid4()), 'label': 'Iconic Luxury Restaurant', 'description': 'High-end fine dining', 'score': 18, 'order': 1},
                {'id': str(uuid.uuid4()), 'label': 'Premium Restaurant', 'description': 'Upscale dining establishment', 'score': 15, 'order': 2},
                {'id': str(uuid.uuid4()), 'label': 'Popular Cafe / Lounge', 'description': 'Trendy casual venue', 'score': 10, 'order': 3},
                {'id': str(uuid.uuid4()), 'label': 'Local Restaurant', 'description': 'Neighborhood establishment', 'score': 5, 'order': 4},
            ]
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Guest Influence',
            'description': 'Brand visibility through guest profile',
            'weight': 20,
            'is_numeric': False,
            'order': 3,
            'tiers': [
                {'id': str(uuid.uuid4()), 'label': 'International Luxury Travellers', 'description': 'Global high-net-worth individuals', 'score': 20, 'order': 0},
                {'id': str(uuid.uuid4()), 'label': 'HNIs / Business Leaders', 'description': 'Domestic high-net-worth and executives', 'score': 18, 'order': 1},
                {'id': str(uuid.uuid4()), 'label': 'Affluent City Crowd', 'description': 'Urban professionals', 'score': 15, 'order': 2},
                {'id': str(uuid.uuid4()), 'label': 'Mass Premium', 'description': 'Aspirational consumers', 'score': 10, 'order': 3},
                {'id': str(uuid.uuid4()), 'label': 'Local Casual Dining', 'description': 'General public', 'score': 5, 'order': 4},
            ]
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Sustainability Alignment',
            'description': 'Strategic brand fit with sustainability values',
            'weight': 15,
            'is_numeric': False,
            'order': 4,
            'tiers': [
                {'id': str(uuid.uuid4()), 'label': 'Strong ESG / Eco Luxury', 'description': 'Strong ESG/eco luxury positioning', 'score': 15, 'order': 0},
                {'id': str(uuid.uuid4()), 'label': 'Sustainability Conscious', 'description': 'Sustainability conscious brand', 'score': 12, 'order': 1},
                {'id': str(uuid.uuid4()), 'label': 'Moderate Alignment', 'description': 'Some sustainability initiatives', 'score': 8, 'order': 2},
                {'id': str(uuid.uuid4()), 'label': 'Low Emphasis', 'description': 'Limited sustainability focus', 'score': 4, 'order': 3},
                {'id': str(uuid.uuid4()), 'label': 'No Focus', 'description': 'No sustainability initiatives', 'score': 0, 'order': 4},
            ]
        },
    ]
    
    await tdb.scoring_models.update_one(
        {'id': model['id']},
        {'$set': {
            'categories': default_categories,
            'total_weight': 100,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return await tdb.scoring_models.find_one({'id': model['id']}, {'_id': 0})
