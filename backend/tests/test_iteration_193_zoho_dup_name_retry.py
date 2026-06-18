"""
Iteration 193 — Re-syncing a manually-linked Zoho contact must NOT fail when
the contact's name collides with a DIFFERENT existing Zoho contact.

Bug (production, account FORGE BREU-HOUS): the account is already mapped to a
Zoho contact, so `upsert_contact` correctly does `PUT /contacts/{mapped_id}`.
But Zoho enforces a globally-unique `contact_name`; a leftover duplicate
already holds the name "FORGE BREU-HOUS", so the PUT is rejected with
  Zoho API 400: {"code":3062,"message":"The customer ... already exists ..."}

Fix: on a 3062 (duplicate-name) error during the PUT of an already-linked
contact, retry the PUT WITHOUT `contact_name` — sync every other field and keep
the contact's existing Zoho name. Never create a new contact.

These tests mock the Zoho HTTP layer (`_zoho_request`); no live Zoho needed.
"""
import asyncio

import pytest

from services import zoho_service
from services.zoho_service import ZohoApiError


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class _DupNameRecorder:
    """PUT with a `contact_name` raises 3062; PUT without it succeeds."""

    def __init__(self):
        self.calls = []

    async def __call__(self, method, path, *, tenant_id, json=None, params=None, max_attempts=3):
        self.calls.append({"method": method, "path": path, "json": json, "params": params})
        if method == "PUT":
            if json and "contact_name" in json:
                raise ZohoApiError(
                    400,
                    '{"code":3062,"message":"The customer \\"FORGE BREU-HOUS\\" already exists. '
                    'Please specify a different name."}',
                )
            cid = path.rsplit("/", 1)[-1]
            return {"contact": {"contact_id": cid}}
        if method == "POST":
            return {"contact": {"contact_id": "NEWLY_CREATED_999"}}
        return {}


def test_dup_name_retries_without_rename_and_keeps_link(monkeypatch):
    rec = _DupNameRecorder()
    monkeypatch.setattr(zoho_service, "_zoho_request", rec)

    account = {
        "account_name": "FORGE BREU-HOUS",
        "email": "owner@forge.example",
        "zoho_contact_id": "MAPPED_FORGE_1",
        "delivery_address": {"address": "Plot 7, Some Long Street Name, Hyderabad", "city": "Hyderabad"},
    }
    cid = _run(zoho_service.upsert_contact("nyla-air-water", account))

    # Returns the mapped contact id — no new customer created.
    assert cid == "MAPPED_FORGE_1", cid
    methods = [(c["method"], c["path"]) for c in rec.calls]
    assert not any(m == "POST" for m, _ in methods), methods

    puts = [c for c in rec.calls if c["method"] == "PUT"]
    # First PUT carried contact_name (and was rejected), retry PUT dropped it.
    assert len(puts) == 2, puts
    assert "contact_name" in (puts[0]["json"] or {}), puts[0]
    assert "contact_name" not in (puts[1]["json"] or {}), puts[1]
    # The retry still updates other fields (e.g. addresses) on the SAME contact.
    assert puts[1]["path"] == "/books/v3/contacts/MAPPED_FORGE_1", puts[1]
    assert "shipping_address" in (puts[1]["json"] or {}), puts[1]


def test_non_dup_error_still_raises(monkeypatch):
    """A non-3062 PUT error must NOT be swallowed by the retry path."""

    class _OtherErrRecorder:
        def __init__(self):
            self.calls = []

        async def __call__(self, method, path, *, tenant_id, json=None, params=None, max_attempts=3):
            self.calls.append(method)
            if method == "PUT":
                raise ZohoApiError(400, '{"code":4001,"message":"Invalid value passed for gst_no."}')
            return {}

    rec = _OtherErrRecorder()
    monkeypatch.setattr(zoho_service, "_zoho_request", rec)

    account = {"account_name": "Some Cafe", "zoho_contact_id": "MAPPED_X"}
    with pytest.raises(ZohoApiError) as ei:
        _run(zoho_service.upsert_contact("nyla-air-water", account))
    # Original (non-dup) error surfaces; only ONE PUT attempt (no retry).
    assert "4001" in ei.value.message, ei.value.message
    assert rec.calls.count("PUT") == 1, rec.calls
