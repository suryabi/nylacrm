"""
Face ID authentication — server-side descriptor matching + trusted-device binding.
Browser computes 128-float descriptors (face-api.js); only numbers reach the server.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel
from typing import List
from datetime import datetime, timezone, timedelta
import math
import uuid

from database import get_tenant_db, db
from deps import hash_password, verify_password, get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()

FACE_MATCH_THRESHOLD = 0.45
SECOND_BEST_MARGIN = 0.05
MAX_DESCRIPTORS = 10
MAX_DEVICES = 10


class FaceEnrollIn(BaseModel):
    descriptors: List[List[float]]
    device_token: str


class FaceLoginIn(BaseModel):
    descriptor: List[float]
    device_token: str


def _distance(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


@router.get("/face/status")
async def face_status(current_user: dict = Depends(get_current_user)):
    doc = await db.user_face_auth.find_one({'user_id': current_user['id']}, {'_id': 0})
    return {
        'enrolled': bool(doc and doc.get('descriptors')),
        'prompt_seen': bool(doc and doc.get('prompt_seen')),
    }


@router.post("/face/enroll")
async def face_enroll(data: FaceEnrollIn, current_user: dict = Depends(get_current_user)):
    """Replace the user's Face ID enrollment and trust this device."""
    clean = [d for d in data.descriptors if isinstance(d, list) and len(d) == 128][:MAX_DESCRIPTORS]
    if not clean:
        raise HTTPException(status_code=400, detail='No valid face signatures provided')
    if not data.device_token or len(data.device_token) < 16:
        raise HTTPException(status_code=400, detail='Invalid device token')
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.user_face_auth.find_one({'user_id': current_user['id']}, {'_id': 0})
    devices = (existing or {}).get('devices', [])
    if not any(verify_password(data.device_token, h) for h in devices):
        devices = (devices + [hash_password(data.device_token)])[-MAX_DEVICES:]
    await db.user_face_auth.update_one(
        {'user_id': current_user['id']},
        {'$set': {
            'user_id': current_user['id'],
            'tenant_id': get_current_tenant_id(),
            'descriptors': clean,
            'devices': devices,
            'prompt_seen': True,
            'updated_at': now,
        }, '$setOnInsert': {'created_at': now}},
        upsert=True,
    )
    return {'message': 'Face ID enrolled', 'face_samples': len(clean)}


@router.post("/face/dismiss-prompt")
async def face_dismiss_prompt(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    await db.user_face_auth.update_one(
        {'user_id': current_user['id']},
        {'$set': {'user_id': current_user['id'], 'tenant_id': get_current_tenant_id(),
                  'prompt_seen': True, 'updated_at': now},
         '$setOnInsert': {'descriptors': [], 'devices': [], 'created_at': now}},
        upsert=True,
    )
    return {'message': 'ok'}


@router.delete("/face")
async def face_remove(current_user: dict = Depends(get_current_user)):
    await db.user_face_auth.update_one(
        {'user_id': current_user['id']},
        {'$set': {'descriptors': [], 'devices': [], 'updated_at': datetime.now(timezone.utc).isoformat()}},
    )
    return {'message': 'Face ID removed'}


@router.post("/face/login")
async def face_login(data: FaceLoginIn, request: Request, response: Response):
    """Public: authenticate by face descriptor + trusted device token."""
    from deps import check_login_lockout, record_login_failure, clear_login_failures, get_client_ip
    login_ip = get_client_ip(request)
    await check_login_lockout('__faceid__', login_ip)

    if len(data.descriptor) != 128:
        raise HTTPException(status_code=400, detail='Invalid face signature')

    tenant_id = get_current_tenant_id()
    docs = await db.user_face_auth.find(
        {'tenant_id': tenant_id, 'descriptors.0': {'$exists': True}}, {'_id': 0}
    ).to_list(1000)

    best, best_dist, second_dist = None, float('inf'), float('inf')
    for doc in docs:
        d = min((_distance(data.descriptor, ref) for ref in doc['descriptors'] if len(ref) == 128),
                default=float('inf'))
        if d < best_dist:
            second_dist, best_dist, best = best_dist, d, doc
        elif d < second_dist:
            second_dist = d

    if not best or best_dist > FACE_MATCH_THRESHOLD or (second_dist - best_dist) < SECOND_BEST_MARGIN:
        await record_login_failure('__faceid__', login_ip)
        raise HTTPException(status_code=401, detail='Face not recognized')

    if not any(verify_password(data.device_token, h) for h in best.get('devices', [])):
        await record_login_failure('__faceid__', login_ip)
        raise HTTPException(status_code=401, detail='This device is not set up for Face ID — sign in with your password first')

    tdb = get_tenant_db()
    user_doc = await tdb.users.find_one({'id': best['user_id']}, {'_id': 0})
    if not user_doc or not user_doc.get('is_active', True):
        raise HTTPException(status_code=401, detail='Account is inactive')

    await clear_login_failures('__faceid__', login_ip)

    session_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        'user_id': user_doc['id'],
        'tenant_id': tenant_id,
        'session_token': session_token,
        'expires_at': expires_at.isoformat(),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'auth_method': 'face_id',
    })
    response.set_cookie(
        key='session_token', value=session_token,
        httponly=True, secure=True, samesite='lax',
        max_age=7 * 24 * 60 * 60, path='/',
    )
    user_doc.pop('password', None)
    return {'user': user_doc, 'session_token': session_token}
