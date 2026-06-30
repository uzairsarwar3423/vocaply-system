"""
tests/test_settings.py
──────────────────────
Unit tests for config/settings.py.

TESTS:
  - Missing required var raises at import
  - SecretStr fields never appear in repr()/str() output
  - Production placeholder-secret validator rejects known-bad values
  - Model name distinctness validator catches copy-paste error
  - Pool size sanity validator catches invalid ranges
"""

from __future__ import annotations
import os
import pytest


# Vars that must be cleared so Settings() uses only explicit kwargs
_CLEAR_VARS = [
    "GEMINI_API_KEY", "API_SHARED_SECRET", "MONGODB_URL", "REDIS_URL",
    "ENVIRONMENT", "GEMINI_FLASH_MODEL_NAME", "GEMINI_FLASH_LITE_MODEL_NAME",
]


class TestSettingsValidation:
    """Settings validation — fail-fast contract."""

    def test_missing_gemini_api_key_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Missing required GEMINI_API_KEY must raise at instantiation."""
        from pydantic import ValidationError
        from src.config.settings import Settings

        for var in _CLEAR_VARS:
            monkeypatch.delenv(var, raising=False)

        with pytest.raises(ValidationError) as exc_info:
            Settings(
                # Missing gemini_api_key
                _env_file=None,  # Don't read .env file
                api_shared_secret="test-shared-secret-for-internal-auth-32ch",
                mongodb_url="mongodb://localhost:27017",
                redis_url="redis://localhost:6379",
            )

        assert "gemini_api_key" in str(exc_info.value).lower()

    def test_missing_api_shared_secret_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Missing required API_SHARED_SECRET must raise at instantiation."""
        from pydantic import ValidationError
        from src.config.settings import Settings

        for var in _CLEAR_VARS:
            monkeypatch.delenv(var, raising=False)

        with pytest.raises(ValidationError) as exc_info:
            Settings(
                _env_file=None,
                gemini_api_key="test-key",
                # Missing api_shared_secret
                mongodb_url="mongodb://localhost:27017",
                redis_url="redis://localhost:6379",
            )

        assert "api_shared_secret" in str(exc_info.value).lower()

    def test_gemini_api_key_not_in_repr(self) -> None:
        """SecretStr: GEMINI_API_KEY must never appear in repr() or str()."""
        from src.config.settings import Settings

        settings = Settings(
            gemini_api_key="my-super-secret-key-never-log-this",
            api_shared_secret="test-shared-secret-for-internal-auth-32ch",
            mongodb_url="mongodb://localhost:27017",
            redis_url="redis://localhost:6379",
        )

        repr_output = repr(settings)
        str_output = str(settings)

        assert "my-super-secret-key-never-log-this" not in repr_output
        assert "my-super-secret-key-never-log-this" not in str_output
        # Pydantic SecretStr renders as "**********"
        assert "**" in repr_output or "secret" in repr_output.lower()

    def test_api_shared_secret_not_in_repr(self) -> None:
        """SecretStr: API_SHARED_SECRET must never appear in repr() or str()."""
        from src.config.settings import Settings

        secret_value = "super-secret-internal-key-do-not-log"
        settings = Settings(
            gemini_api_key="test-api-key",
            api_shared_secret=secret_value,
            mongodb_url="mongodb://localhost:27017",
            redis_url="redis://localhost:6379",
        )

        assert secret_value not in repr(settings)
        assert secret_value not in str(settings)

    def test_duplicate_model_names_raise(self) -> None:
        """Copy-paste error: flash and flash-lite having the same name must raise."""
        from pydantic import ValidationError
        from src.config.settings import Settings

        with pytest.raises(ValidationError) as exc_info:
            Settings(
                gemini_api_key="test-key",
                api_shared_secret="test-shared-secret-for-internal-auth-32ch",
                mongodb_url="mongodb://localhost:27017",
                redis_url="redis://localhost:6379",
                gemini_flash_model_name="gemini-2.0-flash",  # Same!
                gemini_flash_lite_model_name="gemini-2.0-flash",  # Same!
            )

        assert "flash" in str(exc_info.value).lower() or "distinct" in str(exc_info.value).lower()

    def test_invalid_pool_sizes_raise(self) -> None:
        """Pool min > pool max must raise."""
        from pydantic import ValidationError
        from src.config.settings import Settings

        with pytest.raises(ValidationError):
            Settings(
                gemini_api_key="test-key",
                api_shared_secret="test-shared-secret-for-internal-auth-32ch",
                mongodb_url="mongodb://localhost:27017",
                redis_url="redis://localhost:6379",
                mongo_pool_min_size=20,
                mongo_pool_max_size=5,  # min > max — invalid
            )

    def test_production_placeholder_secret_raises(self) -> None:
        """Production environment rejects known-bad secret placeholders."""
        from pydantic import ValidationError
        from src.config.settings import Settings

        with pytest.raises(ValidationError) as exc_info:
            Settings(
                gemini_api_key="real-api-key-not-placeholder",
                api_shared_secret="changeme",  # Known-bad placeholder
                mongodb_url="mongodb://localhost:27017",
                redis_url="redis://localhost:6379",
                environment="production",
            )

        assert "production" in str(exc_info.value).lower() or "secret" in str(exc_info.value).lower()

    def test_production_short_secret_raises(self) -> None:
        """Production environment rejects secrets shorter than 32 chars."""
        from pydantic import ValidationError
        from src.config.settings import Settings

        with pytest.raises(ValidationError):
            Settings(
                gemini_api_key="real-api-key-not-placeholder",
                api_shared_secret="tooshort",  # < 32 chars
                mongodb_url="mongodb://localhost:27017",
                redis_url="redis://localhost:6379",
                environment="production",
            )

    def test_development_environment_accepts_short_secret(self) -> None:
        """Development environment should not apply production secret restrictions."""
        from src.config.settings import Settings

        # Should not raise in development
        settings = Settings(
            gemini_api_key="test-key",
            api_shared_secret="short",
            mongodb_url="mongodb://localhost:27017",
            redis_url="redis://localhost:6379",
            environment="development",
        )
        assert settings.environment == "development"

    def test_get_settings_caches_instance(self) -> None:
        """get_settings() must return the same instance on repeated calls (lru_cache)."""
        from src.config.settings import get_settings

        get_settings.cache_clear()

        import os
        os.environ.setdefault("GEMINI_API_KEY", "test-key")
        os.environ.setdefault("API_SHARED_SECRET", "test-shared-secret-internal-auth-32ch")
        os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
        os.environ.setdefault("REDIS_URL", "redis://localhost:6379")

        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2  # Same object — lru_cache working correctly
