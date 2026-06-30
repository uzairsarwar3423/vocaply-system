"""
tests/test_middleware.py
────────────────────────
Tests for middleware behavior:
  - request_id is generated when absent
  - request_id is propagated when present on inbound request
  - error_handler maps AIPipelineError subclass to correct ErrorEnvelope + status code
  - catch-all handler never includes raw traceback in response body
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.models.exceptions import (
    AIPipelineError,
    GeminiNonRetryableError,
    GeminiRateLimitExhaustedError,
    GeminiTimeoutError,
    InternalAuthError,
)


# ─── Request ID Middleware Tests ───────────────────────────────────────────────


class TestRequestIdMiddleware:
    async def test_request_id_generated_when_absent(
        self, client: AsyncClient
    ) -> None:
        """Missing X-Request-Id header → service generates a fresh ID."""
        response = await client.get("/health")
        assert "x-request-id" in response.headers
        generated_id = response.headers["x-request-id"]
        assert len(generated_id) > 0
        assert generated_id.startswith("py-")  # Our generated prefix

    async def test_request_id_propagated_when_present(
        self, client: AsyncClient
    ) -> None:
        """Inbound X-Request-Id is echoed back (propagated from Node.js caller)."""
        caller_id = "req_abc123def456"
        response = await client.get(
            "/health",
            headers={"X-Request-Id": caller_id},
        )
        assert response.headers["x-request-id"] == caller_id

    async def test_different_requests_get_different_ids(
        self, client: AsyncClient
    ) -> None:
        """Two requests without X-Request-Id get different generated IDs."""
        r1 = await client.get("/health")
        r2 = await client.get("/health")
        assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


# ─── Error Handler Tests ───────────────────────────────────────────────────────


class TestErrorHandler:
    """Test that the error handlers produce correct ErrorEnvelope responses."""

    async def test_internal_auth_error_maps_to_401(
        self, client: AsyncClient
    ) -> None:
        """InternalAuthError → 401 with INTERNAL_AUTH_ERROR error_code."""
        # /ready without auth key triggers InternalAuthError
        response = await client.get("/ready")
        assert response.status_code == 401
        body = response.json()
        assert body["error_code"] == "INTERNAL_AUTH_ERROR"
        assert "request_id" in body
        assert body["request_id"]

    async def test_error_envelope_never_includes_raw_traceback(
        self, client: AsyncClient
    ) -> None:
        """Catch-all error handler: response body must never contain 'Traceback' string."""
        from fastapi import FastAPI
        from starlette.testclient import TestClient
        from src.middleware.request_id import RequestIdMiddleware
        from src.middleware.error_handler import unhandled_exception_handler

        mini_app = FastAPI()
        mini_app.add_middleware(RequestIdMiddleware)
        mini_app.add_exception_handler(Exception, unhandled_exception_handler)

        @mini_app.get("/boom")
        async def boom() -> None:
            raise RuntimeError("Internal secret: /home/vocaply/app/database.py line 42")

        # raise_server_exceptions=False: Starlette TestClient lets exception handlers
        # process the error and return the mapped response instead of re-raising.
        # This is the correct API for testing exception handler responses.
        with TestClient(mini_app, raise_server_exceptions=False) as sync_client:
            response = sync_client.get("/boom")

        assert response.status_code == 500
        body = response.json()

        # SECURITY: No traceback in response body
        response_text = response.text
        assert "Traceback" not in response_text
        assert "traceback" not in response_text
        assert "/home/vocaply" not in response_text  # No file paths
        assert "Internal secret" not in response_text  # No internal details

        # Must still be a valid ErrorEnvelope
        assert "error_code" in body
        assert "message" in body
        assert "request_id" in body
        assert body["error_code"] == "INTERNAL_ERROR"

    async def test_ai_pipeline_error_uses_typed_status_code(
        self, client: AsyncClient
    ) -> None:
        """AIPipelineError subclasses map to their declared http_status."""
        from fastapi import FastAPI
        from src.middleware.request_id import RequestIdMiddleware
        from src.middleware.error_handler import ai_pipeline_error_handler, unhandled_exception_handler

        mini_app = FastAPI()
        mini_app.add_middleware(RequestIdMiddleware)
        mini_app.add_exception_handler(AIPipelineError, ai_pipeline_error_handler)  # type: ignore
        mini_app.add_exception_handler(Exception, unhandled_exception_handler)

        @mini_app.get("/rate-limited")
        async def rate_limited_route():
            raise GeminiRateLimitExhaustedError(
                "Rate limit hit",
                task_type=None,
                model_tier=None,
                attempt_count=3,
            )

        async with AsyncClient(
            transport=ASGITransport(app=mini_app),
            base_url="http://testserver",
        ) as mini_client:
            response = await mini_client.get("/rate-limited")

        assert response.status_code == 429  # GeminiRateLimitExhaustedError.http_status
        body = response.json()
        assert body["error_code"] == "GEMINI_RATE_LIMIT_EXHAUSTED"
