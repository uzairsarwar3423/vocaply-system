"""
tests/test_health.py
─────────────────────
Tests for /health and /ready endpoints.

TESTS:
  - /health always returns 200 regardless of dependency state
  - /ready returns 200 when all mocked deps return True
  - /ready returns 503 when any dep returns False (per-dependency breakdown verified)
  - /ready requires X-Internal-Service-Key (returns 401 without it)
  - /ready response always includes "checks" breakdown dict
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


class TestHealthEndpoint:
    """GET /health — liveness probe."""

    async def test_health_always_200(self, client: AsyncClient) -> None:
        """Liveness must return 200 regardless of dependency state."""
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    async def test_health_no_auth_required(self, client: AsyncClient) -> None:
        """Liveness is EXEMPT from auth — orchestrators need no service key."""
        # No auth headers at all
        response = await client.get("/health")
        assert response.status_code == 200

    async def test_health_independent_of_mongo_failure(
        self, client: AsyncClient, mock_mongo_client: AsyncMock
    ) -> None:
        """Liveness must succeed even when MongoDB is down."""
        mock_mongo_client.ping.return_value = False

        response = await client.get("/health")
        assert response.status_code == 200


class TestReadyEndpoint:
    """GET /ready — readiness probe."""

    async def test_ready_requires_auth(self, client: AsyncClient) -> None:
        """Missing X-Internal-Service-Key must return 401."""
        response = await client.get("/ready")
        assert response.status_code == 401

        body = response.json()
        assert "error_code" in body
        assert body["error_code"] == "INTERNAL_AUTH_ERROR"
        assert "request_id" in body

    async def test_ready_returns_200_when_all_healthy(
        self,
        client: AsyncClient,
        auth_headers: dict,
        mock_mongo_client: AsyncMock,
        mock_redis_client: AsyncMock,
    ) -> None:
        """All dependencies healthy → 200 with status=ready."""
        mock_mongo_client.ping.return_value = True
        mock_redis_client.ping.return_value = True

        with patch(
            "src.api.routes.health._check_gemini_reachability",
            new_callable=AsyncMock,
            return_value=True,
        ):
            response = await client.get("/ready", headers=auth_headers)

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ready"
        assert body["checks"]["mongodb"] is True
        assert body["checks"]["redis"] is True
        assert body["checks"]["gemini"] is True

    async def test_ready_returns_503_when_mongo_down(
        self,
        client: AsyncClient,
        auth_headers: dict,
        mock_mongo_client: AsyncMock,
        mock_redis_client: AsyncMock,
    ) -> None:
        """MongoDB down → 503, checks.mongodb == False, others accurately reported."""
        mock_mongo_client.ping.return_value = False
        mock_redis_client.ping.return_value = True

        with patch(
            "src.api.routes.health._check_gemini_reachability",
            new_callable=AsyncMock,
            return_value=True,
        ):
            response = await client.get("/ready", headers=auth_headers)

        assert response.status_code == 503
        body = response.json()
        assert body["status"] == "not_ready"
        assert body["checks"]["mongodb"] is False
        assert body["checks"]["redis"] is True
        assert body["checks"]["gemini"] is True

    async def test_ready_returns_503_when_redis_down(
        self,
        client: AsyncClient,
        auth_headers: dict,
        mock_mongo_client: AsyncMock,
        mock_redis_client: AsyncMock,
    ) -> None:
        """Redis down → 503, checks.redis == False."""
        mock_mongo_client.ping.return_value = True
        mock_redis_client.ping.return_value = False

        with patch(
            "src.api.routes.health._check_gemini_reachability",
            new_callable=AsyncMock,
            return_value=True,
        ):
            response = await client.get("/ready", headers=auth_headers)

        assert response.status_code == 503
        body = response.json()
        assert body["checks"]["redis"] is False
        assert body["checks"]["mongodb"] is True

    async def test_ready_returns_503_when_gemini_down(
        self,
        client: AsyncClient,
        auth_headers: dict,
        mock_mongo_client: AsyncMock,
        mock_redis_client: AsyncMock,
    ) -> None:
        """Gemini unreachable → 503, checks.gemini == False."""
        mock_mongo_client.ping.return_value = True
        mock_redis_client.ping.return_value = True

        with patch(
            "src.api.routes.health._check_gemini_reachability",
            new_callable=AsyncMock,
            return_value=False,  # Gemini down
        ):
            response = await client.get("/ready", headers=auth_headers)

        assert response.status_code == 503
        body = response.json()
        assert body["checks"]["gemini"] is False
        assert body["checks"]["mongodb"] is True
        assert body["checks"]["redis"] is True

    async def test_ready_with_invalid_key_returns_401(
        self, client: AsyncClient
    ) -> None:
        """Wrong X-Internal-Service-Key → 401, never 200."""
        response = await client.get(
            "/ready",
            headers={"X-Internal-Service-Key": "wrong-key-entirely"},
        )
        assert response.status_code == 401

    async def test_ready_response_always_has_request_id(
        self,
        client: AsyncClient,
    ) -> None:
        """401 response must include request_id in ErrorEnvelope."""
        response = await client.get("/ready")
        body = response.json()
        assert "request_id" in body
        assert body["request_id"]  # Non-empty
