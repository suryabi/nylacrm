"""
Contact Categories and Contacts API Routes
Multi-tenant aware - all queries automatically filter by tenant_id
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import base64
import os

from deps import get_current_user
from database import get_tenant_db

router = APIRouter(prefix="/contacts", tags=["Contacts"])

def get_tdb():
    """Get tenant-aware database wrapper"""
    return get_tenant_db()

# ============== MODELS ==============

class ContactCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "users"
    color: Optional[str] = "#6366f1"
    is_active: bool = True

class ContactCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None

class ContactCreate(BaseModel):
    category_id: str
    name: str
    company: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None
    card_front_url: Optional[str] = None
    card_back_url: Optional[str] = None

class ContactUpdate(BaseModel):
    category_id: Optional[str] = None
    name: Optional[str] = None
    company: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None
    card_front_url: Optional[str] = None
    card_back_url: Optional[str] = None

# ============== DEFAULT CATEGORIES ==============

DEFAULT_CATEGORIES = [
    {"name": "Vendors", "description": "Product and service vendors", "icon": "truck", "color": "#f59e0b"},
    {"name": "Partners", "description": "Business partners and collaborators", "icon": "handshake", "color": "#10b981"},
    {"name": "Distributors", "description": "Product distributors and resellers", "icon": "package", "color": "#6366f1"},
    {"name": "Hoteliers", "description": "Hotel owners and managers", "icon": "hotel", "color": "#ec4899"},
    {"name": "Event Managers", "description": "Event planning and management contacts", "icon": "calendar", "color": "#8b5cf6"},
]

async def initialize_default_categories():
    """Initialize default contact categories if none exist"""
    tdb = get_tdb()
    count = await tdb.contact_categories.count_documents({})
    if count == 0:
        for cat_data in DEFAULT_CATEGORIES:
            category = {
                'id': str(uuid.uuid4()),
                **cat_data,
                'is_active': True,
                'is_default': True,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
            await tdb.contact_categories.insert_one(category)

# ============== CATEGORY ENDPOINTS ==============

@router.get("/categories")
async def get_contact_categories(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get all contact categories"""
    tdb = get_tdb()
    await initialize_default_categories()
    
    query = {} if include_inactive else {'is_active': True}
    categories = await tdb.contact_categories.find(query, {'_id': 0}).sort('name', 1).to_list(100)
    return categories

