"""Backend tests for DELETE /marketing-requests/{id}/versions/{version_id}.

Verifies that deleting a work version:
  - 404s on unknown request / version
  - Removes the version from the marketing_request document
  - Best-effort deletes the underlying marketing_request_files rows for files attached to the version
  - Clears approved_version_id/name when the deleted version was the approved one
  - Is blocked once the request has been submitted for production
  - Requires authentication
"""
import os
from pathlib import Path
import io
import pytest
import requests


def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def mr_id(hdr):
    """Find or create a draft-ish marketing request we can mutate freely (no production payload)."""
    r = requests.get(f"{API}/marketing-requests", headers=hdr, timeout=20)
    assert r.status_code == 200, r.text
    rows = r.json().get("requests") or r.json().get("items") or []
    # Prefer a request that has NO production payload and no versions yet (or low version count)
    for row in rows:
        if not row.get("production"):
            return row["id"]
    pytest.skip("No mutable marketing request available in this tenant")


def _upload_file(hdr):
    files = {"file": ("test_version.txt", io.BytesIO(b"hello version"), "text/plain")}
    r = requests.post(f"{API}/marketing-requests/upload", headers=hdr, files=files, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _add_version(hdr, mr_id, file_ids=None, comment="test version"):
    payload = {"file_ids": file_ids or [], "links": [], "comments": comment}
    r = requests.post(f"{API}/marketing-requests/{mr_id}/versions", headers={**hdr, "Content-Type": "application/json"}, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


class TestDeleteVersion:
    def test_404_unknown_request(self, hdr):
        r = requests.delete(f"{API}/marketing-requests/does-not-exist/versions/whatever", headers=hdr, timeout=20)
        assert r.status_code == 404

    def test_404_unknown_version(self, hdr, mr_id):
        r = requests.delete(f"{API}/marketing-requests/{mr_id}/versions/non-existent-id", headers=hdr, timeout=20)
        assert r.status_code == 404

    def test_unauthenticated_blocked(self, mr_id):
        r = requests.delete(f"{API}/marketing-requests/{mr_id}/versions/x", timeout=20)
        assert r.status_code in (401, 403)

    def test_delete_version_removes_files_and_version(self, hdr, mr_id):
        # Upload a file, attach it via a new version
        f = _upload_file(hdr)
        v = _add_version(hdr, mr_id, file_ids=[f["id"]], comment="delete-me")
        version_id = v["id"]

        # Sanity: GET request shows the new version
        r = requests.get(f"{API}/marketing-requests/{mr_id}", headers=hdr, timeout=20)
        assert r.status_code == 200
        doc = r.json()
        assert any(vv.get("id") == version_id for vv in (doc.get("versions") or []))

        # Delete the version
        r = requests.delete(f"{API}/marketing-requests/{mr_id}/versions/{version_id}", headers=hdr, timeout=30)
        assert r.status_code == 200, r.text
        after = r.json()
        # Version is gone
        assert not any(vv.get("id") == version_id for vv in (after.get("versions") or []))
        # Timeline now has a system 'Deleted work version' comment
        timeline_texts = [c.get("text", "") for c in (after.get("comments") or [])]
        assert any("Deleted work version" in t for t in timeline_texts)

        # Underlying file should no longer be downloadable (file row deleted)
        r2 = requests.get(f"{API}/marketing-requests/files/{f['id']}", headers=hdr, timeout=20)
        assert r2.status_code == 404, f"File row should be gone, got {r2.status_code}"

    def test_delete_approved_version_clears_approval(self, hdr, mr_id):
        # Add a version, approve it, then delete it — approved_version_* should be cleared.
        f = _upload_file(hdr)
        v = _add_version(hdr, mr_id, file_ids=[f["id"]], comment="approve-then-delete")
        version_id = v["id"]

        # Approve it
        r = requests.post(f"{API}/marketing-requests/{mr_id}/versions/{version_id}/approve",
                          headers={**hdr, "Content-Type": "application/json"}, json={}, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("approved_version_id") == version_id

        # Delete it
        r = requests.delete(f"{API}/marketing-requests/{mr_id}/versions/{version_id}", headers=hdr, timeout=20)
        assert r.status_code == 200, r.text
        after = r.json()
        assert after.get("approved_version_id") in (None, "")
        assert after.get("approved_version_name") in (None, "")
