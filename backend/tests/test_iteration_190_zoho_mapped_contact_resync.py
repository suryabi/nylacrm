"""
Iteration 190 — Account activation must NOT create a duplicate Zoho customer
when a `zoho_contact_id` is already mapped on the account.

Bug: `upsert_contact` searched Zoho by email then name and, when neither
matched, fell through to CREATE a new contact — even though the account was
already linked to a Zoho contact (manual mapping). Fix: when the account
carries a `zoho_contact_id`, re-sync (PUT) that exact contact and never POST.

These tests mock the Zoho HTTP layer (`_zoho_request`) so they run without a
live Zoho connection.
"""
import asyncio

import pytest

from services import zoho_service


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class _Recorder:
    def __init__(self, search_results=None):
        self.calls = []
        self.search_results = search_results or []

    async def __call__(self, method, path, *, tenant_id, json=None, params=None, max_attempts=3):
        self.calls.append({"method": method, "path": path, "json": json, "params": params})
        if method == "GET" and path.endswith("/contacts"):
            return {"contacts": self.search_results}
        if method == "PUT":
            cid = path.rsplit("/", 1)[-1]
            return {"contact": {"contact_id": cid}}
        if method == "POST":
            return {"contact": {"contact_id": "NEWLY_CREATED_999"}}
        return {}


def test_mapped_contact_id_updates_not_creates(monkeypatch):
    rec = _Recorder(search_results=[])  # search would find nothing → old code would CREATE
    monkeypatch.setattr(zoho_service, "_zoho_request", rec)

    account = {
        "account_name": "Diggin Cafe",
        "email": "owner@diggin.example",
        "zoho_contact_id": "MAPPED_12345",
    }
    cid = _run(zoho_service.upsert_contact("nyla-air-water", account))

    # Must return the mapped id, NOT a freshly-created one.
    assert cid == "MAPPED_12345", cid
    methods = [(c["method"], c["path"]) for c in rec.calls]
    # No POST (create) should ever happen.
    assert not any(m == "POST" for m, _ in methods), methods
    # Exactly one PUT against the mapped contact.
    assert ("PUT", "/books/v3/contacts/MAPPED_12345") in methods, methods
    # No contact search GET should happen — we short-circuit on the mapped id.
    assert not any(m == "GET" and p.endswith("/contacts") for m, p in methods), methods


def test_no_mapped_id_falls_back_to_search_then_create(monkeypatch):
    """Sanity: without a mapped id and no search match, it still creates (unchanged behaviour)."""
    rec = _Recorder(search_results=[])
    monkeypatch.setattr(zoho_service, "_zoho_request", rec)

    account = {"account_name": "Brand New Cafe", "email": "new@cafe.example"}
    cid = _run(zoho_service.upsert_contact("nyla-air-water", account))

    assert cid == "NEWLY_CREATED_999", cid
    methods = [c["method"] for c in rec.calls]
    assert "POST" in methods, methods


def test_no_mapped_id_but_search_finds_existing_updates(monkeypatch):
    """Without a mapped id but an email match found → UPDATE that found contact."""
    rec = _Recorder(search_results=[{"contact_id": "FOUND_55", "contact_name": "Found Cafe"}])
    monkeypatch.setattr(zoho_service, "_zoho_request", rec)

    account = {"account_name": "Found Cafe", "email": "found@cafe.example"}
    cid = _run(zoho_service.upsert_contact("nyla-air-water", account))

    assert cid == "FOUND_55", cid
    methods = [(c["method"], c["path"]) for c in rec.calls]
    assert not any(m == "POST" for m, _ in methods), methods
    assert ("PUT", "/books/v3/contacts/FOUND_55") in methods, methods
