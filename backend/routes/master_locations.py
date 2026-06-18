"""
Master Locations CRUD - Territories, States, Cities
These are global collections shared across all tenants.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from deps import get_current_user

router = APIRouter()


class Territory(BaseModel):
    id: Optional[str] = None
    name: str
    code: str
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class State(BaseModel):
    id: Optional[str] = None
    name: str
    code: str
    territory_id: str
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class City(BaseModel):
    id: Optional[str] = None
    name: str
    code: str
    state_id: str
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@router.get("/master-locations")
async def get_master_locations(current_user: dict = Depends(get_current_user)):
    """Get all territories with their states and cities"""
    territories = await db.master_territories.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(100)
    states = await db.master_states.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(500)
    cities = await db.master_cities.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(5000)

    state_cities = {}
    for city in cities:
        state_id = city['state_id']
        state_cities.setdefault(state_id, []).append(city)

    territory_states = {}
    for state in states:
        territory_id = state['territory_id']
        state['cities'] = state_cities.get(state['id'], [])
        territory_states.setdefault(territory_id, []).append(state)

    result = []
    for territory in territories:
        territory['states'] = territory_states.get(territory['id'], [])
        result.append(territory)

    return result


@router.get("/master-locations/flat")
async def get_master_locations_flat(current_user: dict = Depends(get_current_user)):
    """Get flat lists of territories, states, and cities for dropdowns"""
    territories = await db.master_territories.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(100)
    states = await db.master_states.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(500)
    cities = await db.master_cities.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(5000)

    territory_map = {t['id']: t['name'] for t in territories}
    state_map = {s['id']: {'name': s['name'], 'territory_id': s['territory_id']} for s in states}

    for state in states:
        state['territory_name'] = territory_map.get(state['territory_id'], '')

    for city in cities:
        state_info = state_map.get(city['state_id'], {})
        city['state_name'] = state_info.get('name', '')
        city['territory_id'] = state_info.get('territory_id', '')
        city['territory_name'] = territory_map.get(city.get('territory_id'), '')

    return {
        'territories': territories,
        'states': states,
        'cities': cities
    }


# Territory CRUD
@router.post("/master-locations/territories")
async def create_territory(territory: Territory, current_user: dict = Depends(get_current_user)):
    """Create a new territory"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    territory_data = territory.model_dump()
    territory_data['id'] = str(uuid.uuid4())
    territory_data['created_at'] = datetime.now(timezone.utc).isoformat()
    territory_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.master_territories.insert_one(territory_data)
    territory_data.pop('_id', None)
    return territory_data


@router.put("/master-locations/territories/{territory_id}")
async def update_territory(territory_id: str, territory: Territory, current_user: dict = Depends(get_current_user)):
    """Update a territory"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = territory.model_dump(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.master_territories.update_one({'id': territory_id}, {'$set': update_data})
    updated = await db.master_territories.find_one({'id': territory_id}, {'_id': 0})
    return updated


@router.delete("/master-locations/territories/{territory_id}")
async def delete_territory(territory_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a territory"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.master_territories.update_one(
        {'id': territory_id},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': 'Territory deleted'}


# State CRUD
@router.post("/master-locations/states")
async def create_state(state: State, current_user: dict = Depends(get_current_user)):
    """Create a new state"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    state_data = state.model_dump()
    state_data['id'] = str(uuid.uuid4())
    state_data['created_at'] = datetime.now(timezone.utc).isoformat()
    state_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.master_states.insert_one(state_data)
    return {k: v for k, v in state_data.items() if k != '_id'}


@router.put("/master-locations/states/{state_id}")
async def update_state(state_id: str, state: State, current_user: dict = Depends(get_current_user)):
    """Update a state"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = state.model_dump(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.master_states.update_one({'id': state_id}, {'$set': update_data})
    updated = await db.master_states.find_one({'id': state_id}, {'_id': 0})
    return updated


@router.delete("/master-locations/states/{state_id}")
async def delete_state(state_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a state and all its cities"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.master_states.update_one(
        {'id': state_id},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    await db.master_cities.update_many(
        {'state_id': state_id, 'is_active': True},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': 'State and its cities deleted'}


@router.post("/master-locations/cleanup-orphaned-cities")
async def cleanup_orphaned_cities(current_user: dict = Depends(get_current_user)):
    """One-time cleanup to deactivate cities whose parent state has been deleted."""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    active_states = await db.master_states.find({'is_active': True}, {'id': 1}).to_list(5000)
    active_state_ids = [s['id'] for s in active_states]

    result = await db.master_cities.update_many(
        {'is_active': True, 'state_id': {'$nin': active_state_ids}},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )

    final_active_cities = await db.master_cities.count_documents({'is_active': True})

    return {
        'message': 'Cleanup completed',
        'orphaned_cities_deactivated': result.modified_count,
        'active_cities_remaining': final_active_cities
    }


# City CRUD
@router.post("/master-locations/cities")
async def create_city(city: City, current_user: dict = Depends(get_current_user)):
    """Create a new city"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    city_data = city.model_dump()
    city_data['id'] = str(uuid.uuid4())
    city_data['created_at'] = datetime.now(timezone.utc).isoformat()
    city_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.master_cities.insert_one(city_data)
    return {k: v for k, v in city_data.items() if k != '_id'}


@router.put("/master-locations/cities/{city_id}")
async def update_city(city_id: str, city: City, current_user: dict = Depends(get_current_user)):
    """Update a city"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = city.model_dump(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.master_cities.update_one({'id': city_id}, {'$set': update_data})
    updated = await db.master_cities.find_one({'id': city_id}, {'_id': 0})
    return updated


@router.delete("/master-locations/cities/{city_id}")
async def delete_city(city_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a city"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.master_cities.update_one(
        {'id': city_id},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': 'City deleted'}
