"""Iteration 211: Global Proposal Template — Header/Footer + section spacing.

Endpoints under test:
  GET  /api/proposals/template         (returns header/footer + per-section spacing)
  PUT  /api/proposals/template         (saves header/footer + spacing)
  POST /api/leads/{lead_id}/proposal/preview     (PDF — two-pass when {total} used)
  POST /api/leads/{lead_id}/proposal/generate    (PDF persistence with header/footer)

Restores the global template to defaults at the end via the `defaults` object,
and clears any per-lead override on the test lead.
"""
import os
import copy
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://accounting-inbox.preview.emergentagent.com",
).rstrip("/")
LEAD_ID = "08c93122-99fc-4587-b31c-559649f29c17"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


# ── shared session fixture ────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("session_token") or data.get("token")
    assert token, f"No session_token in login response: {data}"
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def defaults_snapshot(client):
    """Snapshot the `defaults` object returned by GET so we can restore it later."""
    r = client.get(f"{BASE_URL}/api/proposals/template", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("defaults") or j.get("template")


@pytest.fixture(scope="module", autouse=True)
def _cleanup(client, defaults_snapshot):
    # Pre-clean any per-lead override
    client.delete(f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/customization", timeout=30)
    yield
    # Restore global template to defaults
    if defaults_snapshot:
        client.put(
            f"{BASE_URL}/api/proposals/template",
            json={"template": defaults_snapshot},
            timeout=30,
        )
    # Clear lead override
    client.delete(f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/customization", timeout=30)


# ── GET returns header/footer + spacing fields ───────────────────────────────
class TestGetTemplateShape:
    def test_get_returns_header_footer_and_spacing(self, client):
        r = client.get(f"{BASE_URL}/api/proposals/template", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "template" in body and "defaults" in body
        tpl = body["template"]
        # Header
        hdr = tpl.get("header")
        assert isinstance(hdr, dict), "template.header missing"
        assert "enabled" in hdr
        for z in ("left", "center", "right"):
            assert z in hdr and isinstance(hdr[z], dict)
            assert "type" in hdr[z] and "text" in hdr[z]
        # Footer
        ftr = tpl.get("footer")
        assert isinstance(ftr, dict), "template.footer missing"
        assert "enabled" in ftr
        for z in ("left", "center", "right"):
            assert z in ftr and isinstance(ftr[z], dict)
            assert "type" in ftr[z] and "text" in ftr[z]
        # Section spacing
        secs = tpl.get("sections") or []
        assert len(secs) > 0
        for sec in secs:
            assert "space_before" in sec, f"section {sec.get('id')} missing space_before"
            assert "space_after" in sec, f"section {sec.get('id')} missing space_after"
            assert "line_spacing" in sec, f"section {sec.get('id')} missing line_spacing"


# ── PUT custom header/footer + spacing → round-trip via GET ──────────────────
class TestPutHeaderFooterRoundTrip:
    def test_put_then_get_reflects_header_footer_and_spacing(self, client):
        # Start from current template
        r = client.get(f"{BASE_URL}/api/proposals/template", timeout=30)
        tpl = copy.deepcopy(r.json()["template"])

        tpl["header"] = {
            "enabled": True,
            "left":   {"type": "logo", "text": ""},
            "center": {"type": "company_name", "text": ""},
            "right":  {"type": "date", "text": ""},
        }
        tpl["footer"] = {
            "enabled": True,
            "left":   {"type": "custom", "text": "Confidential — {company}"},
            "center": {"type": "none", "text": ""},
            "right":  {"type": "page", "text": "Page {n} of {total}"},
        }
        # Apply custom spacing to first section
        assert tpl["sections"], "no sections in template"
        tpl["sections"][0]["space_before"] = 20
        tpl["sections"][0]["space_after"] = 24
        tpl["sections"][0]["line_spacing"] = 1.8

        put = client.put(
            f"{BASE_URL}/api/proposals/template",
            json={"template": tpl},
            timeout=30,
        )
        assert put.status_code == 200, put.text[:500]

        g = client.get(f"{BASE_URL}/api/proposals/template", timeout=30)
        assert g.status_code == 200
        gt = g.json()["template"]
        assert gt["header"]["enabled"] is True
        assert gt["header"]["left"]["type"] == "logo"
        assert gt["header"]["center"]["type"] == "company_name"
        assert gt["header"]["right"]["type"] == "date"
        assert gt["footer"]["enabled"] is True
        assert gt["footer"]["left"]["type"] == "custom"
        assert gt["footer"]["left"]["text"] == "Confidential — {company}"
        assert gt["footer"]["right"]["type"] == "page"
        assert gt["footer"]["right"]["text"] == "Page {n} of {total}"
        # Spacing
        sec0 = gt["sections"][0]
        assert sec0["space_before"] == 20
        assert sec0["space_after"] == 24
        assert float(sec0["line_spacing"]) == 1.8

    def test_colors_preserved_alongside_header_footer(self, client):
        """No regression on the colors round-trip with the new fields present."""
        r = client.get(f"{BASE_URL}/api/proposals/template", timeout=30)
        tpl = copy.deepcopy(r.json()["template"])
        tpl.setdefault("colors", {})
        tpl["colors"]["accent"] = "#112233"
        tpl["colors"]["title"] = "#445566"
        # Keep current header/footer
        put = client.put(
            f"{BASE_URL}/api/proposals/template",
            json={"template": tpl},
            timeout=30,
        )
        assert put.status_code == 200

        g = client.get(f"{BASE_URL}/api/proposals/template", timeout=30).json()["template"]
        assert g["colors"]["accent"].lower() == "#112233"
        assert g["colors"]["title"].lower() == "#445566"
        # header/footer must still be present after a colors PUT
        assert "header" in g and "footer" in g


# ── PDF generation with {total} (two-pass) ───────────────────────────────────
class TestPdfGenerationTotalPath:
    def test_preview_with_total_in_footer_returns_pdf(self, client):
        # Ensure footer has {total}
        tpl = client.get(f"{BASE_URL}/api/proposals/template", timeout=30).json()["template"]
        tpl = copy.deepcopy(tpl)
        tpl["footer"] = {
            "enabled": True,
            "left":   {"type": "custom", "text": "Confidential — {company}"},
            "center": {"type": "date", "text": ""},
            "right":  {"type": "page", "text": "Page {n} of {total}"},
        }
        tpl["header"] = {
            "enabled": True,
            "left":   {"type": "logo", "text": ""},
            "center": {"type": "company_name", "text": ""},
            "right":  {"type": "none", "text": ""},
        }
        put = client.put(f"{BASE_URL}/api/proposals/template", json={"template": tpl}, timeout=30)
        assert put.status_code == 200, put.text[:500]

        prev = client.post(
            f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/preview",
            json={}, timeout=90,
        )
        assert prev.status_code == 200, prev.text[:500]
        assert "application/pdf" in prev.headers.get("content-type", "").lower()
        assert prev.content.startswith(b"%PDF-"), f"Not a PDF: {prev.content[:20]!r}"
        assert len(prev.content) > 2000

    def test_generate_with_total_in_footer_returns_proposal(self, client):
        gen = client.post(
            f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/generate",
            json={}, timeout=120,
        )
        assert gen.status_code == 200, gen.text[:500]
        proposal = gen.json().get("proposal")
        assert proposal, f"No proposal returned: {gen.json()}"
        assert proposal.get("lead_id") == LEAD_ID
        assert proposal.get("file_name")
        assert proposal.get("file_size", 0) > 1000


# ── PDF generation with header/footer disabled ───────────────────────────────
class TestPdfGenerationHeaderFooterDisabled:
    def test_preview_with_both_disabled_returns_pdf(self, client):
        tpl = client.get(f"{BASE_URL}/api/proposals/template", timeout=30).json()["template"]
        tpl = copy.deepcopy(tpl)
        tpl["header"]["enabled"] = False
        tpl["footer"]["enabled"] = False
        put = client.put(f"{BASE_URL}/api/proposals/template", json={"template": tpl}, timeout=30)
        assert put.status_code == 200

        prev = client.post(
            f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/preview",
            json={}, timeout=90,
        )
        assert prev.status_code == 200, prev.text[:500]
        assert prev.content.startswith(b"%PDF-")
        assert len(prev.content) > 1000

    def test_generate_with_both_disabled_returns_pdf(self, client):
        gen = client.post(
            f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/generate",
            json={}, timeout=120,
        )
        assert gen.status_code == 200, gen.text[:500]
        proposal = gen.json().get("proposal")
        assert proposal and proposal.get("file_size", 0) > 1000
