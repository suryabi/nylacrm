"""Direct Google Gemini API helpers — uses the user's own `GEMINI_API_KEY`.

Replaces all prior `emergentintegrations.LlmChat` call sites. Default model is
`gemini-2.5-flash`. Two public helpers:
  - `gemini_text(prompt, system?, max_tokens?, model?)` -> str
  - `gemini_text_with_file(prompt, file_bytes, mime_type, system?, model?)` -> str

Both are async, use safety_settings=BLOCK_NONE so business documents aren't
refused by adjustable filters, and apply basic exponential backoff on 429/500/503.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Awaitable, Callable, Optional, TypeVar

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

GEMINI_MODEL_DEFAULT = "gemini-2.5-flash"

_api_key = os.environ.get("GEMINI_API_KEY")
if not _api_key:
    logger.warning(
        "GEMINI_API_KEY is not set. Gemini helper calls will fail until it is configured."
    )

# Single shared client per process — reused by all helpers.
_client: Optional[genai.Client] = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError(
                "GEMINI_API_KEY environment variable is not set. "
                "Please configure a Gemini Developer API key in backend/.env."
            )
        _client = genai.Client(api_key=key)
    return _client


# Safety settings — BLOCK_NONE on every adjustable category. Core protections
# (child safety, illegal content, etc.) remain in force regardless.
_SAFETY_BLOCK_NONE = [
    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT",         threshold="BLOCK_NONE"),
    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH",        threshold="BLOCK_NONE"),
    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT",  threshold="BLOCK_NONE"),
    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT",  threshold="BLOCK_NONE"),
]


T = TypeVar("T")


async def _with_basic_retries(
    call: Callable[[], Awaitable[T]],
    max_attempts: int = 3,
    base_delay_seconds: float = 1.0,
) -> T:
    """Run `call()` with exponential backoff on 429 / 500 / 503."""
    last_exc: Optional[BaseException] = None
    for attempt in range(max_attempts):
        try:
            return await call()
        except Exception as exc:
            last_exc = exc
            code = getattr(exc, "code", None)
            # Best-effort code extraction; genai exceptions vary.
            retriable = code in (429, 500, 503) or "429" in str(exc) or "503" in str(exc)
            if retriable and attempt < max_attempts - 1:
                delay = base_delay_seconds * (2 ** attempt)
                logger.warning("Gemini call failed (attempt %d/%d, retriable=%s): %s — retrying in %.1fs",
                               attempt + 1, max_attempts, retriable, exc, delay)
                await asyncio.sleep(delay)
                continue
            raise
    # Defensive — loop always either returns or raises.
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Unreachable")


def _build_config(system: Optional[str], max_tokens: Optional[int]) -> types.GenerateContentConfig:
    kw: dict = {"safety_settings": _SAFETY_BLOCK_NONE}
    if max_tokens is not None:
        kw["max_output_tokens"] = int(max_tokens)
    if system:
        kw["system_instruction"] = system
    return types.GenerateContentConfig(**kw)


async def gemini_text(
    prompt: str,
    system: Optional[str] = None,
    max_tokens: Optional[int] = None,
    model: str = GEMINI_MODEL_DEFAULT,
) -> str:
    """Single-prompt text generation. Returns the model's text reply (stripped)."""
    client = _get_client()
    config = _build_config(system, max_tokens)

    async def _call():
        return await client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=config,
        )

    resp = await _with_basic_retries(_call)
    text = getattr(resp, "text", None)
    return text.strip() if isinstance(text, str) else ""


async def gemini_text_with_file(
    prompt: str,
    file_bytes: bytes,
    mime_type: str,
    system: Optional[str] = None,
    max_tokens: Optional[int] = None,
    model: str = GEMINI_MODEL_DEFAULT,
) -> str:
    """Prompt + inline binary (PDF / image). Returns the model's text reply (stripped)."""
    return await gemini_text_with_files(
        prompt=prompt,
        files=[(file_bytes, mime_type)],
        system=system,
        max_tokens=max_tokens,
        model=model,
    )


async def gemini_text_with_files(
    prompt: str,
    files: list,  # list[tuple[bytes, str]] — (file_bytes, mime_type) pairs
    system: Optional[str] = None,
    max_tokens: Optional[int] = None,
    model: str = GEMINI_MODEL_DEFAULT,
) -> str:
    """Prompt + multiple inline binaries (e.g. front + back of a card)."""
    client = _get_client()
    config = _build_config(system, max_tokens)
    contents = [types.Part.from_bytes(data=b, mime_type=m) for (b, m) in files]
    contents.append(types.Part.from_text(text=prompt))

    async def _call():
        return await client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )

    resp = await _with_basic_retries(_call)
    text = getattr(resp, "text", None)
    return text.strip() if isinstance(text, str) else ""
