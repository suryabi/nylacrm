"""Pytest config — keep a single event loop alive for the entire test session
so motor's AsyncIOMotorClient (created at module import time) isn't bound to a
loop that pytest-asyncio later closes between tests."""
import asyncio
import pytest


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
