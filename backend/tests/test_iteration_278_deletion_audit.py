"""
Iteration 278 — Deletion Audit for Deliveries

Verifies:
1. DELETE /api/distributors/{distributor_id}/deliveries/{delivery_id} writes a
   deletion_audit record with who/when/what.
2. GET /api/distributors/{distributor_id}/deletion-audit returns records for
   authorised users.
3. GET /api/distributors/deletion-audit/all returns tenant-wide records for
   CEO/Admin.
4. Route ordering: /deletion-audit/all is not shadowed by the distributor
   scoped route.
5. Regression: settled delivery cannot be deleted; normal path returns
   {message}.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fmcg-command-center.preview.emergentagent.com').rstrip('/')
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
TENANT_ID = 'nyla-air-water'

CEO_EMAIL = 'surya.yadavalli@nylaairwater.earth'
CEO_PASSWORD = 'test123'


# --- shared fixtures ---
@pytest.fixture(scope='module')
def ceo_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={'email': CEO_EMAIL, 'password': CEO_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get('session_token') or r.json().get('access_token') or r.json().get('token')
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope='module')
def ceo_headers(ceo_token):
    return {'Authorization': f'Bearer {ceo_token}', 'Content-Type': 'application/json'}


@pytest.fixture(scope='module')
def db_sync():
    """Sync-ish access to db via motor + running loop."""
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope='module')
def a_distributor(ceo_headers):
    """Pick any real distributor in the tenant."""
    r = requests.get(f"{BASE_URL}/api/distributors", headers=ceo_headers, timeout=20)
    assert r.status_code == 200, r.text
    dists = r.json() if isinstance(r.json(), list) else r.json().get('items') or r.json().get('distributors') or []
    assert dists, 'No distributors found in tenant'
    # Prefer a distributor with an id field
    for d in dists:
        if d.get('id'):
            return d
    pytest.skip('No distributor with id available')


@pytest.fixture()
def synthetic_delivery(db_sync, a_distributor):
    """Create a synthetic delivery + 2 items directly in DB; yield ids; ensure cleanup."""
    dist_id = a_distributor['id']
    delivery_id = f"TEST-{uuid.uuid4()}"
    delivery_number = f"TEST-DEL-{uuid.uuid4().hex[:6].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    delivery_doc = {
        'id': delivery_id,
        'tenant_id': TENANT_ID,
        'distributor_id': dist_id,
        'delivery_number': delivery_number,
        'status': 'draft',
        'created_at': now,
        'updated_at': now,
        'account_id': None,
        'created_by': 'test-iteration-278',
        'test_marker': 'iteration_278',
    }
    items = [
        {'id': f"TEST-ITEM-{uuid.uuid4()}", 'tenant_id': TENANT_ID, 'delivery_id': delivery_id,
         'sku_code': 'TEST-SKU-A', 'quantity': 10, 'test_marker': 'iteration_278'},
        {'id': f"TEST-ITEM-{uuid.uuid4()}", 'tenant_id': TENANT_ID, 'delivery_id': delivery_id,
         'sku_code': 'TEST-SKU-B', 'quantity': 5, 'test_marker': 'iteration_278'},
    ]

    async def _seed():
        await db_sync.distributor_deliveries.insert_one(dict(delivery_doc))
        await db_sync.distributor_delivery_items.insert_many([dict(i) for i in items])
    _run(_seed())

    yield {'distributor_id': dist_id, 'delivery_id': delivery_id,
           'delivery_number': delivery_number, 'items': items}

    # cleanup — remove anything we may have left behind
    async def _cleanup():
        await db_sync.distributor_deliveries.delete_many({'id': delivery_id})
        await db_sync.distributor_delivery_items.delete_many({'delivery_id': delivery_id})
        await db_sync.deletion_audit.delete_many({'entity_id': delivery_id})
    _run(_cleanup())


# --- tests ---
class TestDeletionAudit:
    def test_delete_writes_audit_record(self, ceo_headers, synthetic_delivery, db_sync):
        dist_id = synthetic_delivery['distributor_id']
        did = synthetic_delivery['delivery_id']

        # DELETE
        r = requests.delete(
            f"{BASE_URL}/api/distributors/{dist_id}/deliveries/{did}",
            headers=ceo_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert 'message' in body

        async def _verify():
            # delivery and items gone
            gone = await db_sync.distributor_deliveries.find_one({'id': did})
            assert gone is None
            items_left = await db_sync.distributor_delivery_items.count_documents({'delivery_id': did})
            assert items_left == 0
            # audit record present with correct fields
            audits = await db_sync.deletion_audit.find({'entity_id': did}).to_list(10)
            return audits
        audits = _run(_verify())

        assert len(audits) == 1, f"Expected exactly one audit record, got {len(audits)}"
        rec = audits[0]
        assert rec['tenant_id'] == TENANT_ID
        assert rec['entity_type'] == 'delivery'
        assert rec['entity_id'] == did
        assert rec['distributor_id'] == dist_id
        assert rec['entity_number'] == synthetic_delivery['delivery_number']
        assert rec['status_at_deletion'] == 'draft'
        assert rec['deleted_by_email'] == CEO_EMAIL
        assert rec['deleted_by_role'] in ('CEO', 'ceo')
        assert rec.get('deleted_at')  # non-null ISO
        assert rec.get('deleted_by')
        assert rec.get('deleted_by_name')
        # snapshot fields
        assert isinstance(rec.get('snapshot'), dict)
        assert rec['snapshot'].get('delivery_number') == synthetic_delivery['delivery_number']
        assert '_id' not in rec['snapshot']
        # item snapshot
        assert rec.get('item_count') == 2
        assert isinstance(rec.get('items_snapshot'), list)
        assert len(rec['items_snapshot']) == 2
        for isnap in rec['items_snapshot']:
            assert '_id' not in isnap

    def test_distributor_scoped_endpoint_returns_new_record(self, ceo_headers, synthetic_delivery, db_sync):
        """Second synthetic delete then read via the per-distributor endpoint."""
        dist_id = synthetic_delivery['distributor_id']
        did = synthetic_delivery['delivery_id']

        # Delete
        r = requests.delete(
            f"{BASE_URL}/api/distributors/{dist_id}/deliveries/{did}",
            headers=ceo_headers, timeout=30,
        )
        assert r.status_code == 200, r.text

        # Read audit via distributor-scoped endpoint
        r2 = requests.get(
            f"{BASE_URL}/api/distributors/{dist_id}/deletion-audit",
            headers=ceo_headers, params={'entity_type': 'delivery'}, timeout=20,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert 'total' in body and 'records' in body
        assert isinstance(body['records'], list)
        # Sorted desc by deleted_at
        if len(body['records']) >= 2:
            ts = [rec.get('deleted_at') for rec in body['records'] if rec.get('deleted_at')]
            assert ts == sorted(ts, reverse=True)
        # Our record is present
        ids = [rec.get('entity_id') for rec in body['records']]
        assert did in ids

    def test_global_endpoint_ceo_access_and_route_resolution(self, ceo_headers, synthetic_delivery):
        """/deletion-audit/all must return the global shape (not be shadowed)."""
        dist_id = synthetic_delivery['distributor_id']
        did = synthetic_delivery['delivery_id']

        # delete
        r = requests.delete(
            f"{BASE_URL}/api/distributors/{dist_id}/deliveries/{did}",
            headers=ceo_headers, timeout=30,
        )
        assert r.status_code == 200, r.text

        # global endpoint
        r2 = requests.get(
            f"{BASE_URL}/api/distributors/deletion-audit/all",
            headers=ceo_headers, params={'entity_type': 'delivery'}, timeout=20,
        )
        assert r2.status_code == 200, f"Global endpoint should not be shadowed; got {r2.status_code}: {r2.text}"
        body = r2.json()
        assert 'total' in body and 'records' in body
        assert isinstance(body['records'], list)
        # our just-deleted record should be there
        found = [rec for rec in body['records'] if rec.get('entity_id') == did]
        assert found, f"Global audit missing entity_id={did}"
        # tenant scoped
        for rec in body['records']:
            assert rec.get('tenant_id') == TENANT_ID
        # sorted desc
        ts = [rec.get('deleted_at') for rec in body['records'] if rec.get('deleted_at')]
        assert ts == sorted(ts, reverse=True)

    def test_global_endpoint_role_check_exists(self, ceo_headers):
        """Confirm role gate: CEO ok. Try distributor user as low-priv (403 expected)."""
        # CEO ok (already tested); Now attempt as distributor user if credentials available.
        # Login as distributor user
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={'email': 'john.distributor@test.com', 'password': 'nyladist##'},
                          timeout=20)
        if r.status_code != 200:
            pytest.skip(f"low-priv account not available (login {r.status_code})")
        tok = r.json().get('session_token') or r.json().get('access_token') or r.json().get('token')
        if not tok:
            pytest.skip("low-priv token missing")
        low = {'Authorization': f'Bearer {tok}'}
        r2 = requests.get(f"{BASE_URL}/api/distributors/deletion-audit/all",
                          headers=low, timeout=20)
        # Must be 403 with the role-check message (not 200)
        assert r2.status_code == 403, f"Expected 403 for non-CEO/Admin, got {r2.status_code}: {r2.text[:200]}"
        detail = ''
        try:
            detail = r2.json().get('detail', '')
        except Exception:
            pass
        assert 'CEO' in detail or 'Admin' in detail

    def test_settled_delivery_cannot_be_deleted(self, ceo_headers, db_sync, a_distributor):
        """Regression: settled deliveries are blocked even for CEO/Admin."""
        dist_id = a_distributor['id']
        did = f"TEST-SETTLED-{uuid.uuid4()}"
        delivery_doc = {
            'id': did,
            'tenant_id': TENANT_ID,
            'distributor_id': dist_id,
            'delivery_number': f"TEST-SET-{uuid.uuid4().hex[:6].upper()}",
            'status': 'delivered',
            'settlement_id': f"TEST-STL-{uuid.uuid4()}",
            'test_marker': 'iteration_278',
        }

        async def _seed():
            await db_sync.distributor_deliveries.insert_one(dict(delivery_doc))
        _run(_seed())

        try:
            r = requests.delete(
                f"{BASE_URL}/api/distributors/{dist_id}/deliveries/{did}",
                headers=ceo_headers, timeout=30,
            )
            assert r.status_code == 400, r.text
            assert 'settlement' in (r.json().get('detail') or '').lower()
            # And no audit row was created for it
            async def _check():
                return await db_sync.deletion_audit.count_documents({'entity_id': did})
            n = _run(_check())
            assert n == 0
        finally:
            async def _clean():
                await db_sync.distributor_deliveries.delete_many({'id': did})
                await db_sync.deletion_audit.delete_many({'entity_id': did})
            _run(_clean())

    def test_cleanup_test_audit_rows(self, db_sync):
        """Housekeeping — remove any TEST-* audit rows this suite may have left."""
        async def _clean():
            res = await db_sync.deletion_audit.delete_many(
                {'tenant_id': TENANT_ID, 'entity_id': {'$regex': '^TEST-'}}
            )
            return res.deleted_count
        n = _run(_clean())
        # Not an assert-fail if 0; just informational
        assert n >= 0
