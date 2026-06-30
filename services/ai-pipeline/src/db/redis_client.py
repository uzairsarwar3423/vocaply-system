"""
db/redis_client.py
──────────────────
redis.asyncio client singleton.

PRINCIPAL DESIGN: Same pattern as mongo_client.py — lifespan-managed,
fail-fast at boot, pool-sized from settings, ping() for /ready.
"""

from __future__ import annotations

import redis.asyncio as aioredis

from src.config.logging import get_logger
from src.config.settings import Settings, get_settings
from src.models.exceptions import DependencyUnavailableError

log = get_logger(__name__)

_PING_TIMEOUT_SECONDS = 5.0


class RedisClientWrapper:
    """Async Redis client — process singleton, lifespan-managed.

    Usage (from main.py lifespan):
        redis_wrapper = RedisClientWrapper()
        await redis_wrapper.connect()
        app.state.redis = redis_wrapper
        yield
        await redis_wrapper.disconnect()
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client: aioredis.Redis | None = None  # type: ignore[type-arg]

    async def connect(self) -> None:
        """Create the Redis connection pool and verify connectivity.

        Raises DependencyUnavailableError if Redis is unreachable.
        Called exactly once from FastAPI lifespan.
        """
        log.info("redis_connecting", url=self._settings.redis_url[:30] + "...")

        try:
            self._client = aioredis.from_url(
                self._settings.redis_url,
                max_connections=self._settings.redis_pool_max_connections,
                decode_responses=False,  # Raw bytes — callers handle encoding
                socket_connect_timeout=_PING_TIMEOUT_SECONDS,
                socket_timeout=_PING_TIMEOUT_SECONDS,
            )

            # Verify connectivity at startup
            await self._client.ping()

            log.info(
                "redis_connected",
                pool_max=self._settings.redis_pool_max_connections,
            )

        except Exception as exc:
            raise DependencyUnavailableError(
                f"Redis unreachable at startup: {exc}",
                dependency="redis",
            ) from exc

    async def disconnect(self) -> None:
        """Close the Redis connection pool gracefully."""
        if self._client is not None:
            await self._client.aclose()
            log.info("redis_disconnected")

    async def ping(self) -> bool:
        """Lightweight health check for /ready endpoint.

        Returns True if Redis responds, False otherwise (never raises).
        """
        if self._client is None:
            return False
        try:
            result = await self._client.ping()
            return bool(result)
        except Exception:
            log.warning("redis_ping_failed")
            return False

    @property
    def client(self) -> aioredis.Redis:  # type: ignore[type-arg]
        """The Redis client handle. Raises if not yet connected."""
        if self._client is None:
            raise RuntimeError("RedisClientWrapper.connect() has not been called")
        return self._client
