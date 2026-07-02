"""
Bottle Preview module - proxy images, logo upload, preview save/history.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Response
from typing import Optional
from datetime import datetime, timezone
import httpx
import uuid
import base64
import io

from PIL import Image, ImageOps

# Register HEIF/HEIC opener so PIL can decode iPhone photos and similar formats.
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:  # pragma: no cover — plugin optional at runtime
    pass

from database import db, get_tenant_db
from deps import get_current_user

router = APIRouter()


def get_tdb():
    return get_tenant_db()


def _image_bytes_to_png_dataurl(contents: bytes, filename: str = '', content_type: str = ''):
    """Normalize arbitrary image bytes to a PNG (or passthrough SVG) base64 data URL.

    Shared by the customer-logo upload and the lead-logo loader so both produce
    identical, canvas-safe data URLs.
    """
    content_type = (content_type or '').lower()
    filename_lc = (filename or '').lower()

    # Vector SVG passthrough — return base64 data URL so the canvas overlay can render it.
    if content_type == 'image/svg+xml' or filename_lc.endswith('.svg'):
        return {
            'logo_data': f'data:image/svg+xml;base64,{base64.b64encode(contents).decode()}',
            'file_name': filename,
            'content_type': 'image/svg+xml',
        }

    # Raster: decode with PIL (format detected from bytes), apply EXIF orientation.
    try:
        img = Image.open(io.BytesIO(contents))
        img.load()
        img = ImageOps.exif_transpose(img)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Couldn't read this image ({type(e).__name__}). "
                "Please upload an image file (PNG, JPG, SVG, WebP, GIF, BMP, TIFF, HEIC/HEIF, or AVIF)."
            ),
        )

    try:
        # Flatten transparency onto white so the logo composites cleanly on bottles.
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            if img.mode == 'RGBA':
                background.paste(img, mask=img.split()[-1])
            else:
                background.paste(img.convert('RGBA'), mask=img.convert('RGBA').split()[-1])
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Cap width at 1000px to keep the data URL light.
        max_width = 1000
        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)), Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        img.save(buffer, format='PNG', optimize=True)
        logo_data = f'data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}'
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'Failed to process image: {e}')

    return {
        'logo_data': logo_data,
        'file_name': filename,
        'content_type': 'image/png',  # we always return PNG to the frontend
        'original_content_type': content_type or None,
    }


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
    """Upload a customer logo for the bottle preview.

    Accepts any image format Pillow can decode (PNG, JPG/JPEG, SVG passthrough,
    WebP, GIF, BMP, TIFF, HEIC/HEIF, AVIF, ICO, …). Vector SVGs are stored as-is
    (base64); raster images are normalised to RGB PNG and downscaled to 1000px
    width max. File-size cap: 15 MB.
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail='Uploaded file is empty')

    MAX_BYTES = 15 * 1024 * 1024  # 15 MB
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail='Image is larger than 15 MB. Please upload a smaller file.')

    return _image_bytes_to_png_dataurl(contents, file.filename, file.content_type)

@router.get("/bottle-preview/lead-logo/{lead_id}")
async def get_lead_logo_for_preview(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Return a lead's stored logo as a PNG data URL for the bottle preview (if it has one)."""
    import os

    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    company = lead.get('company')
    contents = None

    # Preferred: durable object storage
    storage_path = lead.get('logo_storage_path')
    if storage_path:
        try:
            from object_storage import get_object
            contents, _ct = get_object(storage_path)
        except Exception:
            contents = None

    # Fallback: legacy on-disk logo (pre object-storage uploads)
    if not contents:
        logo_url = lead.get('logo_url') or ''
        if logo_url and '/static/logos/leads/' in logo_url:
            file_name = logo_url.rstrip('/').split('/')[-1].split('?')[0]
            file_path = os.path.join('/app/backend/static/logos/leads', file_name)
            if file_name and os.path.exists(file_path):
                with open(file_path, 'rb') as f:
                    contents = f.read()

    if not contents:
        return {'has_logo': False, 'logo_data': None, 'company': company}

    result = _image_bytes_to_png_dataurl(contents, 'lead-logo.png')
    return {
        'has_logo': True,
        'logo_data': result['logo_data'],
        'company': company,
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

