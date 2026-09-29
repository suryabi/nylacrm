"""Regression tests for Design Requests New physical-sample Logo Sheet APIs.

Module coverage:
- /api/design-requests-new?physical_sample_only=true&no_limit=true
- /api/design-requests-new/physical-sample-logos/{request_id}/thumbnail
- /api/design-requests-new/physical-sample-logos.pdf
"""

import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"

PDF_FIXTURE_ID = "a481a225-f7a3-47cd-8dfb-87fa232a1437"
ZIP_FIXTURE_ID = "ede89f70-e234-4bce-8e9a-01fdbe5f743f"
PHYSICAL_SAMPLE_TYPE = "request physical sample"


@pytest.fixture(scope="module")
def base_url() -> str:
    assert BASE_URL, "REACT_APP_BACKEND_URL is required"
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="module")
def auth_headers(base_url: str) -> dict:
    login = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID, "Content-Type": "application/json"},
        timeout=30,
    )
    assert login.status_code == 200, login.text
    data = login.json()
    token = data.get("session_token") or data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT_ID}


@pytest.fixture(scope="module")
def physical_sample_rows(base_url: str, auth_headers: dict) -> list[dict]:
    response = requests.get(
        f"{base_url}/api/design-requests-new",
        params={"physical_sample_only": "true", "no_limit": "true", "queue": "all"},
        headers=auth_headers,
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    items = payload.get("items") or []
    assert isinstance(items, list)
    return items


def test_physical_sample_only_filter_returns_only_matching_type(physical_sample_rows: list[dict]):
    for row in physical_sample_rows:
        assert (row.get("request_type_name") or "").strip().lower() == PHYSICAL_SAMPLE_TYPE


def test_physical_sample_only_with_no_limit_shape(base_url: str, auth_headers: dict):
    response = requests.get(
        f"{base_url}/api/design-requests-new",
        params={"physical_sample_only": "true", "no_limit": "true"},
        headers=auth_headers,
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "items" in payload and "total" in payload and "limit" in payload
    assert payload.get("page") == 1
    assert payload.get("limit") == payload.get("total")


def test_physical_sample_filters_state_team_requester_search(
    base_url: str,
    auth_headers: dict,
    physical_sample_rows: list[dict],
):
    if not physical_sample_rows:
        pytest.skip("No physical-sample rows available to verify filter combinations")

    seed = physical_sample_rows[0]
    params = {
        "physical_sample_only": "true",
        "no_limit": "true",
        "queue": "all",
    }
    if seed.get("current_state_key"):
        params["state_key"] = seed["current_state_key"]
    if seed.get("assigned_department_id"):
        params["assigned_department_id"] = seed["assigned_department_id"]
    if seed.get("created_by"):
        params["created_by"] = seed["created_by"]
    if seed.get("request_number"):
        params["search"] = seed["request_number"]

    response = requests.get(
        f"{base_url}/api/design-requests-new",
        params=params,
        headers=auth_headers,
        timeout=30,
    )
    assert response.status_code == 200, response.text
    items = response.json().get("items") or []
    assert len(items) >= 1

    for row in items:
        assert (row.get("request_type_name") or "").strip().lower() == PHYSICAL_SAMPLE_TYPE
        if params.get("state_key"):
            assert row.get("current_state_key") == params["state_key"]
        if params.get("assigned_department_id"):
            assert row.get("assigned_department_id") == params["assigned_department_id"]
        if params.get("created_by"):
            assert row.get("created_by") == params["created_by"]
        if params.get("search"):
            joined = " ".join(
                [
                    str(row.get("request_number") or ""),
                    str(row.get("title") or ""),
                    str(row.get("request_type_name") or ""),
                    str(row.get("requirement_details") or ""),
                ]
            ).lower()
            assert params["search"].lower() in joined


def test_thumbnail_missing_request_returns_404(base_url: str, auth_headers: dict):
    missing_id = str(uuid.uuid4())
    response = requests.get(
        f"{base_url}/api/design-requests-new/physical-sample-logos/{missing_id}/thumbnail",
        headers=auth_headers,
        timeout=30,
    )
    assert response.status_code == 404


def test_thumbnail_rejects_non_physical_sample_request(base_url: str, auth_headers: dict):
    listing = requests.get(
        f"{base_url}/api/design-requests-new",
        params={"no_limit": "true", "queue": "all"},
        headers=auth_headers,
        timeout=30,
    )
    assert listing.status_code == 200, listing.text
    rows = listing.json().get("items") or []
    non_physical = next(
        (r for r in rows if (r.get("request_type_name") or "").strip().lower() != PHYSICAL_SAMPLE_TYPE),
        None,
    )
    if not non_physical:
        pytest.skip("No non-physical-sample request available for rejection check")

    response = requests.get(
        f"{base_url}/api/design-requests-new/physical-sample-logos/{non_physical['id']}/thumbnail",
        headers=auth_headers,
        timeout=30,
    )
    assert response.status_code == 404


@pytest.mark.parametrize("fixture_request_id", [PDF_FIXTURE_ID, ZIP_FIXTURE_ID])
def test_thumbnail_fixture_requests_render_png(base_url: str, auth_headers: dict, fixture_request_id: str):
    response = requests.get(
        f"{base_url}/api/design-requests-new/physical-sample-logos/{fixture_request_id}/thumbnail",
        headers=auth_headers,
        timeout=45,
    )
    if response.status_code == 404:
        pytest.skip(f"Fixture {fixture_request_id} not present in this environment")
    assert response.status_code == 200, response.text
    assert response.headers.get("content-type", "").startswith("image/png")
    assert response.content.startswith(b"\x89PNG")


def test_physical_sample_logo_pdf_response_is_valid_pdf(base_url: str, auth_headers: dict):
    response = requests.get(
        f"{base_url}/api/design-requests-new/physical-sample-logos.pdf",
        params={"queue": "all"},
        headers=auth_headers,
        timeout=60,
    )
    assert response.status_code == 200, response.text
    assert "application/pdf" in response.headers.get("content-type", "")
    assert response.content.startswith(b"%PDF")


def test_logo_pdf_count_header_matches_filtered_listing(base_url: str, auth_headers: dict, physical_sample_rows: list[dict]):
    response = requests.get(
        f"{base_url}/api/design-requests-new/physical-sample-logos.pdf",
        params={"queue": "all"},
        headers=auth_headers,
        timeout=60,
    )
    assert response.status_code == 200, response.text
    count_header = response.headers.get("X-Logo-Request-Count")
    assert count_header is not None
    assert int(count_header) == len(physical_sample_rows)


def test_logo_pdf_count_respects_filters(base_url: str, auth_headers: dict, physical_sample_rows: list[dict]):
    if not physical_sample_rows:
        pytest.skip("No physical-sample rows available to validate filtered PDF counts")

    seed = physical_sample_rows[0]
    params = {"queue": "all"}
    if seed.get("current_state_key"):
        params["state_key"] = seed["current_state_key"]
    if seed.get("assigned_department_id"):
        params["assigned_department_id"] = seed["assigned_department_id"]
    if seed.get("created_by"):
        params["created_by"] = seed["created_by"]
    if seed.get("request_number"):
        params["search"] = seed["request_number"]

    listing = requests.get(
        f"{base_url}/api/design-requests-new",
        params={**params, "physical_sample_only": "true", "no_limit": "true"},
        headers=auth_headers,
        timeout=30,
    )
    assert listing.status_code == 200, listing.text
    expected_count = len(listing.json().get("items") or [])

    pdf = requests.get(
        f"{base_url}/api/design-requests-new/physical-sample-logos.pdf",
        params=params,
        headers=auth_headers,
        timeout=60,
    )
    assert pdf.status_code == 200, pdf.text
    assert "application/pdf" in pdf.headers.get("content-type", "")
    assert int(pdf.headers.get("X-Logo-Request-Count", "-1")) == expected_count
