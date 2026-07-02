"""Backend tests for Account Logo endpoints (upload/serve/delete).

Covers the bug fix on /accounts/:id detail page:
- GET /api/accounts/{id} returns logo_url + dimensions
- /api/static/logos/{id}.png serves the image
- POST /api/accounts/{id}/logo accepts base64 JSON (JPG/PNG source), persists file
- DELETE /api/accounts/{id}/logo removes it
"""
import os
import io
import base64
import time
import requests
import pytest
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fmcg-ops.preview.emergentagent.com").rstrip("/")
CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASS = "test123"
ACCOUNT_ID = "b529f00e-54b3-4709-92c1-db08137ef0b3"


def _make_data_url(fmt: str = "PNG", size=(120, 120), color=(200, 50, 50)) -> str:
    """Return a base64 data URL for a small square image in the requested format."""
    im = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    im.save(buf, format=fmt)
    mime = "image/png" if fmt.upper() == "PNG" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": CEO_EMAIL, "password": CEO_PASS})
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text}"
    body = r.json()
    token = body.get("session_token") or body.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def original_logo(api):
    """Snapshot original logo (JSON body only, small PNG) so we can restore it in teardown."""
    r = api.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}")
    assert r.status_code == 200
    acc = r.json()
    orig = {
        "logo_url": acc.get("logo_url"),
        "logo_width_mm": acc.get("logo_width_mm"),
        "logo_height_mm": acc.get("logo_height_mm"),
    }
    img_data_url = None
    if orig["logo_url"]:
        img_r = requests.get(f"{BASE_URL}{orig['logo_url']}")
        if img_r.status_code == 200:
            img_data_url = "data:image/png;base64," + base64.b64encode(img_r.content).decode()
    yield orig, img_data_url
    # Teardown: restore original state
    if img_data_url and orig["logo_url"]:
        api.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/logo",
            json={
                "logo": img_data_url,
                "width_mm": orig.get("logo_width_mm") or 40,
                "height_mm": orig.get("logo_height_mm") or 40,
            },
        )
    else:
        # Original had no logo — remove any test-created one
        api.delete(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/logo")


class TestAccountLogo:
    """CRUD + serving of the account logo."""

    def test_get_account_returns_logo_url(self, api, original_logo):
        # Account currently has a logo; verify fields exposed.
        r = api.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}")
        assert r.status_code == 200
        acc = r.json()
        assert acc.get("logo_url"), "logo_url missing on account"
        assert acc["logo_url"].startswith("/api/static/logos/"), acc["logo_url"]
        assert isinstance(acc.get("logo_width_mm"), int)
        assert isinstance(acc.get("logo_height_mm"), int)

    def test_static_logo_is_served(self, api, original_logo):
        r = api.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}")
        logo_url = r.json()["logo_url"]
        img_r = requests.get(f"{BASE_URL}{logo_url}")
        assert img_r.status_code == 200, f"Static file not served: {img_r.status_code}"
        assert img_r.headers.get("content-type", "").startswith("image/"), img_r.headers.get("content-type")
        assert len(img_r.content) > 100, "Logo file empty/too small"
        # Verify it is decodable as an image
        im = Image.open(io.BytesIO(img_r.content))
        assert im.size[0] > 0 and im.size[1] > 0

    def test_upload_png_logo(self, api, original_logo):
        data_url = _make_data_url("PNG", color=(10, 120, 200))
        r = api.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/logo",
            json={"logo": data_url, "width_mm": 45, "height_mm": 45},
        )
        assert r.status_code == 200, f"PNG upload failed {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("logo_url", "").startswith("/api/static/logos/")

        # Verify persistence via GET account
        r2 = api.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}")
        acc = r2.json()
        assert acc["logo_url"] == body["logo_url"]
        assert acc["logo_width_mm"] == 45
        assert acc["logo_height_mm"] == 45

        # Verify the file itself is served (with cache-busting timestamp)
        img_r = requests.get(f"{BASE_URL}{body['logo_url']}?t={int(time.time())}")
        assert img_r.status_code == 200
        assert img_r.headers.get("content-type", "").startswith("image/")

    def test_upload_jpg_logo(self, api, original_logo):
        # Upload a JPEG source; backend re-encodes to PNG on disk.
        data_url = _make_data_url("JPEG", color=(30, 180, 90))
        r = api.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/logo",
            json={"logo": data_url, "width_mm": 50, "height_mm": 50},
        )
        assert r.status_code == 200, f"JPG upload failed {r.status_code}: {r.text}"
        assert r.json().get("logo_url", "").startswith("/api/static/logos/")

        # Verify persistence via GET account
        acc = api.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}").json()
        assert acc["logo_width_mm"] == 50
        assert acc["logo_height_mm"] == 50

    def test_delete_and_reupload(self, api, original_logo):
        # DELETE the logo
        r = api.delete(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/logo")
        assert r.status_code in (200, 204), f"Delete failed {r.status_code}: {r.text}"

        # GET should no longer expose logo_url (or return null)
        acc = api.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}").json()
        assert not acc.get("logo_url"), f"logo_url should be gone, got: {acc.get('logo_url')}"

        # Re-upload so the module-level teardown can restore the original bytes
        data_url = _make_data_url("PNG", color=(90, 90, 90))
        r2 = api.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/logo",
            json={"logo": data_url, "width_mm": 40, "height_mm": 40},
        )
        assert r2.status_code == 200

    def test_404_on_unknown_account(self, api, original_logo):
        r = api.post(
            f"{BASE_URL}/api/accounts/does-not-exist/logo",
            json={"logo": _make_data_url(), "width_mm": 35, "height_mm": 35},
        )
        assert r.status_code == 404
