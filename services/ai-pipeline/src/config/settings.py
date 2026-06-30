"""
config/settings.py
──────────────────
Pydantic BaseSettings — single source of truth for all environment variables.

PRINCIPAL DESIGN DECISIONS:

1. SecretStr for all sensitive values: prevents accidental leakage into
   repr/str/logs. `logger.info("settings", **settings.model_dump())` renders
   secret fields as "**********" rather than live credentials.

2. Import-time fail-fast: get_settings() is called once at module import,
   so `python -c "from src.config.settings import settings"` either succeeds
   or crashes loudly. CI runs this as a pre-flight check before deploy.

3. lru_cache pattern (not bare module-level Settings()): allows
   `app.dependency_overrides` in tests to inject a test-specific Settings
   instance without monkeypatching the module. FastAPI-idiomatic.

4. Model names in settings (not hardcoded constants): a model rename/retirement
   is an env var change in deployment config, not a code deploy.

5. Pool sizes in settings (not library defaults): default pool sizes are
   rarely correctly tuned for a specific deployment's concurrency profile.
   Pool_max_size × replica_count must stay under each backing service's
   connection ceiling — documented in README.md.
"""

from __future__ import annotations

import secrets
from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Complete environment variable inventory for the AI pipeline service.

    All required fields have no default → missing vars fail at import time
    with a clear Pydantic ValidationError naming the missing field.
    All optional fields have sensible production-safe defaults.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Ignore unknown env vars — don't crash on unrelated vars
    )

    # ── Service Identity ─────────────────────────────────────────────────────
    environment: Literal["development", "staging", "production"] = "development"
    service_name: str = "ai-pipeline"
    port: int = Field(default=8001, ge=1, le=65535)

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # ── OpenRouter API ────────────────────────────────────────────────────────
    # OpenRouter provides an OpenAI-compatible endpoint that proxies Gemini,
    # Claude, GPT, etc. through a single API key.
    # SecretStr: never appears in repr(), logs, or debug output
    openrouter_api_key: SecretStr
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Site info sent to OpenRouter — shown in their dashboard for attribution
    # and helps with their rate-limit priority queue.
    openrouter_site_url: str = "https://vocaply.com"
    openrouter_site_name: str = "Vocaply"

    # Model names — OpenRouter format: "provider/model-name"
    # A model swap is an env var change, not a code deploy.
    gemini_flash_model_name: str = "google/gemini-2.0-flash"
    gemini_flash_lite_model_name: str = "google/gemini-2.0-flash-lite"
    gemini_embedding_model_name: str = "google/text-embedding-004"

    # Resilience knobs
    max_gemini_retries: int = Field(default=3, ge=1, le=10)
    gemini_timeout_seconds: float = Field(default=30.0, gt=0)

    # Concurrency: process-local semaphore bound.
    # NOTE: global concurrency = gemini_max_concurrent_calls × replica_count.
    # At high replica counts, consider replacing with a Redis-backed token bucket.
    # This seam (the semaphore abstraction) is placed here so a distributed
    # limiter can slot in without touching gemini_client.py.
    gemini_max_concurrent_calls: int = Field(default=10, ge=1)

    # ── MongoDB ───────────────────────────────────────────────────────────────
    mongodb_url: str
    mongodb_database: str = "vocaply"
    mongo_pool_min_size: int = Field(default=2, ge=1)
    mongo_pool_max_size: int = Field(default=20, ge=1)

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str
    redis_pool_max_connections: int = Field(default=20, ge=1)

    # ── Internal Service Auth ─────────────────────────────────────────────────
    # Shared secret for Node.js → FastAPI internal calls.
    # SecretStr: timing-safe comparison via secrets.compare_digest in deps.py.
    api_shared_secret: SecretStr

    # ── Node.js API origin (for CORS scoping, not wildcard) ───────────────────
    node_api_internal_origin: str = "http://localhost:5000"

    # ── Custom Validators ─────────────────────────────────────────────────────

    @model_validator(mode="after")
    def _validate_model_names_are_distinct(self) -> "Settings":
        """Catch copy-pasted env vars: flash and flash-lite must differ."""
        if self.gemini_flash_model_name == self.gemini_flash_lite_model_name:
            raise ValueError(
                "GEMINI_FLASH_MODEL_NAME and GEMINI_FLASH_LITE_MODEL_NAME "
                "must be different model names. Check for copy-paste error in .env"
            )
        return self

    @model_validator(mode="after")
    def _validate_pool_sizes_are_sane(self) -> "Settings":
        if self.mongo_pool_min_size > self.mongo_pool_max_size:
            raise ValueError(
                f"MONGO_POOL_MIN_SIZE ({self.mongo_pool_min_size}) must be "
                f"<= MONGO_POOL_MAX_SIZE ({self.mongo_pool_max_size})"
            )
        return self

    @model_validator(mode="after")
    def _validate_production_secrets_are_not_placeholder(self) -> "Settings":
        """In production, reject known-bad placeholder secret values."""
        if self.environment == "production":
            known_bad = {"changeme", "secret", "password", "placeholder", "your-secret-here", ""}

            api_secret_val = self.api_shared_secret.get_secret_value().lower()
            if api_secret_val in known_bad or len(api_secret_val) < 32:
                raise ValueError(
                    "API_SHARED_SECRET in production must be a strong secret "
                    "(minimum 32 characters, not a known placeholder)"
                )

            or_key_val = self.openrouter_api_key.get_secret_value().lower()
            if or_key_val in known_bad or or_key_val.startswith("your-") or or_key_val.startswith("sk-or-your"):
                raise ValueError(
                    "OPENROUTER_API_KEY in production must be a real API key, not a placeholder"
                )
        return self


# ─── Singleton Accessor ───────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton Settings instance, validated at first call.

    lru_cache (not bare module-level Settings()) enables test overrides:
        app.dependency_overrides[get_settings] = lambda: TestSettings(...)
    without monkeypatching the module itself.
    """
    return Settings()


# ─── Import-time fail-fast ────────────────────────────────────────────────────
# Calling get_settings() at module import means:
#   python -c "from src.config.settings import settings"
# either succeeds or crashes immediately with a clear ValidationError.
# CI can run this as a standalone preflight check before any test suite.
settings = get_settings()
