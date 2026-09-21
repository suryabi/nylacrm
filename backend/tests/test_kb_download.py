"""Backend tests for Knowledge Base document upload/download flow."""
import hashlib
import os
import re

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"
ADMIN = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
NONADMIN = {"email": "creative.director@nylaairwater.earth", "password": "test123"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def nonadmin_headers():
    try:
        return {"Authorization": f"Bearer {_login(NONADMIN)}"}
    except AssertionError:
        pytest.skip("non-admin creds unavailable")


# ---------- Upload + download original bytes ----------
def test_upload_file_and_download_original(admin_headers):
    body = b"TEST_KB_QA original bytes payload for download test\n" * 50
    sha = hashlib.sha256(body).hexdigest()
    files = {"file": ("TEST_kb_qa_sample.txt", body, "text/plain")}
    r = requests.post(f"{BASE}/api/kb/documents/upload", files=files, headers=admin_headers, timeout=60)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["id"] and doc["storage_path"].startswith("nyla-crm/kb/")
    assert doc["file_size"] == len(body)
    assert doc["content_type"]
    assert "content" not in doc
    pytest.upload_doc_id = doc["id"]
    pytest.upload_bytes = body
    pytest.upload_sha = sha
    pytest.upload_ctype = doc["content_type"]

    # list should include with storage_path but no content
    lr = requests.get(f"{BASE}/api/kb/documents", headers=admin_headers, timeout=30)
    assert lr.status_code == 200
    listed = [d for d in lr.json()["documents"] if d["id"] == doc["id"]]
    assert listed and listed[0].get("storage_path") and "content" not in listed[0]
    assert listed[0].get("file_size") == len(body)

    # download original
    dr = requests.get(f"{BASE}/api/kb/documents/{doc['id']}/download", headers=admin_headers, timeout=60)
    assert dr.status_code == 200
    assert dr.headers.get("X-KB-Original") == "1"
    cd = dr.headers.get("Content-Disposition", "")
    assert "attachment" in cd and "filename*=UTF-8''" in cd
    assert "TEST_kb_qa_sample.txt" in cd or "TEST_kb_qa_sample" in cd
    assert dr.content == body
    assert hashlib.sha256(dr.content).hexdigest() == sha


# ---------- Text note download (fallback) ----------
def test_text_note_download_fallback(admin_headers):
    content = "TEST_KB_QA note body content line1\nline2"
    r = requests.post(f"{BASE}/api/kb/documents/text", json={"title": "TEST_KB_QA_note", "content": content}, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    pytest.text_doc_id = tid
    dr = requests.get(f"{BASE}/api/kb/documents/{tid}/download", headers=admin_headers, timeout=30)
    assert dr.status_code == 200
    assert dr.headers.get("X-KB-Original") == "0"
    assert dr.headers.get("content-type", "").startswith("text/plain")
    cd = dr.headers.get("Content-Disposition", "")
    assert "TEST_KB_QA_note.txt" in cd
    assert dr.content.decode("utf-8") == content


# ---------- URL doc download (best-effort) ----------
def test_url_doc_download(admin_headers):
    r = requests.post(f"{BASE}/api/kb/documents/url",
                      json={"title": "TEST_KB_QA_url", "url": "https://example.com"},
                      headers=admin_headers, timeout=60)
    if r.status_code != 200:
        pytest.skip(f"URL fetch not available: {r.status_code}")
    uid = r.json()["id"]
    pytest.url_doc_id = uid
    dr = requests.get(f"{BASE}/api/kb/documents/{uid}/download", headers=admin_headers, timeout=30)
    assert dr.status_code == 200
    assert dr.headers.get("X-KB-Original") == "0"
    assert dr.headers.get("content-type", "").startswith("text/plain")
    assert len(dr.content) > 0


# ---------- Non-admin download allowed, upload forbidden ----------
def test_nonadmin_can_download_but_not_upload(admin_headers, nonadmin_headers):
    # non-admin cannot upload
    files = {"file": ("TEST_denied.txt", b"nope", "text/plain")}
    r = requests.post(f"{BASE}/api/kb/documents/upload", files=files, headers=nonadmin_headers, timeout=30)
    assert r.status_code == 403, r.status_code

    # but can download the earlier uploaded file
    doc_id = getattr(pytest, "upload_doc_id", None)
    assert doc_id
    dr = requests.get(f"{BASE}/api/kb/documents/{doc_id}/download", headers=nonadmin_headers, timeout=60)
    assert dr.status_code == 200
    assert dr.content == pytest.upload_bytes


def test_unauth_and_unknown():
    r = requests.get(f"{BASE}/api/kb/documents/nonexistent-id/download", timeout=15)
    assert r.status_code in (401, 403)
    admin = _login(ADMIN)
    r = requests.get(f"{BASE}/api/kb/documents/does-not-exist-xyz/download",
                     headers={"Authorization": f"Bearer {admin}"}, timeout=15)
    assert r.status_code == 404


# ---------- Delete flow + cleanup ----------
def test_delete_removes_doc_and_object(admin_headers):
    # Delete the uploaded file doc
    did = getattr(pytest, "upload_doc_id", None)
    assert did
    r = requests.delete(f"{BASE}/api/kb/documents/{did}", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    dr = requests.get(f"{BASE}/api/kb/documents/{did}/download", headers=admin_headers, timeout=15)
    assert dr.status_code == 404

    # Cleanup text + url QA docs
    for k in ("text_doc_id", "url_doc_id"):
        v = getattr(pytest, k, None)
        if v:
            requests.delete(f"{BASE}/api/kb/documents/{v}", headers=admin_headers, timeout=15)
