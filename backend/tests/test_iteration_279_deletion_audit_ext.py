"""Iteration 279 — Deletion Audit extended (Shipment DELETE, Invoice VOID) + Delivery RESTORE.

Covers:
1. Shipment delete audit trail (entity_type='shipment').
2. Invoice void audit trail (entity_type='invoice_void'). Uses a synthetic invoice
   WITHOUT a zoho_invoice_id so services.zoho_service.void_invoice short-circuits
   (returns True) with NO live Zoho call — equivalent to a monkeypatched no-op.
3. Delivery delete → restore round-trip via POST /{did}/deletion-audit/{aid}/restore.
4. Restore guards: double-restore, non-delivery entity, non-CEO 403, bogus id 404,
   already-exists 400.
5. Regression: iteration_278 GETs still work; invoice void guards intact.
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
load_dotenv('/app/frontend/.env')

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
TENANT_ID = 'nyla-air-water'
CEO_EMAIL = 'surya.yadavalli@nylaairwater.earth'
CEO_PASSWORD = 'test123'
LOW_EMAIL = 'john.distributor@test.com'
LOW_PASSWORD = 'nyladist##'


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError('closed loop')
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@pytest.fixture(scope='module')
def ceo_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={'email': CEO_EMAIL, 'password': CEO_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get('session_token') or r.json().get('access_token') or r.json().get('token')
    assert tok, r.json()
    return {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}


@pytest.fixture(scope='module')
def low_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={'email': LOW_EMAIL, 'password': LOW_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"low-priv login failed {r.status_code}")
    tok = r.json().get('session_token') or r.json().get('access_token') or r.json().get('token')
    if not tok:
        pytest.skip("low-priv token missing")
    return {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}


@pytest.fixture(scope='module')
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope='module')
def a_distributor(ceo_headers):
    r = requests.get(f"{BASE_URL}/api/distributors", headers=ceo_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    dists = data if isinstance(data, list) else data.get('items') or data.get('distributors') or []
    for d in dists:
        if d.get('id'):
            return d
    pytest.skip('No distributor with id available')


# ----------------------------------------------------------------------
# 1. SHIPMENT delete audit
# ----------------------------------------------------------------------
class TestShipmentDeleteAudit:
    def test_shipment_delete_writes_audit(self, ceo_headers, db, a_distributor):
        dist_id = a_distributor['id']
        ship_id = f"TEST-SHIP-{uuid.uuid4()}"
        ship_no = f"TEST-SN-{uuid.uuid4().hex[:6].upper()}"
        now = datetime.now(timezone.utc).isoformat()
        ship_doc = {
            'id': ship_id, 'tenant_id': TENANT_ID, 'distributor_id': dist_id,
            'shipment_number': ship_no, 'status': 'draft',
            'created_at': now, 'updated_at': now, 'test_marker': 'iteration_279',
        }
        items = [
            {'id': f"TEST-SI-{uuid.uuid4()}", 'tenant_id': TENANT_ID, 'shipment_id': ship_id,
             'sku_code': 'TEST-SKU-A', 'quantity': 10, 'test_marker': 'iteration_279'},
            {'id': f"TEST-SI-{uuid.uuid4()}", 'tenant_id': TENANT_ID, 'shipment_id': ship_id,
             'sku_code': 'TEST-SKU-B', 'quantity': 5, 'test_marker': 'iteration_279'},
        ]

        async def _seed():
            await db.distributor_shipments.insert_one(dict(ship_doc))
            await db.distributor_shipment_items.insert_many([dict(i) for i in items])
        _run(_seed())

        try:
            r = requests.delete(
                f"{BASE_URL}/api/distributors/{dist_id}/shipments/{ship_id}",
                headers=ceo_headers, timeout=30,
            )
            assert r.status_code == 200, r.text

            async def _verify():
                gone = await db.distributor_shipments.find_one({'id': ship_id})
                items_left = await db.distributor_shipment_items.count_documents({'shipment_id': ship_id})
                audits = await db.deletion_audit.find({'entity_id': ship_id}).to_list(10)
                return gone, items_left, audits
            gone, items_left, audits = _run(_verify())
            assert gone is None
            assert items_left == 0
            assert len(audits) == 1, f"expected 1 audit row, got {len(audits)}"
            rec = audits[0]
            assert rec['entity_type'] == 'shipment'
            assert rec['tenant_id'] == TENANT_ID
            assert rec['entity_number'] == ship_no
            assert rec['distributor_id'] == dist_id
            assert rec['deleted_by_email'] == CEO_EMAIL
            assert rec.get('deleted_at')
            assert rec.get('item_count') == 2
            assert isinstance(rec.get('items_snapshot'), list) and len(rec['items_snapshot']) == 2
            for isnap in rec['items_snapshot']:
                assert '_id' not in isnap
            assert '_id' not in (rec.get('snapshot') or {})

            # per-distributor GET filtered by entity_type=shipment
            r2 = requests.get(
                f"{BASE_URL}/api/distributors/{dist_id}/deletion-audit",
                headers=ceo_headers, params={'entity_type': 'shipment'}, timeout=20,
            )
            assert r2.status_code == 200, r2.text
            body = r2.json()
            assert 'total' in body and 'records' in body
            ids = [x.get('entity_id') for x in body['records']]
            assert ship_id in ids
            for x in body['records']:
                assert x['entity_type'] == 'shipment'
        finally:
            async def _clean():
                await db.distributor_shipments.delete_many({'id': ship_id})
                await db.distributor_shipment_items.delete_many({'shipment_id': ship_id})
                await db.deletion_audit.delete_many({'entity_id': ship_id})
            _run(_clean())


# ----------------------------------------------------------------------
# 2. INVOICE VOID audit — NO live Zoho call (empty zoho_invoice_id → service short-circuits)
# ----------------------------------------------------------------------
class TestInvoiceVoidAudit:
    def test_void_writes_audit(self, ceo_headers, db):
        inv_id = f"TEST-INV-{uuid.uuid4()}"
        inv_no = f"TEST-INVNO-{uuid.uuid4().hex[:6].upper()}"
        acct_uuid = f"TEST-ACCT-{uuid.uuid4()}"
        now = datetime.now(timezone.utc).isoformat()
        inv_doc = {
            'id': inv_id, 'tenant_id': TENANT_ID,
            'invoice_no': inv_no,
            'status': 'matched',
            'zoho_invoice_id': '',   # empty → services.zoho_service.void_invoice returns True immediately (equivalent to no-op)
            'account_uuid': acct_uuid,
            'gross_invoice_value': 0,
            'net_invoice_value': 0,
            'outstanding_counted': False,
            'created_at': now, 'updated_at': now,
            'test_marker': 'iteration_279',
        }

        async def _seed():
            await db.invoices.insert_one(dict(inv_doc))
        _run(_seed())

        try:
            # Wrong confirmation → 400
            r_bad = requests.post(
                f"{BASE_URL}/api/invoices/{inv_id}/void",
                headers=ceo_headers, json={'confirmation': 'NOPE'}, timeout=30,
            )
            assert r_bad.status_code == 400, r_bad.text
            assert 'VOID' in (r_bad.json().get('detail') or '')

            # Bad id → 404
            r_404 = requests.post(
                f"{BASE_URL}/api/invoices/TEST-DOES-NOT-EXIST/void",
                headers=ceo_headers, json={'confirmation': 'VOID'}, timeout=30,
            )
            assert r_404.status_code == 404, r_404.text

            # Real void
            r = requests.post(
                f"{BASE_URL}/api/invoices/{inv_id}/void",
                headers=ceo_headers, json={'confirmation': 'VOID', 'reason': 'iter279 test'},
                timeout=30,
            )
            assert r.status_code == 200, r.text

            async def _verify():
                gone = await db.invoices.find_one({'id': inv_id})
                audits = await db.deletion_audit.find({'entity_id': inv_id}).to_list(10)
                return gone, audits
            gone, audits = _run(_verify())
            assert gone is None, "invoice should be deleted after void"
            assert len(audits) == 1, f"expected 1 audit row, got {len(audits)}"
            rec = audits[0]
            assert rec['entity_type'] == 'invoice_void'
            assert rec['entity_number'] == inv_no
            assert rec['deleted_by_email'] == CEO_EMAIL
            assert rec.get('deleted_at')
            assert 'zoho_voided' in rec
            assert rec['zoho_voided'] is False  # zoho_invoice_id was empty
            assert '_id' not in (rec.get('snapshot') or {})

            # Appears in global endpoint filtered by entity_type=invoice_void
            r2 = requests.get(
                f"{BASE_URL}/api/distributors/deletion-audit/all",
                headers=ceo_headers, params={'entity_type': 'invoice_void'}, timeout=20,
            )
            assert r2.status_code == 200, r2.text
            body = r2.json()
            assert 'records' in body
            ids = [x.get('entity_id') for x in body['records']]
            assert inv_id in ids
            for x in body['records']:
                assert x['entity_type'] == 'invoice_void'
        finally:
            async def _clean():
                await db.invoices.delete_many({'id': inv_id})
                await db.deletion_audit.delete_many({'entity_id': inv_id})
            _run(_clean())


# ----------------------------------------------------------------------
# Helpers to create/delete synthetic delivery for restore tests
# ----------------------------------------------------------------------
def _seed_delivery(db, dist_id):
    del_id = f"TEST-DEL-{uuid.uuid4()}"
    del_no = f"TEST-DELNO-{uuid.uuid4().hex[:6].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    delivery_doc = {
        'id': del_id, 'tenant_id': TENANT_ID, 'distributor_id': dist_id,
        'delivery_number': del_no, 'status': 'draft',
        'created_at': now, 'updated_at': now, 'test_marker': 'iteration_279',
    }
    items = [
        {'id': f"TEST-DI-{uuid.uuid4()}", 'tenant_id': TENANT_ID, 'delivery_id': del_id,
         'sku_code': 'TEST-SKU-A', 'quantity': 10, 'test_marker': 'iteration_279'},
        {'id': f"TEST-DI-{uuid.uuid4()}", 'tenant_id': TENANT_ID, 'delivery_id': del_id,
         'sku_code': 'TEST-SKU-B', 'quantity': 5, 'test_marker': 'iteration_279'},
    ]

    async def _seed():
        await db.distributor_deliveries.insert_one(dict(delivery_doc))
        await db.distributor_delivery_items.insert_many([dict(i) for i in items])
    _run(_seed())
    return del_id, del_no, items


def _cleanup_delivery(db, del_id):
    async def _c():
        await db.distributor_deliveries.delete_many({'id': del_id})
        await db.distributor_delivery_items.delete_many({'delivery_id': del_id})
        await db.deletion_audit.delete_many({'entity_id': del_id})
    _run(_c())


# ----------------------------------------------------------------------
# 3. DELETE → RESTORE round trip for delivery
# ----------------------------------------------------------------------
class TestDeliveryRestoreRoundTrip:
    def test_delete_then_restore(self, ceo_headers, db, a_distributor):
        dist_id = a_distributor['id']
        del_id, del_no, items = _seed_delivery(db, dist_id)
        try:
            # DELETE
            r = requests.delete(
                f"{BASE_URL}/api/distributors/{dist_id}/deliveries/{del_id}",
                headers=ceo_headers, timeout=30,
            )
            assert r.status_code == 200, r.text

            async def _get_audit():
                return await db.deletion_audit.find_one({'entity_id': del_id, 'entity_type': 'delivery'})
            audit = _run(_get_audit())
            assert audit, "no delivery audit found"
            audit_id = audit['id']

            # RESTORE
            r2 = requests.post(
                f"{BASE_URL}/api/distributors/{dist_id}/deletion-audit/{audit_id}/restore",
                headers=ceo_headers, timeout=30,
            )
            assert r2.status_code == 200, r2.text
            body = r2.json()
            assert body.get('success') is True
            assert body.get('delivery_id') == del_id

            # Verify restored delivery + items + audit-mark
            async def _verify():
                dl = await db.distributor_deliveries.find_one({'id': del_id})
                its = await db.distributor_delivery_items.find({'delivery_id': del_id}).to_list(10)
                aud = await db.deletion_audit.find_one({'id': audit_id})
                return dl, its, aud
            dl, its, aud = _run(_verify())
            assert dl is not None
            assert dl.get('delivery_number') == del_no
            assert dl.get('restored_at')
            assert dl.get('restored_by') == CEO_EMAIL
            assert len(its) == 2
            assert aud.get('restored_at')
            assert aud.get('restored_by') == CEO_EMAIL

            # Guard (a): double restore of same audit_id → 400 already been restored
            r3 = requests.post(
                f"{BASE_URL}/api/distributors/{dist_id}/deletion-audit/{audit_id}/restore",
                headers=ceo_headers, timeout=30,
            )
            assert r3.status_code == 400, r3.text
            assert 'already' in (r3.json().get('detail') or '').lower()

            # Guard (e): delete once again, restore attempt should now fail because
            # a delivery with the snapshot id already exists  → simulate by writing a
            # NEW audit row referencing the same id (delivery is present), then restoring it.
            fake_audit_id = str(uuid.uuid4())
            async def _mkfake():
                await db.deletion_audit.insert_one({
                    'id': fake_audit_id, 'tenant_id': TENANT_ID, 'entity_type': 'delivery',
                    'entity_id': del_id, 'distributor_id': dist_id,
                    'snapshot': {'id': del_id, 'delivery_number': del_no},
                    'items_snapshot': [], 'deleted_at': datetime.now(timezone.utc).isoformat(),
                    'test_marker': 'iteration_279',
                })
            _run(_mkfake())
            r_exists = requests.post(
                f"{BASE_URL}/api/distributors/{dist_id}/deletion-audit/{fake_audit_id}/restore",
                headers=ceo_headers, timeout=30,
            )
            assert r_exists.status_code == 400, r_exists.text
            assert 'already exists' in (r_exists.json().get('detail') or '').lower()
            async def _rmfake():
                await db.deletion_audit.delete_many({'id': fake_audit_id})
            _run(_rmfake())
        finally:
            _cleanup_delivery(db, del_id)


# ----------------------------------------------------------------------
# 4. Restore GUARDS (non-delivery, non-CEO, bogus id)
# ----------------------------------------------------------------------
class TestRestoreGuards:
    def test_restore_of_non_delivery_audit_400(self, ceo_headers, db, a_distributor):
        """Restoring a shipment or invoice_void audit row must 400."""
        dist_id = a_distributor['id']
        # Insert a fake shipment audit row
        aid = str(uuid.uuid4())
        async def _seed():
            await db.deletion_audit.insert_one({
                'id': aid, 'tenant_id': TENANT_ID, 'entity_type': 'shipment',
                'entity_id': f"TEST-SHIP-{uuid.uuid4()}", 'distributor_id': dist_id,
                'snapshot': {'id': f"TEST-SHIP-x"},
                'deleted_at': datetime.now(timezone.utc).isoformat(),
                'test_marker': 'iteration_279',
            })
        _run(_seed())
        try:
            r = requests.post(
                f"{BASE_URL}/api/distributors/{dist_id}/deletion-audit/{aid}/restore",
                headers=ceo_headers, timeout=30,
            )
            assert r.status_code == 400, r.text
            assert 'only deleted deliveries' in (r.json().get('detail') or '').lower()
        finally:
            async def _c():
                await db.deletion_audit.delete_many({'id': aid})
            _run(_c())

    def test_restore_bogus_id_returns_404(self, ceo_headers, a_distributor):
        dist_id = a_distributor['id']
        r = requests.post(
            f"{BASE_URL}/api/distributors/{dist_id}/deletion-audit/DOES-NOT-EXIST-{uuid.uuid4()}/restore",
            headers=ceo_headers, timeout=30,
        )
        assert r.status_code == 404, r.text

    def test_restore_by_non_ceo_returns_403(self, low_headers, ceo_headers, db, a_distributor):
        """Distributor user should get 403 attempting restore."""
        dist_id = a_distributor['id']
        del_id, del_no, _ = _seed_delivery(db, dist_id)
        try:
            # delete as CEO to produce an audit row
            r_del = requests.delete(
                f"{BASE_URL}/api/distributors/{dist_id}/deliveries/{del_id}",
                headers=ceo_headers, timeout=30,
            )
            assert r_del.status_code == 200, r_del.text
            async def _get():
                return await db.deletion_audit.find_one({'entity_id': del_id})
            aud = _run(_get())
            assert aud
            # attempt restore as low-priv user
            r = requests.post(
                f"{BASE_URL}/api/distributors/{dist_id}/deletion-audit/{aud['id']}/restore",
                headers=low_headers, timeout=30,
            )
            assert r.status_code == 403, r.text
            detail = (r.json().get('detail') or '').lower()
            assert 'ceo' in detail or 'admin' in detail
        finally:
            _cleanup_delivery(db, del_id)


# ----------------------------------------------------------------------
# 5. Regression — iteration_278 endpoints still work
# ----------------------------------------------------------------------
class TestRegression:
    def test_global_and_scoped_deletion_audit_still_work(self, ceo_headers, a_distributor):
        dist_id = a_distributor['id']
        r1 = requests.get(f"{BASE_URL}/api/distributors/deletion-audit/all",
                          headers=ceo_headers, timeout=20)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert 'total' in b1 and 'records' in b1
        assert isinstance(b1['records'], list)

        r2 = requests.get(f"{BASE_URL}/api/distributors/{dist_id}/deletion-audit",
                          headers=ceo_headers, timeout=20)
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        assert 'total' in b2 and 'records' in b2


# Housekeeping
class TestHousekeeping:
    def test_purge_leftover_test_rows(self, db):
        async def _c():
            n1 = (await db.deletion_audit.delete_many({'tenant_id': TENANT_ID, 'entity_id': {'$regex': '^TEST-'}})).deleted_count
            n2 = (await db.distributor_shipments.delete_many({'test_marker': 'iteration_279'})).deleted_count
            n3 = (await db.distributor_shipment_items.delete_many({'test_marker': 'iteration_279'})).deleted_count
            n4 = (await db.distributor_deliveries.delete_many({'test_marker': 'iteration_279'})).deleted_count
            n5 = (await db.distributor_delivery_items.delete_many({'test_marker': 'iteration_279'})).deleted_count
            n6 = (await db.invoices.delete_many({'test_marker': 'iteration_279'})).deleted_count
            return n1 + n2 + n3 + n4 + n5 + n6
        _run(_c())
