"""
Lead Scoring Model Routes - City-specific lead scoring configuration
Each tenant can define scoring models per city, with a default fallback
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid

from database import get_tenant_db, db
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
    """Complete scoring model for a tenant + city"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    city: str = "default"  # City name or "default" for fallback model
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


class LeadScore(BaseModel):
    """Score breakdown for a lead"""
    lead_id: str
    total_score: int = 0
    category_scores: dict = {}  # {category_id: {score: int, tier_id: str, tier_label: str}}
    quadrant: str = "Puzzles"  # Stars, Showcase, Plough Horses, Puzzles
    scored_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LeadScoreInput(BaseModel):
    """Input for scoring a lead"""
    category_scores: dict  # {category_id: tier_id}


class CopyModelInput(BaseModel):
    """Input for copying a model to another city"""
    target_city: str


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


async def get_or_create_scoring_model(city: str = "default"):
    """Get the scoring model for a specific city, or create default"""
    tdb = get_tdb()
    
    # First try to find model for specific city
    model = await tdb.scoring_models.find_one({'city': city, 'is_active': True}, {'_id': 0})
    
    if model:
        return model
    
    # If city is not "default" and no model found, try to get default model
    if city != "default":
        # Try city-specific default first
        default_model = await tdb.scoring_models.find_one({'city': 'default', 'is_active': True}, {'_id': 0})
        
        # Also check for legacy models without city field
        if not default_model:
            default_model = await tdb.scoring_models.find_one({'city': {'$exists': False}, 'is_active': True}, {'_id': 0})
            if default_model:
                # Upgrade legacy model to have city field
                await tdb.scoring_models.update_one(
                    {'id': default_model['id']},
                    {'$set': {'city': 'default'}}
                )
                default_model['city'] = 'default'
        
        if default_model:
            # Return default model info but indicate it's a fallback
            default_model['_is_fallback'] = True
            default_model['_fallback_city'] = city
            return default_model
    
    # Check for legacy model without city field (for default requests)
    legacy_model = await tdb.scoring_models.find_one({'city': {'$exists': False}, 'is_active': True}, {'_id': 0})
    if legacy_model:
        # Upgrade legacy model
        await tdb.scoring_models.update_one(
            {'id': legacy_model['id']},
            {'$set': {'city': 'default'}}
        )
        legacy_model['city'] = 'default'
        return legacy_model
    
    # Create default model if none exists
    default_model = {
        'id': str(uuid.uuid4()),
        'city': 'default',
        'name': 'Default Scoring Model',
        'description': 'Default scoring model - applies to all cities without specific configuration',
        'categories': [],
        'total_weight': 0,
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    await tdb.scoring_models.insert_one(default_model)
    return default_model


async def get_model_for_lead(lead_city: str):
    """Get the appropriate scoring model for a lead based on its city"""
    tdb = get_tdb()
    
    # First try city-specific model
    if lead_city:
        model = await tdb.scoring_models.find_one({'city': lead_city, 'is_active': True}, {'_id': 0})
        if model:
            return model
    
    # Fall back to default model
    model = await tdb.scoring_models.find_one({'city': 'default', 'is_active': True}, {'_id': 0})
    
    # Also check for legacy models
    if not model:
        model = await tdb.scoring_models.find_one({'city': {'$exists': False}, 'is_active': True}, {'_id': 0})
        if model:
            model['city'] = 'default'  # Treat as default
    
    return model


# ============= SCORING MODEL ROUTES =============

@router.get("/model")
async def get_scoring_model(
    city: str = Query(default="default", description="City name or 'default' for fallback model"),
    current_user: dict = Depends(get_current_user)
):
    """Get the scoring model for a specific city"""
    model = await get_or_create_scoring_model(city)
    return model


@router.get("/models/cities")
async def get_cities_with_models(current_user: dict = Depends(get_current_user)):
    """Get list of cities that have scoring models configured"""
    tdb = get_tdb()
    
    # Get all active models
    models = await tdb.scoring_models.find({'is_active': True}, {'_id': 0, 'city': 1, 'name': 1, 'total_weight': 1, 'categories': 1}).to_list(100)
    
    cities = []
    for model in models:
        city = model.get('city', 'default')  # Handle legacy models without city field
        cities.append({
            'city': city,
            'name': model.get('name', 'Unnamed Model'),
            'total_weight': model.get('total_weight', 0),
            'category_count': len(model.get('categories', []))
        })
    
    return {'cities': cities}


@router.post("/models/copy")
async def copy_model_to_city(
    source_city: str,
    copy_input: CopyModelInput,
    current_user: dict = Depends(get_current_user)
):
    """Copy a scoring model from one city to another"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    
    # Get source model
    source_model = await tdb.scoring_models.find_one({'city': source_city, 'is_active': True}, {'_id': 0})
    if not source_model:
        raise HTTPException(status_code=404, detail=f"No scoring model found for city: {source_city}")
    
    # Check if target city already has a model
    existing_target = await tdb.scoring_models.find_one({'city': copy_input.target_city, 'is_active': True})
    if existing_target:
        raise HTTPException(status_code=400, detail=f"City '{copy_input.target_city}' already has a scoring model. Delete it first to copy.")
    
    # Create new model for target city
    new_model = {
        'id': str(uuid.uuid4()),
        'city': copy_input.target_city,
        'name': f"Scoring Model - {copy_input.target_city}",
        'description': f"Copied from {source_city}",
        'categories': source_model.get('categories', []),
        'total_weight': source_model.get('total_weight', 0),
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    # Generate new IDs for categories and tiers
    for category in new_model['categories']:
        category['id'] = str(uuid.uuid4())
        for tier in category.get('tiers', []):
            tier['id'] = str(uuid.uuid4())
    
    await tdb.scoring_models.insert_one(new_model)
    
    return {
        'message': f"Model copied from '{source_city}' to '{copy_input.target_city}'",
        'model': await tdb.scoring_models.find_one({'id': new_model['id']}, {'_id': 0})
    }


@router.delete("/models/{city}")
async def delete_city_model(city: str, current_user: dict = Depends(get_current_user)):
    """Delete a city-specific scoring model"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if city == "default":
        raise HTTPException(status_code=400, detail="Cannot delete the default model")
    
    tdb = get_tdb()
    result = await tdb.scoring_models.delete_one({'city': city})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"No model found for city: {city}")
    
    return {'message': f"Model for city '{city}' deleted"}


