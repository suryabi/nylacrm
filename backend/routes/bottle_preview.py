"""
Bottle Preview module - proxy images, logo upload, preview save/history.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Response
from typing import Optional
from datetime import datetime, timezone
import httpx
import uuid
import base64

from database import db, get_tenant_db
from deps import get_current_user

router = APIRouter()


def get_tdb():
    return get_tenant_db()


# ============= BOTTLE PREVIEW ROUTES =============

@router.get("/bottle-preview/proxy-image")
async def proxy_bottle_image(url: str, current_user: dict = Depends(get_current_user)):
    """Proxy external bottle images to avoid CORS issues"""
    
    # Validate URL - only allow specific domains
    allowed_domains = ['customer-assets.emergentagent.com']
    from urllib.parse import urlparse
    parsed_url = urlparse(url)
    
    if parsed_url.netloc not in allowed_domains:
        raise HTTPException(status_code=400, detail='URL domain not allowed')
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            # Determine content type
            content_type = response.headers.get('content-type', 'image/jpeg')
            
            return Response(
                content=response.content,
                media_type=content_type,
                headers={
                    'Cache-Control': 'public, max-age=86400',  # Cache for 24 hours
                    'Access-Control-Allow-Origin': '*'
                }
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f'Failed to fetch image: {str(e)}')

@router.post("/bottle-preview/upload-logo")
async def upload_customer_logo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload customer logo for bottle preview"""
    
    # Validate file type
    allowed_types = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail='Only PNG, JPG, and SVG files are allowed')
    
    # Read file
    contents = await file.read()
    
    # Convert to base64 for frontend
    if file.content_type == 'image/svg+xml':
        # SVG - return as is
        logo_data = f'data:image/svg+xml;base64,{base64.b64encode(contents).decode()}'
    else:
        # PNG/JPG - process with PIL
        try:
            img = Image.open(io.BytesIO(contents))
            
            # Convert to RGB if needed
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                if img.mode == 'RGBA':
                    background.paste(img, mask=img.split()[-1])
                else:
                    background.paste(img)
                img = background
            
            # Resize if too large (max 1000px width)
            max_width = 1000
            if img.width > max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            
            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True, quality=95)
            img_str = base64.b64encode(buffer.getvalue()).decode()
            logo_data = f'data:image/png;base64,{img_str}'
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'Failed to process image: {str(e)}')
    
    return {
        'logo_data': logo_data,
        'file_name': file.filename,
        'content_type': file.content_type
    }

@router.post("/bottle-preview/save")
async def save_bottle_preview(preview_data: dict, current_user: dict = Depends(get_current_user)):
    """Save bottle preview for later reference"""
    
    preview = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'customer_name': preview_data.get('customer_name', ''),
        'bottle_size': preview_data.get('bottle_size', '660ml'),
        'logo_data': preview_data.get('logo_data', ''),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.bottle_previews.insert_one(preview)
    
    return {
        'id': preview['id'],
        'message': 'Preview saved successfully'
    }

@router.get("/bottle-preview/history")
async def get_preview_history(current_user: dict = Depends(get_current_user)):
    """Get saved bottle previews"""
    
    previews = await db.bottle_previews.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).limit(20).to_list(20)
    
    return {'previews': previews}

