"""Iteration 215 — Verify /api/leads/{id}/proposal* endpoints after extraction
from server.py into routes/lead_proposals.py. Also smoke-test the new modern
brand fonts (Poppins, Montserrat, Lato, Roboto Slab) for PDF generation.
"""
import os
import re
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-10.preview.emergentagent.com").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("session_token") or r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def lead_id(session):
    r = session.get(f"{BASE_URL}/api/leads?limit=20", timeout=20)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    leads = data.get("data") or data.get("leads") or data.get("items") or (data if isinstance(data, list) else [])
    assert leads, f"no leads found: keys={list(data.keys()) if isinstance(data, dict) else type(data)}"
    return leads[0]["id"]


# ── GET /proposal — should not error ────────────────────────────────────────
def test_get_lead_proposal(session, lead_id):
    r = session.get(f"{BASE_URL}/api/leads/{lead_id}/proposal", timeout=20)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert "proposal" in body


# ── GET /proposal/customization — templates, override, company_name ────────
def test_get_customization(session, lead_id):
    r = session.get(f"{BASE_URL}/api/leads/{lead_id}/proposal/customization", timeout=20)
    assert r.status_code == 200, r.text[:400]
    body = r.json()
    for k in ("template", "template_id", "templates", "company_name"):
        assert k in body, f"missing {k} in customization response"
    assert isinstance(body["templates"], list) and len(body["templates"]) >= 1


# ── POST /proposal/preview — returns PDF bytes ─────────────────────────────
def test_preview_pdf(session, lead_id):
    r = session.post(
        f"{BASE_URL}/api/leads/{lead_id}/proposal/preview", json={}, timeout=60
    )
    assert r.status_code == 200, r.text[:400]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:5] == b"%PDF-"


# ── PUT /proposal/customization then DELETE — round-trip ───────────────────
def test_put_then_delete_customization(session, lead_id):
    payload = {"override": {"sections": [], "note": "TEST_iter215"}, "template_id": None}
    r = session.put(
        f"{BASE_URL}/api/leads/{lead_id}/proposal/customization", json=payload, timeout=20
    )
    assert r.status_code == 200, r.text[:300]
    assert r.json().get("has_override") is True

    r2 = session.delete(
        f"{BASE_URL}/api/leads/{lead_id}/proposal/customization", timeout=20
    )
    assert r2.status_code == 200, r2.text[:300]
    assert r2.json().get("ok") is True

    # confirm override cleared
    g = session.get(f"{BASE_URL}/api/leads/{lead_id}/proposal/customization", timeout=20)
    assert g.status_code == 200
    assert not g.json().get("has_override")


# ── POST /proposal/generate — creates new version ──────────────────────────
def test_generate_proposal(session, lead_id):
    # current version (if any)
    g0 = session.get(f"{BASE_URL}/api/leads/{lead_id}/proposal", timeout=20).json().get("proposal")
    v0 = (g0 or {}).get("version", 0)

    r = session.post(f"{BASE_URL}/api/leads/{lead_id}/proposal/generate", timeout=90)
    assert r.status_code == 200, r.text[:400]
    body = r.json()
    assert "proposal" in body and body["proposal"].get("version", 0) > v0
    assert "generated successfully" in body.get("message", "").lower()
    assert body["proposal"].get("content_type") == "application/pdf"


# ── POST /proposal/share-email — non-approved → 400 expected ───────────────
def test_share_email_rejects_non_approved(session, lead_id):
    r = session.post(
        f"{BASE_URL}/api/leads/{lead_id}/proposal/share-email",
        json={"to_emails": ["dev-null@example.com"], "subject": "TEST", "message": "hi"},
        timeout=20,
    )
    # Acceptable: 400 (not approved) OR 500 (resend not configured). Either proves
    # the endpoint is reachable and routed correctly.
    assert r.status_code in (400, 500), r.text[:300]
    if r.status_code == 400:
        assert "approved" in r.text.lower()


# ── Modern fonts: generate after setting Poppins on default template ───────
def _embedded_basefonts(pdf_bytes: bytes):
    return set(re.findall(rb"/BaseFont\s*/([A-Za-z0-9+\-]+)", pdf_bytes))


def _set_font_everywhere(tpl: dict, font_key: str) -> dict:
    """Mutate a template dict so title.font + every section's heading/body font = font_key."""
    if "title" in tpl and isinstance(tpl["title"], dict):
        tpl["title"]["font"] = font_key
    for sec in tpl.get("sections", []) or []:
        if isinstance(sec, dict):
            if "heading_font" in sec or sec.get("heading"):
                sec["heading_font"] = font_key
            if "body_font" in sec or True:
                sec["body_font"] = font_key
    return tpl


@pytest.mark.parametrize("font_key,expect_token", [
    ("poppins", b"Poppins"),
    ("montserrat", b"Montserrat"),
    ("lato", b"Lato"),
    ("robotoslab", b"RobotoSlab"),
])
def test_preview_with_modern_font(session, lead_id, font_key, expect_token):
    """Create a throwaway template with `font_key` applied everywhere, hit
    /proposal/preview with template_id, and assert the modern font is embedded."""
    # 1. Fetch default template to clone from
    r0 = session.get(f"{BASE_URL}/api/proposals/template", timeout=20)
    assert r0.status_code == 200, r0.text[:200]
    default_tpl = r0.json()["template"]

    # 2. Create a new (non-default) template with this font baked in
    create_payload = {"name": f"TEST_{font_key}_iter215"}
    rc = session.post(f"{BASE_URL}/api/proposals/templates", json=create_payload, timeout=20)
    assert rc.status_code == 200, rc.text[:300]
    new_tpl = rc.json()["template"]
    new_id = new_tpl["id"]

    try:
        # 3. PUT the template with font applied to title + every section
        mutated = _set_font_everywhere({**new_tpl}, font_key)
        ru = session.put(
            f"{BASE_URL}/api/proposals/templates/{new_id}",
            json={"template": mutated},
            timeout=20,
        )
        assert ru.status_code == 200, ru.text[:300]

        # 4. Preview with template_id to force PDF generation using that template
        rp = session.post(
            f"{BASE_URL}/api/leads/{lead_id}/proposal/preview",
            json={"template_id": new_id},
            timeout=90,
        )
        assert rp.status_code == 200, rp.text[:300]
        pdf = rp.content
        assert pdf[:5] == b"%PDF-"
        fonts = _embedded_basefonts(pdf)
        has_font = any(expect_token in f for f in fonts)
        assert has_font, f"{font_key} not embedded; saw: {sorted(f.decode() for f in fonts)}"
    finally:
        # 5. Cleanup — delete throwaway template
        session.delete(f"{BASE_URL}/api/proposals/templates/{new_id}", timeout=20)
