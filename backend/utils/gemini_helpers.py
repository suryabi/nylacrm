"""Gemini helpers — routed through the Emergent Universal Key (emergentintegrations).

Same public API as the previous direct-Gemini implementation so all call sites
keep working unchanged:
  - `gemini_text(prompt, system?, max_tokens?, model?)` -> str
  - `gemini_text_with_file(prompt, file_bytes, mime_type, system?, model?)` -> str
  - `gemini_text_with_files(prompt, files, system?, max_tokens?, model?)` -> str

All are async and apply basic exponential backoff on 429/500/503.
"""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import uuid
from typing import Awaitable, Callable, Optional, TypeVar

from dotenv import load_dotenv

load_dotenv()

from emergentintegrations.llm.chat import (  # noqa: E402
    FileContentWithMimeType,
    LlmChat,
    UserMessage,
)

logger = logging.getLogger(__name__)

GEMINI_MODEL_DEFAULT = "gemini-2.5-flash"

_api_key = os.environ.get("EMERGENT_LLM_KEY")
if not _api_key:
    logger.warning(
        "EMERGENT_LLM_KEY is not set. Gemini helper calls will fail until it is configured."
    )

_MIME_SUFFIX = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "text/plain": ".txt",
    "text/csv": ".csv",
}


def _build_chat(system: Optional[str], max_tokens: Optional[int], model: str) -> LlmChat:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError(
            "EMERGENT_LLM_KEY environment variable is not set. "
            "Please configure it in backend/.env."
        )
    chat = LlmChat(
        api_key=key,
        session_id=f"gemini-helper-{uuid.uuid4()}",
        system_message=system or "You are a helpful assistant.",
    ).with_model("gemini", model)
    if max_tokens is not None:
        chat = chat.with_params(max_tokens=int(max_tokens))
    return chat


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
            retriable = any(code in str(exc) for code in ("429", "500", "503"))
            if retriable and attempt < max_attempts - 1:
                delay = base_delay_seconds * (2 ** attempt)
                logger.warning("Gemini call failed (attempt %d/%d, retriable=%s): %s — retrying in %.1fs",
                               attempt + 1, max_attempts, retriable, exc, delay)
                await asyncio.sleep(delay)
                continue
            raise
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Unreachable")


async def gemini_text(
    prompt: str,
    system: Optional[str] = None,
    max_tokens: Optional[int] = None,
    model: str = GEMINI_MODEL_DEFAULT,
) -> str:
    """Single-prompt text generation. Returns the model's text reply (stripped)."""
    async def _call():
        chat = _build_chat(system, max_tokens, model)
        return await chat.send_message(UserMessage(text=prompt))

    text = await _with_basic_retries(_call)
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
    tmp_paths: list[str] = []
    try:
        attachments = []
        for (file_bytes, mime) in files:
            suffix = _MIME_SUFFIX.get(mime, "")
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(file_bytes)
                tmp_paths.append(tmp.name)
            attachments.append(FileContentWithMimeType(file_path=tmp_paths[-1], mime_type=mime))

        async def _call():
            chat = _build_chat(system, max_tokens, model)
            return await chat.send_message(UserMessage(text=prompt, file_contents=attachments))

        text = await _with_basic_retries(_call)
        return text.strip() if isinstance(text, str) else ""
    finally:
        for p in tmp_paths:
            try:
                os.unlink(p)
            except OSError:
                pass