@router.post("/categories")
async def create_contact_category(
    category: ContactCategoryCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new contact category"""
    tdb = get_tdb()
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage contact categories")
    
    # Check for duplicate name
    existing = await tdb.contact_categories.find_one({'name': category.name}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    category_data = {
        'id': str(uuid.uuid4()),
        **category.model_dump(),
        'is_default': False,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await tdb.contact_categories.insert_one(category_data)
    return {k: v for k, v in category_data.items() if k != '_id'}

@router.put("/categories/{category_id}")
async def update_contact_category(
    category_id: str,
    category_update: ContactCategoryUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a contact category"""
    tdb = get_tdb()
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage contact categories")
    
    existing = await tdb.contact_categories.find_one({'id': category_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_data = {k: v for k, v in category_update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await tdb.contact_categories.update_one({'id': category_id}, {'$set': update_data})
    updated = await tdb.contact_categories.find_one({'id': category_id}, {'_id': 0})
    return updated

@router.delete("/categories/{category_id}")
async def delete_contact_category(
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Soft delete a contact category"""
    tdb = get_tdb()
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only admins can manage contact categories")
    
    existing = await tdb.contact_categories.find_one({'id': category_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if category has contacts
    contact_count = await tdb.contacts.count_documents({'category_id': category_id})
    if contact_count > 0:
        # Soft delete
        await tdb.contact_categories.update_one(
            {'id': category_id},
            {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": f"Category deactivated (has {contact_count} contacts)"}
    else:
        # Hard delete if no contacts
        await tdb.contact_categories.delete_one({'id': category_id})
        return {"message": "Category deleted"}

# ============== CONTACT ENDPOINTS ==============

@router.get("")
async def get_contacts(
    page: int = 1,
    page_size: int = 25,
    category_id: Optional[str] = None,
    company: Optional[str] = None,
    city: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get contacts with pagination and filters"""
    tdb = get_tdb()
    query = {}
    
    if category_id:
        query['category_id'] = category_id
    if company:
        query['company'] = {'$regex': company, '$options': 'i'}
    if city:
        query['city'] = {'$regex': city, '$options': 'i'}
    if search:
        query['$or'] = [
            {'name': {'$regex': search, '$options': 'i'}},
            {'company': {'$regex': search, '$options': 'i'}},
            {'email': {'$regex': search, '$options': 'i'}},
            {'phone': {'$regex': search, '$options': 'i'}},
            {'designation': {'$regex': search, '$options': 'i'}},
        ]
    
    # Get total count
    total = await tdb.contacts.count_documents(query)
    
    # Get paginated results
    skip = (page - 1) * page_size
    contacts = await tdb.contacts.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Get category names for each contact
    category_ids = list(set(c.get('category_id') for c in contacts if c.get('category_id')))
    categories = await tdb.contact_categories.find({'id': {'$in': category_ids}}, {'_id': 0, 'id': 1, 'name': 1, 'color': 1}).to_list(100)
    category_map = {c['id']: c for c in categories}
    
    for contact in contacts:
        cat = category_map.get(contact.get('category_id'), {})
        contact['category_name'] = cat.get('name', 'Unknown')
        contact['category_color'] = cat.get('color', '#6366f1')
    
    return {
        'contacts': contacts,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size
    }

@router.get("/filter-options")
async def get_contact_filter_options(current_user: dict = Depends(get_current_user)):
    """Get unique values for filter dropdowns"""
    tdb = get_tdb()
    # Get unique companies
    companies = await tdb.contacts.distinct('company')
    companies = [c for c in companies if c]
    
    # Get unique cities
    cities = await tdb.contacts.distinct('city')
    cities = [c for c in cities if c]
    
    # Get categories
    categories = await tdb.contact_categories.find({'is_active': True}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    
    return {
        'companies': sorted(companies),
        'cities': sorted(cities),
        'categories': categories
    }

@router.get("/{contact_id}")
async def get_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single contact by ID"""
    tdb = get_tdb()
    contact = await tdb.contacts.find_one({'id': contact_id}, {'_id': 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # Add category info
    if contact.get('category_id'):
        category = await tdb.contact_categories.find_one({'id': contact['category_id']}, {'_id': 0, 'name': 1, 'color': 1})
        if category:
            contact['category_name'] = category.get('name')
            contact['category_color'] = category.get('color')
    
    return contact

@router.post("")
async def create_contact(
    contact: ContactCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new contact"""
    tdb = get_tdb()
    # Verify category exists
    category = await tdb.contact_categories.find_one({'id': contact.category_id}, {'_id': 0})
    if not category:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    contact_data = {
        'id': str(uuid.uuid4()),
        **contact.model_dump(),
        'category_name': category['name'],
        'created_by': current_user['id'],
        'created_by_name': current_user.get('name', 'Unknown'),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await tdb.contacts.insert_one(contact_data)
    return {k: v for k, v in contact_data.items() if k != '_id'}

@router.put("/{contact_id}")
async def update_contact(
    contact_id: str,
    contact_update: ContactUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a contact"""
    tdb = get_tdb()
    existing = await tdb.contacts.find_one({'id': contact_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    update_data = {k: v for k, v in contact_update.model_dump().items() if v is not None}
    
    # If category changed, update category name
    if 'category_id' in update_data:
        category = await tdb.contact_categories.find_one({'id': update_data['category_id']}, {'_id': 0})
        if category:
            update_data['category_name'] = category['name']
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    update_data['updated_by'] = current_user['id']
    
    await tdb.contacts.update_one({'id': contact_id}, {'$set': update_data})
    updated = await tdb.contacts.find_one({'id': contact_id}, {'_id': 0})
    return updated

@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a contact"""
    tdb = get_tdb()
    existing = await tdb.contacts.find_one({'id': contact_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    await tdb.contacts.delete_one({'id': contact_id})
    return {"message": "Contact deleted"}

# ============== VISITING CARD OCR ==============

@router.post("/extract-card")
async def extract_visiting_card(
    front_image: UploadFile = File(None),
    back_image: UploadFile = File(None),
    front_base64: str = Form(None),
    back_base64: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Extract contact information from visiting card images using Claude Vision"""
    from emergentintegrations.llm.anthropic import AnthropicConfig, anthropic_text_response
    
    EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM API key not configured")
    
    # Prepare images
    images_data = []
    
    # Handle front image
    if front_image:
        front_content = await front_image.read()
        front_b64 = base64.b64encode(front_content).decode('utf-8')
        images_data.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": front_image.content_type or "image/jpeg",
                "data": front_b64
            }
        })
    elif front_base64:
        # Remove data URL prefix if present
        if 'base64,' in front_base64:
            front_base64 = front_base64.split('base64,')[1]
        images_data.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": front_base64
            }
        })
    
    # Handle back image
    if back_image:
        back_content = await back_image.read()
        back_b64 = base64.b64encode(back_content).decode('utf-8')
        images_data.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": back_image.content_type or "image/jpeg",
                "data": back_b64
            }
        })
    elif back_base64:
        if 'base64,' in back_base64:
            back_base64 = back_base64.split('base64,')[1]
        images_data.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": back_base64
            }
        })
    
    if not images_data:
        raise HTTPException(status_code=400, detail="At least one image is required")
    
    # Build the prompt
    prompt = """Analyze this visiting card image(s) and extract the contact information.
Return the data in the following JSON format ONLY (no other text):
{
    "name": "Full name of the person",
    "company": "Company or organization name",
    "designation": "Job title or position",
    "phone": "Phone number(s) - if multiple, use the primary/mobile one",
    "email": "Email address",
    "address": "Full address including street, building etc.",
    "city": "City name",
    "state": "State or province",
    "country": "Country name"
}

Rules:
- Extract all visible information from both front and back of the card if provided
- For phone, prefer mobile numbers over landline
- If a field is not visible or unclear, use null
- Clean up the data (remove extra spaces, format properly)
- For address, combine all address parts into a single string
- Return ONLY the JSON object, no explanations"""

    try:
        config = AnthropicConfig(
            api_key=EMERGENT_LLM_KEY,
            model="claude-sonnet-4-20250514"
        )
        
        # Build message content with images and text
        content = images_data + [{"type": "text", "text": prompt}]
        
        response = await anthropic_text_response(
            config=config,
            messages=[{"role": "user", "content": content}]
        )
        
        # Parse the JSON response
        import json
        response_text = response.strip()
        
        # Try to extract JSON from the response
        if response_text.startswith('{'):
            extracted_data = json.loads(response_text)
        else:
            # Try to find JSON in the response
            import re
            json_match = re.search(r'\{[^{}]*\}', response_text, re.DOTALL)
            if json_match:
                extracted_data = json.loads(json_match.group())
            else:
                raise ValueError("Could not parse JSON from response")
        
        return {
            "success": True,
            "data": extracted_data
        }
        
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": f"Failed to parse extracted data: {str(e)}",
            "raw_response": response_text if 'response_text' in dir() else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR extraction failed: {str(e)}")
