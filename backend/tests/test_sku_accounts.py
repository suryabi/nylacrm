"""Tests for SKU Performance accounts drill-down feature."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://design-workflow-hub-11.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'surya.yadavalli@nylaairwater.earth'
ADMIN_PASSWORD = 'test123'


@pytest.fixture(scope='module')
def token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get('session_token') or data.get('token') or data.get('access_token')
    assert tok
    return tok


@pytest.fixture(scope='module')
def headers(token):
    return {'Authorization': f'Bearer {token}'}


def test_sku_performance_accounts_shape(headers):
    r = requests.get(f'{BASE_URL}/api/reports/sku-performance', params={'time_filter': 'all_time'}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert 'skus' in data
    assert 'sku_options' in data
    assert 'summary' in data
    for sku in data['skus']:
        assert 'accounts' in sku, f"missing accounts in {sku.get('name')}"
        assert isinstance(sku['accounts'], list)
        assert len(sku['accounts']) == sku.get('accounts_count', 0), f"len mismatch for {sku.get('name')}"
        # sum of accounts units equals units_sold when there are invoices
        if sku['accounts']:
            total_units = sum(a['units'] for a in sku['accounts'])
            assert total_units == sku.get('units_sold'), f"units mismatch for {sku.get('name')}: {total_units} vs {sku.get('units_sold')}"
            # sorted desc
            units_list = [a['units'] for a in sku['accounts']]
            assert units_list == sorted(units_list, reverse=True)


def test_sku_330ml_gold_expected(headers):
    r = requests.get(f'{BASE_URL}/api/reports/sku-performance', params={'time_filter': 'all_time'}, headers=headers)
    data = r.json()
    target = None
    for sku in data['skus']:
        name = (sku.get('sku') or sku.get('name') or '').lower()
        if '330' in name and 'gold' in name:
            target = sku
            break
    assert target is not None, 'Nyla 330 ml Gold SKU not found'
    assert target['accounts_count'] == 1
    assert len(target['accounts']) == 1
    acc = target['accounts'][0]
    assert 'Toopa' in acc['name']
    assert acc.get('city') == 'Hyderabad'
    assert acc['units'] == 360
    assert acc['invoices'] == 1
    assert abs(acc['revenue'] - 24595.49) < 1.0
    assert acc['units_pct'] == 100


def test_sku_600ml_silver_toopa(headers):
    r = requests.get(f'{BASE_URL}/api/reports/sku-performance', params={'time_filter': 'all_time'}, headers=headers)
    data = r.json()
    target = None
    for sku in data['skus']:
        name = (sku.get('sku') or sku.get('name') or '').lower()
        if '600' in name and 'silver' in name:
            target = sku
            break
    if target is None:
        pytest.skip('600ml Silver SKU not present')
    toopa = next((a for a in target['accounts'] if 'Toopa' in a['name']), None)
    assert toopa is not None
    assert toopa['units'] == 60
    assert toopa['invoices'] == 3


def test_account_id_filter_shrinks_accounts(headers):
    r = requests.get(f'{BASE_URL}/api/reports/sku-performance', params={'time_filter': 'all_time'}, headers=headers)
    data = r.json()
    # find an account uuid from any sku
    account_uuid = None
    for sku in data['skus']:
        for a in sku['accounts']:
            if a.get('account_uuid'):
                account_uuid = a['account_uuid']
                break
        if account_uuid:
            break
    if not account_uuid:
        pytest.skip('no account_uuid available')
    r2 = requests.get(f'{BASE_URL}/api/reports/sku-performance', params={'time_filter': 'all_time', 'account_id': account_uuid}, headers=headers)
    assert r2.status_code == 200
    data2 = r2.json()
    for sku in data2['skus']:
        for a in sku['accounts']:
            # every account listed must be the filtered one (or match by uuid)
            if a.get('account_uuid'):
                assert a['account_uuid'] == account_uuid