@router.put("/model")
async def update_scoring_model(
    city: str = Query(default="default"),
    name: Optional[str] = None,
    description: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Update scoring model name/description"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await get_or_create_scoring_model(city)
    
    # If using fallback, create a new model for this city
    if model.get('_is_fallback'):
        new_model = {
            'id': str(uuid.uuid4()),
            'city': city,
            'name': name or f"Scoring Model - {city}",
            'description': description or f"Scoring model for {city}",
            'categories': [],
            'total_weight': 0,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        await tdb.scoring_models.insert_one(new_model)
        return await tdb.scoring_models.find_one({'id': new_model['id']}, {'_id': 0})
    
    update_data = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if name:
        update_data['name'] = name
    if description:
        update_data['description'] = description
    
    await tdb.scoring_models.update_one({'id': model['id']}, {'$set': update_data})
    return await tdb.scoring_models.find_one({'id': model['id']}, {'_id': 0})


# ============= CATEGORY ROUTES =============

@router.post("/categories")
async def create_category(
    category: CategoryCreate, 
    city: str = Query(default="default"),
    current_user: dict = Depends(get_current_user)
):
    """Add a new scoring category to a city's model"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await get_or_create_scoring_model(city)
    
    # If using fallback, create a new model for this city first
    if model.get('_is_fallback'):
        new_model = {
            'id': str(uuid.uuid4()),
            'city': city,
            'name': f"Scoring Model - {city}",
            'description': f"Scoring model for {city}",
            'categories': [],
            'total_weight': 0,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        await tdb.scoring_models.insert_one(new_model)
        model = new_model
    
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
    city: str = Query(default="default"),
    current_user: dict = Depends(get_current_user)
):
    """Update a scoring category"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await tdb.scoring_models.find_one({'city': city, 'is_active': True}, {'_id': 0})
    
    if not model:
        raise HTTPException(status_code=404, detail=f"No scoring model found for city: {city}")
    
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
async def delete_category(
    category_id: str,
    city: str = Query(default="default"),
    current_user: dict = Depends(get_current_user)
):
    """Delete a scoring category"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await tdb.scoring_models.find_one({'city': city, 'is_active': True}, {'_id': 0})
    
    if not model:
        raise HTTPException(status_code=404, detail=f"No scoring model found for city: {city}")
    
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
    city: str = Query(default="default"),
    current_user: dict = Depends(get_current_user)
):
    """Add a new scoring tier to a category"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await tdb.scoring_models.find_one({'city': city, 'is_active': True}, {'_id': 0})
    
    if not model:
        raise HTTPException(status_code=404, detail=f"No scoring model found for city: {city}")
    
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
    city: str = Query(default="default"),
    current_user: dict = Depends(get_current_user)
):
    """Update a scoring tier"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await tdb.scoring_models.find_one({'city': city, 'is_active': True}, {'_id': 0})
    
    if not model:
        raise HTTPException(status_code=404, detail=f"No scoring model found for city: {city}")
    
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
    city: str = Query(default="default"),
    current_user: dict = Depends(get_current_user)
):
    """Delete a scoring tier"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    model = await tdb.scoring_models.find_one({'city': city, 'is_active': True}, {'_id': 0})
    
    if not model:
        raise HTTPException(status_code=404, detail=f"No scoring model found for city: {city}")
    
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


# ============= LEAD SCORING ROUTES =============

@router.post("/leads/{lead_id}/score")
async def score_lead(
    lead_id: str,
    score_input: LeadScoreInput,
    current_user: dict = Depends(get_current_user)
):
    """Score a lead based on selected tiers - uses the lead's city to determine which model to use"""
    tdb = get_tdb()
    
    # Verify lead exists
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    lead_city = lead.get('city', 'default')
    
    # Get scoring model for lead's city
    model = await get_model_for_lead(lead_city)
    
    if not model:
        raise HTTPException(status_code=400, detail="No scoring model available. Please configure the default scoring model first.")
    
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
    
    # Store score on lead
    score_data = {
        'total_score': total_score,
        'category_scores': category_scores,
        'quadrant': quadrant,
        'model_city': model.get('city', 'default'),
        'scored_at': datetime.now(timezone.utc).isoformat(),
        'scored_by': current_user['id']
    }
    
    await tdb.leads.update_one(
        {'id': lead_id},
        {'$set': {
            'scoring': score_data,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        'lead_id': lead_id,
        'company': lead.get('company'),
        'city': lead_city,
        **score_data
    }


@router.get("/leads/{lead_id}/score")
async def get_lead_score(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get the score for a specific lead"""
    tdb = get_tdb()
    
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    scoring = lead.get('scoring')
    if not scoring:
        return {
            'lead_id': lead_id,
            'company': lead.get('company'),
            'city': lead.get('city'),
            'scored': False,
            'message': 'Lead has not been scored yet'
        }
    
    return {
        'lead_id': lead_id,
        'company': lead.get('company'),
        'city': lead.get('city'),
        'scored': True,
        **scoring
    }


@router.get("/leads/scores")
async def get_all_lead_scores(
    quadrant: Optional[str] = None,
    city: Optional[str] = None,
    min_score: Optional[int] = None,
    max_score: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get scores for all leads, optionally filtered"""
    tdb = get_tdb()
    
    query = {'scoring': {'$exists': True}}
    
    if quadrant:
        query['scoring.quadrant'] = quadrant
    if city:
        query['city'] = city
    if min_score is not None:
        query['scoring.total_score'] = {'$gte': min_score}
    if max_score is not None:
        if 'scoring.total_score' in query:
            query['scoring.total_score']['$lte'] = max_score
        else:
            query['scoring.total_score'] = {'$lte': max_score}
    
    leads = await tdb.leads.find(
        query,
        {'_id': 0, 'id': 1, 'company': 1, 'lead_id': 1, 'city': 1, 'scoring': 1}
    ).sort('scoring.total_score', -1).to_list(1000)
    
    return {
        'leads': leads,
        'total': len(leads)
    }


@router.get("/portfolio-matrix")
async def get_portfolio_matrix(
    city: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get portfolio matrix data for leads visualization"""
    tdb = get_tdb()
    
    # Build query
    query = {'scoring': {'$exists': True}}
    if city:
        query['city'] = city
    
    # Get all scored leads
    leads = await tdb.leads.find(
        query,
        {'_id': 0, 'id': 1, 'company': 1, 'lead_id': 1, 'city': 1, 'scoring': 1}
    ).to_list(1000)
    
    # Group by quadrant
    matrix = {
        'Stars': [],
        'Showcase': [],
        'Plough Horses': [],
        'Puzzles': []
    }
    
    for lead in leads:
        quadrant = lead.get('scoring', {}).get('quadrant', 'Puzzles')
        matrix[quadrant].append({
            'id': lead['id'],
            'company': lead.get('company'),
            'lead_id': lead.get('lead_id'),
            'city': lead.get('city'),
            'total_score': lead.get('scoring', {}).get('total_score', 0)
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
            'total_scored': len(leads)
        }
    }


# ============= BULK OPERATIONS =============

@router.post("/seed-default-model")
async def seed_default_model(
    city: str = Query(default="default"),
    current_user: dict = Depends(get_current_user)
):
    """Seed a scoring model with example categories (for initial setup)"""
    if current_user.get('role') not in ['CEO', 'Director', 'Admin', 'System Admin']:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tdb = get_tdb()
    
    # Check if model already has categories for this city
    model = await tdb.scoring_models.find_one({'city': city, 'is_active': True}, {'_id': 0})
    if model and model.get('categories') and len(model['categories']) > 0:
        raise HTTPException(status_code=400, detail=f"Scoring model for '{city}' already has categories. Delete them first to reseed.")
    
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
    
    if model:
        # Update existing model
        await tdb.scoring_models.update_one(
            {'id': model['id']},
            {'$set': {
                'categories': default_categories,
                'total_weight': 100,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
        return await tdb.scoring_models.find_one({'id': model['id']}, {'_id': 0})
    else:
        # Create new model for this city
        new_model = {
            'id': str(uuid.uuid4()),
            'city': city,
            'name': f"Scoring Model - {city}" if city != 'default' else 'Default Scoring Model',
            'description': f"Lead scoring model for {city}" if city != 'default' else 'Default scoring model for all cities',
            'categories': default_categories,
            'total_weight': 100,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        await tdb.scoring_models.insert_one(new_model)
        return await tdb.scoring_models.find_one({'id': new_model['id']}, {'_id': 0})
