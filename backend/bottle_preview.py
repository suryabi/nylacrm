from fastapi import File, UploadFile, HTTPException
from PIL import Image
import io
import base64

@api_router.post("/bottle-preview/upload-logo")
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
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
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

@api_router.post("/bottle-preview/save")
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

@api_router.get("/bottle-preview/history")
async def get_preview_history(current_user: dict = Depends(get_current_user)):
    """Get saved bottle previews"""
    
    previews = await db.bottle_previews.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).limit(20).to_list(20)
    
    return {'previews': previews}
