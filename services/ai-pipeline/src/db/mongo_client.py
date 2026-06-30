"""
db/mongo_client.py
──────────────────
Motor (async MongoDB) client singleton.

PRINCIPAL DESIGN:
- connect()/disconnect() called exactly once from main.py's lifespan.
- ping() is what /ready calls — cheap, bounded, never a full query.
- Pool sizing from settings, never library defaults.
- DependencyUnavailableError on boot failure — process refuses to start
  if Mongo is unreachable (fail-fast over silent degradation).
"""

from __future__ import annotations

import asyncio

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from src.config.logging import get_logger
from src.config.settings import Settings, get_settings
from src.models.exceptions import DependencyUnavailableError

log = get_logger(__name__)

_PING_TIMEOUT_SECONDS = 5.0


class MongoClientWrapper:
    """Async MongoDB client — process singleton, lifespan-managed.

    Usage (from main.py lifespan):
        mongo = MongoClientWrapper()
        await mongo.connect()
        app.state.mongo = mongo
        yield
        await mongo.disconnect()
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client: AsyncIOMotorClient | None = None  # type: ignore[type-arg]
        self._db: AsyncIOMotorDatabase | None = None  # type: ignore[type-arg]

    async def connect(self) -> None:
        """Create the Motor client and verify connectivity.

        Raises DependencyUnavailableError if Mongo is unreachable.
        Called exactly once from FastAPI lifespan — never per-request.
        """
        log.info("mongo_connecting", url=self._settings.mongodb_url[:30] + "...")

        try:
            self._client = AsyncIOMotorClient(
                self._settings.mongodb_url,
                minPoolSize=self._settings.mongo_pool_min_size,
                maxPoolSize=self._settings.mongo_pool_max_size,
                # serverSelectionTimeoutMS: how long to wait before giving up
                serverSelectionTimeoutMS=int(_PING_TIMEOUT_SECONDS * 1000),
                connectTimeoutMS=int(_PING_TIMEOUT_SECONDS * 1000),
            )
            self._db = self._client[self._settings.mongodb_database]

            # Verify connectivity at startup — fail-fast
            await asyncio.wait_for(
                self._client.admin.command("ping"),
                timeout=_PING_TIMEOUT_SECONDS,
            )

            log.info(
                "mongo_connected",
                database=self._settings.mongodb_database,
                pool_min=self._settings.mongo_pool_min_size,
                pool_max=self._settings.mongo_pool_max_size,
            )

        except Exception as exc:
            raise DependencyUnavailableError(
                f"MongoDB unreachable at startup: {exc}",
                dependency="mongodb",
            ) from exc

    async def disconnect(self) -> None:
        """Close the Motor client gracefully. Called from lifespan shutdown."""
        if self._client is not None:
            self._client.close()
            log.info("mongo_disconnected")

    async def ping(self) -> bool:
        """Lightweight health check — called by /ready endpoint.

        Returns True if MongoDB responds to a ping within the timeout,
        False otherwise (never raises — /ready handles the bool).
        """
        if self._client is None:
            return False
        try:
            await asyncio.wait_for(
                self._client.admin.command("ping"),
                timeout=_PING_TIMEOUT_SECONDS,
            )
            return True
        except Exception:
            log.warning("mongo_ping_failed")
            return False

    @property
    def db(self) -> AsyncIOMotorDatabase:  # type: ignore[type-arg]
        """The configured database handle. Raises if not yet connected."""
        if self._db is None:
            raise RuntimeError("MongoClientWrapper.connect() has not been called")
        return self._db
