"""
tests/conftest.py
─────────────────
Shared pytest fixtures for all test modules.

FIXTURE PHILOSOPHY:
- All external dependencies are mocked — tests never touch real Gemini/Mongo/Redis.
- The app fixture uses dependency_overrides to inject test-safe singletons.
- httpx.AsyncClient is the recommended FastAPI test transport (ASGI, no real HTTP).
- Fixtures are designed to be composable — lower-level fixtures can be used
  independently without needing the full app stack.
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# ─── Test Settings ────────────────────────────────────────────────────────────

TEST_GEMINI_API_KEY = "test-gemini-api-key-000000000000000"
TEST_API_SHARED_SECRET = "test-shared-secret-for-internal-auth-32chars"
TEST_MONGODB_URL = "mongodb://localhost:27017"
TEST_REDIS_URL = "redis://localhost:6379"


@pytest.fixture(scope="session")
def test_env_vars(monkeypatch_session: pytest.MonkeyPatch) -> None:
    """Session-scoped env vars for all tests."""
    monkeypatch_session.setenv("GEMINI_API_KEY", TEST_GEMINI_API_KEY)
    monkeypatch_session.setenv("API_SHARED_SECRET", TEST_API_SHARED_SECRET)
    monkeypatch_session.setenv("MONGODB_URL", TEST_MONGODB_URL)
    monkeypatch_session.setenv("REDIS_URL", TEST_REDIS_URL)
    monkeypatch_session.setenv("ENVIRONMENT", "development")


@pytest.fixture
def test_settings():
    """Return a test-safe Settings instance with all required fields set."""
    from src.config.settings import Settings

    # Clear the lru_cache so tests get a fresh settings instance
    from src.config.settings import get_settings
    get_settings.cache_clear()

    return Settings(
        gemini_api_key=TEST_GEMINI_API_KEY,
        api_shared_secret=TEST_API_SHARED_SECRET,
        mongodb_url=TEST_MONGODB_URL,
        redis_url=TEST_REDIS_URL,
        environment="development",
        gemini_flash_model_name="gemini-2.0-flash",
        gemini_flash_lite_model_name="gemini-2.0-flash-lite",
        gemini_embedding_model_name="text-embedding-004",
        max_gemini_retries=2,
        gemini_timeout_seconds=5.0,
        gemini_max_concurrent_calls=5,
    )


# ─── Mock DB Clients ──────────────────────────────────────────────────────────


@pytest.fixture
def mock_mongo_client():
    """Mock MongoClientWrapper — ping() returns True by default."""
    mock = MagicMock()
    mock.ping = AsyncMock(return_value=True)
    mock.connect = AsyncMock()
    mock.disconnect = AsyncMock()
    return mock


@pytest.fixture
def mock_redis_client():
    """Mock RedisClientWrapper — ping() returns True by default."""
    mock = MagicMock()
    mock.ping = AsyncMock(return_value=True)
    mock.connect = AsyncMock()
    mock.disconnect = AsyncMock()
    return mock


# ─── Mock Gemini Client ───────────────────────────────────────────────────────


@pytest.fixture
def mock_gemini_client():
    """Mock GeminiClient — all methods return success by default."""
    mock = MagicMock()
    mock.generate_structured = AsyncMock()
    mock.generate_text = AsyncMock()
    mock.embed = AsyncMock()
    return mock


# ─── FastAPI Test App ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def app(
    test_settings,
    mock_mongo_client,
    mock_redis_client,
    mock_gemini_client,
):
    """FastAPI test app with mocked singletons on app.state.

    Lifespan is bypassed by setting up state directly — this prevents
    real network calls to Mongo/Redis/Gemini in tests.
    """
    from src.api.main import create_app
    from src.api.deps import get_settings_dep

    # Patch lifespan to avoid real connections
    with patch("src.api.main.MongoClientWrapper") as mock_mongo_cls, \
         patch("src.api.main.RedisClientWrapper") as mock_redis_cls, \
         patch("src.api.main.GeminiClient") as mock_gemini_cls:

        mock_mongo_cls.return_value = mock_mongo_client
        mock_redis_cls.return_value = mock_redis_client
        mock_gemini_cls.return_value = mock_gemini_client

        application = create_app(settings_override=test_settings)

        # Override settings dependency
        application.dependency_overrides[get_settings_dep] = lambda: test_settings

        # Manually set app.state (lifespan is mocked)
        application.state.mongo_client = mock_mongo_client
        application.state.redis_client = mock_redis_client
        application.state.gemini_client = mock_gemini_client

        yield application

        application.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    """httpx AsyncClient configured for ASGI transport (no real HTTP)."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac


@pytest.fixture
def auth_headers():
    """Headers with valid X-Internal-Service-Key for protected endpoints."""
    return {"X-Internal-Service-Key": TEST_API_SHARED_SECRET}
