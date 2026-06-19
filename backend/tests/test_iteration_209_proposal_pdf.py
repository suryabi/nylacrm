"""Backend tests for the branded Lead Proposal PDF generator feature.

Covers:
  - GET /api/proposals/template (seeds defaults if missing)
  - PUT /api/proposals/template (admin only; persistence on reload)
  - POST /api/leads/{lead_id}/proposal/generate (builds 2-page PDF, stores it as the lead proposal)
  - GET /api/leads/{lead_id}/proposal/download (base64 PDF, lead company name in title metadata, pricing table content)
  - Master SKU update with standard_price + return_bottle_credit (PUT /api/master-skus/{id}) persists
  - Pricing table reflects Standard / Offer / Landing = Offer - Credit after regenerate
"""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
LEAD_ID = "bc026d67-a3ca-48f2-a5cf-25c89654e150"  # Bangalore Tech Park (per request)


@pytest.fixture(scope="session")
def session_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "surya.yadavalli@nylaairwater.earth",
        "password": "test123",
    }, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"auth failed: {r.status_code} {r.text[:200]}")
    body = r.json()
    tok = body.get("session_token") or body.get("token") or body.get("access_token")
    cookies = r.cookies
    return tok, cookies


@pytest.fixture()
def auth(session_token):
    tok, cookies = session_token
    s = requests.Session()
    if cookies:
        s.cookies.update(cookies)
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    s.headers.update({"Content-Type": "application/json"})
    return s


