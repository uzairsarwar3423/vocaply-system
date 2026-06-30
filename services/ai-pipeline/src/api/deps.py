"""
api/deps.py
───────────
FastAPI Depends() providers — singleton access and internal auth.

PRINCIPAL DESIGN:
- Each provider retrieves from app.state (stashed at lifespan startup),
  not from a global mutable module variable. This is the correct FastAPI
  pattern for singleton sharing across requests.
- verify_internal_service_key uses secrets.compare_digest (constant-time)
  to prevent timing side-channel attacks on the shared secret — same
  discipline already applied to webhook signature verification on Node.js side.
- /health is exempt from auth (liveness must be checkable by orchestrators
  with no knowledge of the shared secret). /ready IS protected.
"""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header, Request

from src.config.settings import Settings, get_settings
from src.db.mongo_client import MongoClientWrapper
from src.db.redis_client import RedisClientWrapper
from src.models.exceptions import InternalAuthError
from src.services.gemini_client import GeminiClient


# ─── Settings Provider ────────────────────────────────────────────────────────


def get_settings_dep() -> Settings:
    """Returns the singleton Settings instance.

    Thin wrapper around get_settings() to allow
    `app.dependency_overrides[get_settings_dep]` in tests.
    """
    return get_settings()


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


# ─── Client Providers ─────────────────────────────────────────────────────────


def get_gemini_client(request: Request) -> GeminiClient:
    """Returns the process-singleton GeminiClient from app.state."""
    return request.app.state.gemini_client  # type: ignore[no-any-return]


def get_mongo_client(request: Request) -> MongoClientWrapper:
    """Returns the process-singleton MongoClientWrapper from app.state."""
    return request.app.state.mongo_client  # type: ignore[no-any-return]


def get_redis_client(request: Request) -> RedisClientWrapper:
    """Returns the process-singleton RedisClientWrapper from app.state."""
    return request.app.state.redis_client  # type: ignore[no-any-return]


GeminiDep = Annotated[GeminiClient, Depends(get_gemini_client)]
MongoDep = Annotated[MongoClientWrapper, Depends(get_mongo_client)]
RedisDep = Annotated[RedisClientWrapper, Depends(get_redis_client)]


# ─── Internal Service Auth ────────────────────────────────────────────────────


def verify_internal_service_key(
    x_internal_service_key: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings_dep),
) -> None:
    """Verify the inbound X-Internal-Service-Key header.

    Uses secrets.compare_digest (constant-time) to prevent timing attacks
    that could leak the shared secret byte-by-byte via response latency.

    Add this as a dependency to any route that should be protected:
        @router.get("/ready", dependencies=[Depends(verify_internal_service_key)])

    EXEMPT: /health (liveness check — must be reachable by orchestrators
    with no auth header). /ready IS protected.

    Raises:
        InternalAuthError: If header is absent or does not match.
    """
    if x_internal_service_key is None:
        raise InternalAuthError("Missing X-Internal-Service-Key header")

    expected = settings.api_shared_secret.get_secret_value()

    # Constant-time comparison — prevents timing side-channel
    if not secrets.compare_digest(
        x_internal_service_key.encode("utf-8"),
        expected.encode("utf-8"),
    ):
        raise InternalAuthError("Invalid X-Internal-Service-Key")


InternalAuthDep = Annotated[None, Depends(verify_internal_service_key)]
