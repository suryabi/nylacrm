"""Iteration 213 — Rich-text editors in proposal template + customize dialog.

Validates the backend conversion of Quill HTML into ReportLab markup:
  - PUT template with rich HTML for paragraph 'content', list 'intro',
    category 'intro', pricing 'disclaimer' persists round-trip (HTML tags
    preserved on subsequent GET).
  - POST /preview returns a valid application/pdf (%PDF-) when sections
    contain bold/italic/color/bulleted lists.
  - BACKWARD COMPATIBILITY: plain text including '&' (e.g. 'Soda & Tonic')
    still generates a valid PDF.
  - Empty editor ('<p><br></p>') is treated as empty (still 200 + %PDF-).
  - Per-lead override carrying rich HTML on /preview returns 200 + %PDF-.

Cleanup restores the global default template to its captured original
content and clears the per-lead override.
"""
import os
import uuid as _uuid

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL',
                          'https://stock-state-machine.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'surya.yadavalli@nylaairwater.earth'
ADMIN_PASSWORD = 'test123'
TEST_LEAD_ID = '08c93122-99fc-4587-b31c-559649f29c17'


# ── session / cleanup ────────────────────────────────────────────────────────
@pytest.fixture(scope='module')
def session():
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login',
               json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text}'
    data = r.json()
    token = data.get('session_token') or data.get('token')
    assert token
    s.headers.update({'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='module')
def default_template(session):
    r = session.get(f'{BASE_URL}/api/proposals/templates', timeout=20)
    assert r.status_code == 200
    meta = next((t for t in r.json()['templates'] if t['is_default']), None)
    assert meta, 'no default template'
    r2 = session.get(f"{BASE_URL}/api/proposals/templates/{meta['id']}", timeout=20)
    assert r2.status_code == 200
    return r2.json()['template']


@pytest.fixture(scope='module', autouse=True)
def cleanup(session, default_template):
    yield
    # Restore default template content
    content = {k: default_template.get(k) for k in
               ('company', 'title', 'colors', 'header', 'footer', 'sections')}
    content['name'] = default_template.get('name')
    session.put(f"{BASE_URL}/api/proposals/templates/{default_template['id']}",
                json={'template': content}, timeout=20)
    # Clear lead override
    session.delete(f'{BASE_URL}/api/leads/{TEST_LEAD_ID}/proposal/customization', timeout=20)


# ── Helpers ──────────────────────────────────────────────────────────────────
def _build_rich_sections(orig_sections):
    """Return a deep copy of sections with rich HTML injected into the
    appropriate prose fields. Structured fields (items, allowed, not_allowed)
    are left as-is.
    """
    import copy
    secs = copy.deepcopy(orig_sections)
    tag = _uuid.uuid4().hex[:6]
    for s in secs:
        t = s.get('type')
        if t == 'paragraph':
            s['content'] = (f'<p><strong>Bold {tag}</strong> and <em>italic</em> '
                            f'plus <u>underline</u>.</p><ul><li>one</li><li>two</li></ul>')
        elif t == 'list':
            s['intro'] = f'<p><strong>Intro {tag}</strong> with <em>style</em>.</p>'
        elif t == 'category':
            s['intro'] = f'<p>Categories <strong>{tag}</strong>:</p>'
        elif t == 'pricing_table':
            s['disclaimer'] = (f'<p><em>Disclaimer {tag}</em>: '
                               f'<span style="color: rgb(234,44,31);">GST extra</span>.</p>')
    return secs


# ── 1. Persistence round-trip ────────────────────────────────────────────────
class TestRichPersistence:
    def test_put_get_preserves_html_tags(self, session, default_template):
        tid = default_template['id']
        new_secs = _build_rich_sections(default_template['sections'])
        r = session.put(f'{BASE_URL}/api/proposals/templates/{tid}',
                        json={'template': {'sections': new_secs}}, timeout=20)
        assert r.status_code == 200, r.text

        r2 = session.get(f'{BASE_URL}/api/proposals/templates/{tid}', timeout=20)
        assert r2.status_code == 200
        secs = r2.json()['template']['sections']

        para = next(s for s in secs if s.get('type') == 'paragraph')
        assert '<strong>' in para['content'] and '<em>' in para['content']
        assert '<ul>' in para['content'] and '<li>' in para['content']

        lst = next(s for s in secs if s.get('type') == 'list')
        assert '<strong>' in (lst.get('intro') or '')

        cat = next((s for s in secs if s.get('type') == 'category'), None)
        if cat is not None:
            assert '<strong>' in (cat.get('intro') or '')

        pr = next(s for s in secs if s.get('type') == 'pricing_table')
        assert '<em>' in (pr.get('disclaimer') or '')


# ── 2. PDF generation with rich text ─────────────────────────────────────────
class TestRichPDF:
    def test_preview_rich_returns_pdf(self, session):
        # Default template now carries rich HTML (set by previous test class)
        r = session.post(f'{BASE_URL}/api/leads/{TEST_LEAD_ID}/proposal/preview',
                         json={}, timeout=45)
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get('content-type', '').startswith('application/pdf')
        assert r.content[:5] == b'%PDF-', f'not pdf: {r.content[:20]!r}'
        assert len(r.content) > 2048

    def test_generate_rich_returns_pdf(self, session):
        r = session.post(f'{BASE_URL}/api/leads/{TEST_LEAD_ID}/proposal/generate', timeout=60)
        assert r.status_code == 200, r.text[:300]
        ctype = r.headers.get('content-type', '')
        # generate may return JSON metadata or the PDF blob — both acceptable as 200
        if ctype.startswith('application/pdf'):
            assert r.content[:5] == b'%PDF-'
        else:
            # JSON: a stored proposal record
            body = r.json()
            assert body  # non-empty


# ── 3. Backward compatibility: plain text + '&' ──────────────────────────────
class TestBackwardCompatPlainText:
    def test_plain_text_with_ampersand_generates_pdf(self, session, default_template):
        import copy
        tid = default_template['id']
        secs = copy.deepcopy(default_template['sections'])
        # Inject PLAIN TEXT (no HTML) containing '&', '<', '>'
        for s in secs:
            t = s.get('type')
            if t == 'paragraph':
                s['content'] = 'Soda & Tonic with <angle> brackets and "quotes".'
            elif t == 'list':
                s['intro'] = 'Items below — Soda & Tonic:'
            elif t == 'category':
                s['intro'] = 'Allowed sections & lounges:'
            elif t == 'pricing_table':
                s['disclaimer'] = 'GST 5% & logistics extra.'

        r = session.put(f'{BASE_URL}/api/proposals/templates/{tid}',
                        json={'template': {'sections': secs}}, timeout=20)
        assert r.status_code == 200

        r2 = session.post(f'{BASE_URL}/api/leads/{TEST_LEAD_ID}/proposal/preview',
                          json={}, timeout=45)
        assert r2.status_code == 200, r2.text[:300]
        assert r2.content[:5] == b'%PDF-'
        assert len(r2.content) > 2048

    def test_empty_quill_value_handled(self, session, default_template):
        import copy
        tid = default_template['id']
        secs = copy.deepcopy(default_template['sections'])
        for s in secs:
            t = s.get('type')
            if t == 'paragraph':
                s['content'] = '<p><br></p>'  # Quill empty
            elif t == 'list':
                s['intro'] = ''
            elif t == 'category':
                s['intro'] = '<p><br></p>'
            elif t == 'pricing_table':
                s['disclaimer'] = '<p><br></p>'

        r = session.put(f'{BASE_URL}/api/proposals/templates/{tid}',
                        json={'template': {'sections': secs}}, timeout=20)
        assert r.status_code == 200

        r2 = session.post(f'{BASE_URL}/api/leads/{TEST_LEAD_ID}/proposal/preview',
                          json={}, timeout=45)
        assert r2.status_code == 200
        assert r2.content[:5] == b'%PDF-'


# ── 4. Per-lead rich override on preview ─────────────────────────────────────
class TestPerLeadRichOverride:
    def test_preview_with_rich_override(self, session, default_template):
        import copy
        secs = copy.deepcopy(default_template['sections'])
        # All-rich override
        rich = _build_rich_sections(secs)
        override = {'sections': rich,
                    'title': {'text_template': 'Custom <strong>not-evaluated</strong> {company}'}}
        r = session.post(f'{BASE_URL}/api/leads/{TEST_LEAD_ID}/proposal/preview',
                         json={'override': override}, timeout=45)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:5] == b'%PDF-'
        assert len(r.content) > 2048
