"""
Master data routes - SKUs, Locations, Categories, COGS
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from deps import get_current_user

router = APIRouter()

# ============= MASTER SKUs =============

@router.get("/master-skus")
async def get_master_skus(current_user: dict = Depends(get_current_user)):
    """Get all master SKUs"""
    skus = await db.master_skus.find({'is_active': True}, {'_id': 0}).to_list(100)
    return skus

@router.post("/master-skus")
async def create_master_sku(request: Request, current_user: dict = Depends(get_current_user)):
    """Create a new master SKU"""
    body = await request.json()
    
    sku_id = str(uuid.uuid4())
    sku_doc = {
        'id': sku_id,
        'name': body['name'],
        'volume_ml': body.get('volume_ml'),
        'volume_display': body.get('volume_display'),
        'category': body.get('category', 'Still'),
        'base_price': body.get('base_price', 0),
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.master_skus.insert_one(sku_doc)
    sku_doc.pop('_id', None)
    return sku_doc

@router.put("/master-skus/{sku_id}")
async def update_master_sku(sku_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Update a master SKU"""
    body = await request.json()
    
    update_data = {k: v for k, v in body.items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.master_skus.update_one(
        {'id': sku_id},
        {'$set': update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='SKU not found')
    
    updated = await db.master_skus.find_one({'id': sku_id}, {'_id': 0})
    return updated

@router.delete("/master-skus/{sku_id}")
async def delete_master_sku(sku_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a master SKU"""
    result = await db.master_skus.update_one(
        {'id': sku_id},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='SKU not found')
    
    return {'message': 'SKU deleted'}

@router.get("/sku-categories")
async def get_sku_categories(current_user: dict = Depends(get_current_user)):
    """Get distinct SKU categories"""
    categories = await db.master_skus.distinct('category')
    return categories

# ============= MASTER LOCATIONS =============

@router.get("/master-locations")
async def get_master_locations(current_user: dict = Depends(get_current_user)):
    """Get master locations in hierarchical format"""
    territories = await db.master_territories.find({'is_active': True}, {'_id': 0}).to_list(100)
    states = await db.master_states.find({'is_active': True}, {'_id': 0}).to_list(500)
    cities = await db.master_cities.find({'is_active': True}, {'_id': 0}).to_list(1000)
    
    # Build hierarchy
    result = []
    for territory in territories:
        territory_states = [s for s in states if s.get('territory_id') == territory['id']]
        territory_data = {
            'id': territory['id'],
            'name': territory['name'],
            'code': territory.get('code', ''),
            'states': []
        }
        
        for state in territory_states:
            state_cities = [c for c in cities if c.get('state_id') == state['id']]
            state_data = {
                'id': state['id'],
                'name': state['name'],
                'code': state.get('code', ''),
                'cities': [{'id': c['id'], 'name': c['name']} for c in state_cities]
            }
            territory_data['states'].append(state_data)
        
        result.append(territory_data)
    
    return result

@router.get("/master-locations/flat")
async def get_master_locations_flat(current_user: dict = Depends(get_current_user)):
    """Get master locations as flat lists for dropdowns"""
    territories = await db.master_territories.find({'is_active': True}, {'_id': 0}).to_list(100)
    states = await db.master_states.find({'is_active': True}, {'_id': 0}).to_list(500)
    cities = await db.master_cities.find({'is_active': True}, {'_id': 0}).to_list(1000)
    
    # Enrich states with territory name
    territory_map = {t['id']: t['name'] for t in territories}
    for state in states:
        state['territory_id'] = state.get('territory_id', '')
        state['territory_name'] = territory_map.get(state.get('territory_id'), '')
    
    # Enrich cities with state name
    state_map = {s['id']: s['name'] for s in states}
    for city in cities:
        city['state_id'] = city.get('state_id', '')
        city['state_name'] = state_map.get(city.get('state_id'), '')
    
    return {
        'territories': territories,
        'states': states,
        'cities': cities
    }

# Territory CRUD
@router.post("/master-locations/territories")
async def create_territory(request: Request, current_user: dict = Depends(get_current_user)):
    """Create a new territory"""
    body = await request.json()
    territory_id = str(uuid.uuid4())
    
    doc = {
        'id': territory_id,
        'name': body['name'],
        'code': body.get('code', ''),
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.master_territories.insert_one(doc)
    return {'id': territory_id, 'name': body['name']}

@router.put("/master-locations/territories/{territory_id}")
async def update_territory(territory_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Update a territory"""
    body = await request.json()
    update_data = {k: v for k, v in body.items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_territories.update_one({'id': territory_id}, {'$set': update_data})
    updated = await db.master_territories.find_one({'id': territory_id}, {'_id': 0})
    return updated

@router.delete("/master-locations/territories/{territory_id}")
async def delete_territory(territory_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a territory"""
    await db.master_territories.update_one(
        {'id': territory_id}, 
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': 'Territory deleted'}

# State CRUD
@router.post("/master-locations/states")
async def create_state(request: Request, current_user: dict = Depends(get_current_user)):
    """Create a new state"""
    body = await request.json()
    state_id = str(uuid.uuid4())
    
    doc = {
        'id': state_id,
        'name': body['name'],
        'code': body.get('code', ''),
        'territory_id': body['territory_id'],
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.master_states.insert_one(doc)
    return {'id': state_id, 'name': body['name']}

@router.put("/master-locations/states/{state_id}")
async def update_state(state_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Update a state"""
    body = await request.json()
    update_data = {k: v for k, v in body.items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_states.update_one({'id': state_id}, {'$set': update_data})
    updated = await db.master_states.find_one({'id': state_id}, {'_id': 0})
    return updated

@router.delete("/master-locations/states/{state_id}")
async def delete_state(state_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a state"""
    await db.master_states.update_one(
        {'id': state_id}, 
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': 'State deleted'}

# City CRUD
@router.post("/master-locations/cities")
async def create_city(request: Request, current_user: dict = Depends(get_current_user)):
    """Create a new city"""
    body = await request.json()
    city_id = str(uuid.uuid4())
    
    doc = {
        'id': city_id,
        'name': body['name'],
        'state_id': body['state_id'],
        'is_active': True,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.master_cities.insert_one(doc)
    return {'id': city_id, 'name': body['name']}

@router.put("/master-locations/cities/{city_id}")
async def update_city(city_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Update a city"""
    body = await request.json()
    update_data = {k: v for k, v in body.items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_cities.update_one({'id': city_id}, {'$set': update_data})
    updated = await db.master_cities.find_one({'id': city_id}, {'_id': 0})
    return updated

@router.delete("/master-locations/cities/{city_id}")
async def delete_city(city_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a city"""
    await db.master_cities.update_one(
        {'id': city_id}, 
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': 'City deleted'}
