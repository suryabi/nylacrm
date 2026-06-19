"""
Gamma Generate API client (v1.0).

Thin wrapper around https://public-api.gamma.app/v1.0 used to generate
presentations from CRM content. Auth via the ``X-API-KEY`` header. Sync HTTP
calls are offloaded to a thread so they never block the event loop.
"""
import asyncio
import os
from typing import Any, Optional

import requests

GAMMA_BASE_URL = "https://public-api.gamma.app/v1.0"
GAMMA_API_KEY = os.environ.get("GAMMA_API_KEY")


def _headers() -> dict:
    if not GAMMA_API_KEY:
        raise RuntimeError("GAMMA_API_KEY is not configured")
    return {"Content-Type": "application/json", "X-API-KEY": GAMMA_API_KEY}


def _create_sync(payload: dict) -> dict:
    resp = requests.post(f"{GAMMA_BASE_URL}/generations", headers=_headers(), json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()


def _status_sync(generation_id: str) -> dict:
    resp = requests.get(f"{GAMMA_BASE_URL}/generations/{generation_id}", headers=_headers(), timeout=60)
    resp.raise_for_status()
    return resp.json()


def _themes_sync() -> list:
    resp = requests.get(f"{GAMMA_BASE_URL}/themes", headers=_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json().get("data", [])


async def create_generation(payload: dict) -> dict:
    return await asyncio.to_thread(_create_sync, payload)


async def get_generation_status(generation_id: str) -> dict:
    return await asyncio.to_thread(_status_sync, generation_id)


async def list_themes() -> list:
    return await asyncio.to_thread(_themes_sync)