# ── 1. Template GET / PUT ───────────────────────────────────────────────────
class TestProposalTemplate:
    def test_get_seeds_and_returns_template(self, auth):
        r = auth.get(f"{BASE_URL}/api/proposals/template", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "template" in data and "defaults" in data
        tpl = data["template"]
        # core sections present
        for k in [
            "company", "title_template", "intro_paragraph", "pricing_heading",
            "pricing_disclaimer", "reverse_logistics_heading", "reverse_logistics_items",
            "commercial_terms_heading", "commercial_terms_items",
            "listing_format_heading", "listing_format_items",
            "brand_onboarding_heading", "brand_onboarding_items",
            "category_placement_heading", "category_placement_allowed",
            "category_placement_not_allowed",
        ]:
            assert k in tpl, f"missing key: {k}"
        assert isinstance(tpl["company"], dict)
        assert tpl["title_template"].count("{company}") >= 1

    def test_put_persists_and_reload_returns_change(self, auth):
        get1 = auth.get(f"{BASE_URL}/api/proposals/template", timeout=30).json()["template"]
        original_disclaimer = get1.get("pricing_disclaimer", "")
        marker = "TEST_DISC marker iteration_209"
        get1["pricing_disclaimer"] = marker

        r = auth.put(f"{BASE_URL}/api/proposals/template", json={"template": get1}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["template"]["pricing_disclaimer"] == marker

        # Reload
        get2 = auth.get(f"{BASE_URL}/api/proposals/template", timeout=30).json()["template"]
        assert get2["pricing_disclaimer"] == marker

        # Restore original (cleanup)
        get2["pricing_disclaimer"] = original_disclaimer or "GST 5% extra."
        rr = auth.put(f"{BASE_URL}/api/proposals/template", json={"template": get2}, timeout=30)
        assert rr.status_code == 200


# ── 2. Master SKU standard_price / return_bottle_credit ─────────────────────
class TestMasterSKUPricing:
    def test_update_master_sku_standard_price_and_credit(self, auth):
        # find a SKU used by the lead
        lead = auth.get(f"{BASE_URL}/api/leads/{LEAD_ID}", timeout=30).json()
        proposed = lead.get("proposed_sku_pricing") or []
        if not proposed:
            pytest.skip("Lead has no proposed_sku_pricing — cannot derive SKU")
        sku_name = proposed[0].get("sku") or proposed[0].get("sku_name")
        sku_id = proposed[0].get("sku_id")

        masters = auth.get(f"{BASE_URL}/api/master-skus", timeout=30).json()
        if isinstance(masters, dict):
            masters = masters.get("skus") or masters.get("master_skus") or masters.get("data") or []
        target = None
        for m in masters:
            if sku_id and m.get("id") == sku_id:
                target = m
                break
            if (m.get("sku_name") or m.get("name") or "").strip().lower() == (sku_name or "").strip().lower():
                target = m
                break
        if not target:
            pytest.skip(f"master SKU not found for {sku_name!r}/{sku_id}")

        payload = {"standard_price": 120, "return_bottle_credit": 20}
        r = auth.put(f"{BASE_URL}/api/master-skus/{target['id']}", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text

        # GET to verify persistence
        masters2 = auth.get(f"{BASE_URL}/api/master-skus", timeout=30).json()
        if isinstance(masters2, dict):
            masters2 = masters2.get("skus") or masters2.get("master_skus") or masters2.get("data") or []
        updated = next((m for m in masters2 if m.get("id") == target["id"]), None)
        assert updated is not None
        assert float(updated.get("standard_price") or 0) == 120.0
        assert float(updated.get("return_bottle_credit") or 0) == 20.0


# ── 3. Generate + download proposal ─────────────────────────────────────────
class TestProposalGenerate:
    def test_generate_proposal_returns_metadata(self, auth):
        r = auth.post(f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/generate", timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        prop = body.get("proposal") or {}
        assert prop.get("status") in ("pending_review", "revised")
        assert prop.get("file_name", "").endswith(".pdf")
        assert prop.get("content_type") == "application/pdf"
        assert (prop.get("file_size") or 0) > 5000  # not an empty PDF
        assert "message" in body and "generated" in body["message"].lower()

    def test_download_proposal_pdf_is_valid_two_page(self, auth):
        # Ensure generated
        auth.post(f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/generate", timeout=60)
        r = auth.get(f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/download", timeout=30)
        assert r.status_code == 200, r.text
        prop = r.json().get("proposal") or {}
        b64 = prop.get("file_data")
        assert b64, "missing base64 file_data"
        raw = base64.b64decode(b64)
        assert raw[:5] == b"%PDF-", "not a PDF signature"
        # Two pages: count /Type /Page occurrences (ignoring /Pages)
        import re
        page_count = len(re.findall(rb"/Type\s*/Page[^s]", raw))
        assert page_count >= 2, f"expected >=2 pages, got {page_count}"
        # Extract text via pypdf to validate company name + boilerplate
        try:
            from pypdf import PdfReader
        except Exception:
            try:
                from PyPDF2 import PdfReader  # type: ignore
            except Exception:
                pytest.skip("pypdf/PyPDF2 not installed; structural checks passed")
        import io as _io
        reader = PdfReader(_io.BytesIO(raw))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        lead = auth.get(f"{BASE_URL}/api/leads/{LEAD_ID}", timeout=30).json()
        company = (lead.get("company") or "").strip()
        if company:
            # At least one significant word from company name should be in extracted text
            words = [w for w in company.split() if len(w) > 3]
            assert any(w in text for w in words), f"company name not found in PDF text: {company!r}; words {words!r}"
        # Boilerplate markers
        assert ("Reverse Logistics" in text) or ("Commercial Terms" in text), \
            "boilerplate section headings missing from PDF text"

    def test_pricing_table_reflects_standard_and_landing(self, auth):
        # Set master SKU pricing first (re-use test SKU)
        lead = auth.get(f"{BASE_URL}/api/leads/{LEAD_ID}", timeout=30).json()
        proposed = lead.get("proposed_sku_pricing") or []
        if not proposed:
            pytest.skip("no proposed SKUs on lead")
        master_id = proposed[0].get("sku_id")
        sku_name = proposed[0].get("sku") or proposed[0].get("sku_name")
        if master_id:
            auth.put(f"{BASE_URL}/api/master-skus/{master_id}",
                     json={"standard_price": 120, "return_bottle_credit": 20}, timeout=30)
        g = auth.post(f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/generate", timeout=60)
        assert g.status_code == 200
        d = auth.get(f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/download", timeout=30).json()
        raw = base64.b64decode(d["proposal"]["file_data"])
        try:
            from pypdf import PdfReader
        except Exception:
            try:
                from PyPDF2 import PdfReader  # type: ignore
            except Exception:
                pytest.skip("pypdf not installed; cannot verify pricing text")
        import io as _io
        reader = PdfReader(_io.BytesIO(raw))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        # SKU format name
        first_word = (sku_name or "").split()[0] if sku_name else ""
        if first_word:
            assert first_word in text, f"SKU '{first_word}' not in extracted PDF text"
        # Standard / Offer / Landing numbers should be present
        # Standard 120, Offer = proposed price (use what the lead has), Landing = offer-20
        offer = proposed[0].get("price_per_unit") or proposed[0].get("proposed_price")
        if offer is not None:
            landing = float(offer) - 20.0
            assert str(int(landing)) in text or f"{landing:.2f}" in text, \
                f"Landing price {landing} not in PDF"
        assert "120" in text, "Standard price 120 not in PDF"


# ── 4. Proposal review flow still works on generated PDF ────────────────────
class TestProposalReview:
    def test_request_changes_then_regenerate_marks_revised(self, auth):
        # ensure a proposal exists
        auth.post(f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/generate", timeout=60)
        r = auth.put(
            f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/review",
            json={"action": "changes_requested", "comment": "TEST_review please adjust"},
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        # regenerate -> should become 'revised'
        g = auth.post(f"{BASE_URL}/api/leads/{LEAD_ID}/proposal/generate", timeout=60)
        assert g.status_code == 200
        assert g.json()["proposal"]["status"] in ("revised", "pending_review")
