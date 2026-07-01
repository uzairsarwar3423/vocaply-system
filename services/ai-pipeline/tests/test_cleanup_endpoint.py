"""
tests/test_cleanup_endpoint.py
──────────────────────────────
API tests for POST /api/v1/transcripts/cleanup.

Coverage per the Day 47 DoD checklist:
  [x] Valid request with standup fixture → 200, validates against CleanupResult
  [x] Missing X-Internal-Service-Key → 401, ErrorEnvelope shape
  [x] Malformed raw_transcript (wrong type) → 422 with Pydantic detail
  [x] request_id present and consistent
"""

from __future__ import annotations

import json
import pathlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.main import create_app
from src.api.deps import get_settings_dep
from src.config.settings import Settings

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"


# ─── Setup ────────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_settings() -> Settings:
    """Test-specific settings to avoid relying on .env."""
    return Settings(
        environment="development",
        openrouter_api_key="sk-or-test-key",
        api_shared_secret="test-secret-key-32-chars-long-12345",
        mongodb_url="mongodb://localhost:27017",
        redis_url="redis://localhost:6379",
    )


@pytest.fixture
def app(mock_settings: Settings):
    """FastAPI app instance with settings overridden."""
    # We don't want to run the real lifespan (which tries to connect to Mongo/Redis)
    # in unit tests, so we patch the lifespan.
    app = create_app(settings_override=mock_settings)
    app.router.lifespan_context = MagicMock()
    app.state.gemini_client = MagicMock()
    app.dependency_overrides[get_settings_dep] = lambda: mock_settings
    return app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


@pytest.fixture
def valid_payload() -> dict:
    raw_turns = json.loads((FIXTURES_DIR / "raw_transcript_standup_fragmented.json").read_text())
    participant_map = json.loads((FIXTURES_DIR / "participant_map_standup.json").read_text())
    return {
        "meeting_id": "meeting-001",
        "team_id": "team-001",
        "raw_transcript": raw_turns,
        "participants": participant_map,
    }


@pytest.fixture
def auth_headers(mock_settings: Settings) -> dict[str, str]:
    return {"X-Internal-Service-Key": mock_settings.api_shared_secret.get_secret_value()}


# ─── Tests ────────────────────────────────────────────────────────────────────


def test_cleanup_endpoint_success(client: TestClient, valid_payload: dict, auth_headers: dict[str, str]) -> None:
    """Valid request → 200 OK, matches CleanupResult shape."""
    # Mock the orchestrator completely to avoid Gemini/Mongo/Redis logic
    mock_result = {
        "meeting_id": "meeting-001",
        "team_id": "team-001",
        "cleaned_transcript": [],
        "metadata": {
            "model_version": "test-model",
            "prompt_version": "v1",
            "total_fillers_removed": 5,
            "turns_before_merge": 12,
            "turns_after_merge": 8,
            "batches_total": 1,
            "batches_failed": 0,
            "processing_time_ms": 100.5,
            "gemini_cost": {
                "input_tokens": 100,
                "output_tokens": 50,
                "model_tier": "flash_lite",
                "model_name": "test",
                "estimated_cost_usd": 0.001
            }
        }
    }

    with patch(
        "src.api.routes.cleanup.clean_transcript",
        new_callable=AsyncMock,
        return_value=mock_result,
    ):
        response = client.post(
            "/api/v1/transcripts/cleanup",
            json=valid_payload,
            headers=auth_headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["meeting_id"] == "meeting-001"
    assert "metadata" in data
    assert "cleaned_transcript" in data
    # Ensure request_id is present
    assert "x-request-id" in response.headers


def test_missing_auth_header_returns_401(client: TestClient, valid_payload: dict) -> None:
    """Missing X-Internal-Service-Key → 401 Unauthorized with ErrorEnvelope shape."""
    response = client.post(
        "/api/v1/transcripts/cleanup",
        json=valid_payload,
        # No auth headers
    )

    assert response.status_code == 401
    data = response.json()
    # verify ErrorEnvelope shape
    assert data["error_code"] == "INTERNAL_AUTH_ERROR"
    assert "message" in data
    assert "request_id" in data


def test_invalid_auth_header_returns_401(client: TestClient, valid_payload: dict) -> None:
    """Wrong X-Internal-Service-Key → 401 Unauthorized."""
    response = client.post(
        "/api/v1/transcripts/cleanup",
        json=valid_payload,
        headers={"X-Internal-Service-Key": "wrong-secret"},
    )
    assert response.status_code == 401


def test_malformed_payload_returns_422(client: TestClient, auth_headers: dict[str, str]) -> None:
    """Malformed payload (wrong field type) → 422 Unprocessable Entity."""
    bad_payload = {
        "meeting_id": "meeting-001",
        "team_id": "team-001",
        "raw_transcript": "not-a-list",  # Should be a list
        "participants": {},
    }

    response = client.post(
        "/api/v1/transcripts/cleanup",
        json=bad_payload,
        headers=auth_headers,
    )

    assert response.status_code == 422
    data = response.json()
    # FastAPI default 422 format
    assert "detail" in data
    # Must specify the field that failed validation
    assert any(err["loc"] == ["body", "raw_transcript"] for err in data["detail"])


def test_request_id_consistency(client: TestClient, valid_payload: dict, auth_headers: dict[str, str]) -> None:
    """request_id from Day 46's middleware is present and consistent."""
    with patch(
        "src.api.routes.cleanup.clean_transcript",
        new_callable=AsyncMock,
        return_value={
            "meeting_id": "m", "team_id": "t", "cleaned_transcript": [],
            "metadata": {
                "model_version": "test", "prompt_version": "v1", "total_fillers_removed": 0,
                "turns_before_merge": 0, "turns_after_merge": 0, "batches_total": 0, "batches_failed": 0,
                "processing_time_ms": 0.0, "gemini_cost": {
                    "input_tokens": 0, "output_tokens": 0, "model_tier": "flash_lite",
                    "model_name": "test", "estimated_cost_usd": 0.0
                }
            }
        },
    ):
        # Supply a specific request ID
        req_headers = auth_headers.copy()
        req_headers["x-request-id"] = "req-test-123"

        response = client.post(
            "/api/v1/transcripts/cleanup",
            json=valid_payload,
            headers=req_headers,
        )

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "req-test-123"
