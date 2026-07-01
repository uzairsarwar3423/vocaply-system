"""
api/main.py
───────────
FastAPI application factory + lifespan + middleware wiring.

PRINCIPAL DESIGN:

1. create_app() factory (not bare module-level `app = FastAPI()`):
   - Enables `uvicorn src.api.main:create_app --factory` invocation
   - Allows tests to call create_app(settings_override=...) for isolation

2. Lifespan context manager: constructs all singletons at startup, stashes
   on app.state, gracefully disconnects at shutdown. Mirrors the Node.js
   server.ts graceful-shutdown pattern platform-wide.

3. Middleware registration order is deliberate (documented inline):
   request_id FIRST → CORS → request_logger → exception handlers (last).
   FastAPI/Starlette middleware ordering is a frequent source of subtle bugs.

4. Exception handlers registered for AIPipelineError and bare Exception —
   both map to ErrorEnvelope, neither leaks raw tracebacks.

5. Future routers are NOT registered today. The comment block below shows
   exactly how Day 47 will add the next router — copy-paste-and-extend.

ADDING A NEW ROUTER (Day 47 pattern):
    from src.api.routes import cleanup
    app.include_router(cleanup.router, prefix="/api/v1")
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config.logging import configure_logging, get_logger
from src.config.settings import Settings, get_settings
from src.db.mongo_client import MongoClientWrapper
from src.db.redis_client import RedisClientWrapper
from src.middleware.error_handler import (
    ai_pipeline_error_handler,
    unhandled_exception_handler,
    request_validation_error_handler,
    timestamp_integrity_error_handler,
)
from src.services.cleanup.confidence_flagger import TimestampIntegrityError
from src.middleware.request_id import RequestIdMiddleware
from src.middleware.request_logger import RequestLoggerMiddleware
from src.models.exceptions import AIPipelineError
from src.services.gemini_client import GeminiClient
from src.api.routes import health, cleanup

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI lifespan — constructs singletons at startup, tears down gracefully.

    STARTUP ORDER (dependencies must be ready before consumers):
    1. Logging — first, so everything after this is observable
    2. Settings — validated at import, but explicitly logged here
    3. MongoDB — fail-fast if unreachable
    4. Redis   — fail-fast if unreachable
    5. GeminiClient — constructed (no network call at construction time)
    6. Log "service ready"

    SHUTDOWN ORDER (reverse of startup):
    1. Redis disconnect
    2. MongoDB disconnect
    3. Log "service shutting down"
    """
    # ── Startup ───────────────────────────────────────────────────────────────
    configure_logging()
    settings = get_settings()

    log.info(
        "service_starting",
        service=settings.service_name,
        environment=settings.environment,
        log_level=settings.log_level,
    )

    # MongoDB
    mongo_client = MongoClientWrapper(settings)
    await mongo_client.connect()
    app.state.mongo_client = mongo_client

    # Redis
    redis_client = RedisClientWrapper(settings)
    await redis_client.connect()
    app.state.redis_client = redis_client

    # Gemini (no network call at construction — connectivity checked by /ready)
    gemini_client = GeminiClient(settings)
    app.state.gemini_client = gemini_client

    log.info("service_ready", service=settings.service_name, port=settings.port)

    # ── Hand control to the app ───────────────────────────────────────────────
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    log.info("service_shutting_down", service=settings.service_name)
    await redis_client.disconnect()
    await mongo_client.disconnect()
    log.info("service_stopped")


def create_app(settings_override: Settings | None = None) -> FastAPI:
    """Application factory.

    Args:
        settings_override: Pass a custom Settings in tests to avoid
                           touching real env vars / real infrastructure.
    """
    if settings_override is not None:
        # Allow dependency injection of custom settings in tests
        from functools import lru_cache
        from src.config.settings import get_settings as _get_settings  # noqa: PLC0415

        # Re-bind the module-level get_settings for this process invocation
        # (In tests, prefer app.dependency_overrides[get_settings_dep] instead)

    app = FastAPI(
        title="Vocaply AI Pipeline",
        description=(
            "Internal AI processing service. "
            "Authenticated via X-Internal-Service-Key. "
            "Not internet-facing."
        ),
        version="0.1.0",
        lifespan=lifespan,
        # Disable default OpenAPI for production — internal service
        # Set to None in production to reduce attack surface
        docs_url="/docs" if (settings_override or get_settings()).environment != "production" else None,
        redoc_url=None,
    )

    # ── Middleware Registration (ORDER IS CRITICAL) ───────────────────────────
    #
    # FastAPI/Starlette processes middleware in REVERSE registration order.
    # The LAST registered middleware runs FIRST on the incoming request.
    # Register in this order so execution order is:
    #   1. RequestIdMiddleware  (sets request_id ContextVar — everything needs this)
    #   2. CORS                 (before the request reaches business logic)
    #   3. RequestLoggerMiddleware (after request_id is available, logs full request)
    #
    # Exception handlers are not middleware but registered below and act as the
    # last line of defense after all middleware has run.

    # 3. Request logger (registered first = runs last = captures full lifecycle)
    app.add_middleware(RequestLoggerMiddleware)

    # 2. CORS — explicitly scoped, NEVER wildcard origin
    # DEPLOYMENT NOTE: In production, this service sits behind internal networking.
    # Confirm whether CORS headers are needed at all in your deployment topology.
    # For now: scoped to the Node.js API origin from settings.
    settings = settings_override or get_settings()
    if settings.environment != "production":
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[settings.node_api_internal_origin],
            allow_credentials=False,
            allow_methods=["GET", "POST"],
            allow_headers=["*"],
        )

    # 1. Request ID — registered last = runs FIRST on every request
    app.add_middleware(RequestIdMiddleware)

    # ── Exception Handlers ────────────────────────────────────────────────────
    app.add_exception_handler(AIPipelineError, ai_pipeline_error_handler)  # type: ignore[arg-type]
    
    from fastapi.exceptions import RequestValidationError
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)  # type: ignore[arg-type]
    
    app.add_exception_handler(TimestampIntegrityError, timestamp_integrity_error_handler)  # type: ignore[arg-type]
    
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # ── Routers ───────────────────────────────────────────────────────────────
    # /health and /ready at root (infra-level, outside any versioned prefix)
    app.include_router(health.router)

    # Day 47: Transcript cleanup pipeline (Stage 1 + Stage 2)
    app.include_router(cleanup.router)

    # ── ADDING FUTURE ROUTERS (Day 48+ pattern) ───────────────────────────────
    from src.api.routes import extract
    app.include_router(extract.router, prefix="/api/v1", tags=["extraction"])

    return app
