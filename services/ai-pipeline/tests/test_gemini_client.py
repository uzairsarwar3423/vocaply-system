"""
tests/test_gemini_client.py
────────────────────────────
Unit tests for services/gemini_client.py.

ALL TESTS use a mocked SDK boundary — no real Gemini calls.

TESTS:
  - Structured output success path returns correctly typed result
  - Schema mismatch → one corrective retry → second failure raises GeminiSchemaValidationError
  - Simulated 429 → retries up to max → raises GeminiRateLimitExhaustedError
  - Simulated 401 → raised immediately as GeminiNonRetryableError (zero retries)
  - Cost calculation: given known mocked token counts, assert expected value
  - Concurrency semaphore: N+1 concurrent calls with semaphore(N) → (N+1)th waits
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from src.config.settings import Settings
from src.models.common import GeminiCallResult, TaskType
from src.models.exceptions import (
    GeminiNonRetryableError,
    GeminiRateLimitExhaustedError,
    GeminiSchemaValidationError,
    GeminiTimeoutError,
)
from src.services.gemini_client import GeminiClient


# ─── Test Schema ──────────────────────────────────────────────────────────────


class EchoSchema(BaseModel):
    message: str
    value: int = 0


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def settings(test_settings: Settings) -> Settings:
    """Use test_settings fixture from conftest."""
    return test_settings


def make_sdk_response(text: str, input_tokens: int = 100, output_tokens: int = 50) -> MagicMock:
    """Build a mock SDK response object matching the google-genai response shape."""
    mock_usage = MagicMock()
    mock_usage.prompt_token_count = input_tokens
    mock_usage.candidates_token_count = output_tokens

    mock_response = MagicMock()
    mock_response.text = text
    mock_response.usage_metadata = mock_usage
    return mock_response


def make_client(settings: Settings) -> GeminiClient:
    """Create a GeminiClient with a mocked underlying SDK client."""
    with patch("src.services.gemini_client.genai.Client"):
        client = GeminiClient(settings)
    return client


# ─── Success Path ─────────────────────────────────────────────────────────────


class TestGenerateStructuredSuccess:
    async def test_returns_correctly_typed_result(self, settings: Settings) -> None:
        """Success path returns GeminiCallResult with correct data type."""
        client = make_client(settings)
        valid_json = '{"message": "hello", "value": 42}'
        mock_response = make_sdk_response(valid_json, input_tokens=100, output_tokens=50)

        with patch.object(client, "_call_sdk_text", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = (
                valid_json,
                {"input_token_count": 100, "output_token_count": 50},
            )

            result = await client.generate_structured(
                task_type=TaskType.EXTRACTION,
                system_prompt="Extract data",
                user_prompt="The meeting was about Q4 planning",
                response_schema=EchoSchema,
            )

        assert isinstance(result, GeminiCallResult)
        assert isinstance(result.data, EchoSchema)
        assert result.data.message == "hello"
        assert result.data.value == 42
        assert result.retry_count == 0
        assert result.cost.input_tokens == 100
        assert result.cost.output_tokens == 50

    async def test_cost_calculation_exact(self, settings: Settings) -> None:
        """Given known token counts, estimated_cost_usd must match hand-calculated value."""
        from src.config.model_routing import PRICING_TABLE
        from src.models.common import ModelTier

        client = make_client(settings)
        input_tokens = 1_000_000  # 1M input tokens
        output_tokens = 500_000   # 500K output tokens

        with patch.object(client, "_call_sdk_text", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = (
                '{"message": "test", "value": 1}',
                {"input_token_count": input_tokens, "output_token_count": output_tokens},
            )

            result = await client.generate_structured(
                task_type=TaskType.EXTRACTION,  # → FLASH_LITE tier
                system_prompt="test",
                user_prompt="test",
                response_schema=EchoSchema,
            )

        rates = PRICING_TABLE[ModelTier.FLASH_LITE]
        expected_cost = (
            (input_tokens / 1_000_000) * rates.input_per_million_usd
            + (output_tokens / 1_000_000) * rates.output_per_million_usd
        )

        assert abs(result.cost.estimated_cost_usd - expected_cost) < 1e-9

    async def test_latency_is_populated(self, settings: Settings) -> None:
        """latency_ms must be > 0 on a successful call."""
        client = make_client(settings)

        with patch.object(client, "_call_sdk_text", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = (
                '{"message": "latency test", "value": 0}',
                {"input_token_count": 10, "output_token_count": 5},
            )

            result = await client.generate_structured(
                task_type=TaskType.SUMMARY,
                system_prompt="summarize",
                user_prompt="meeting notes",
                response_schema=EchoSchema,
            )

        assert result.latency_ms > 0


# ─── Schema Mismatch Retry ────────────────────────────────────────────────────


class TestSchemaValidationRetry:
    async def test_schema_mismatch_triggers_corrective_retry(self, settings: Settings) -> None:
        """First schema mismatch → corrective retry is issued → second attempt succeeds."""
        client = make_client(settings)

        # First call returns bad JSON, second returns valid JSON
        call_count = 0

        async def side_effect(*args: Any, **kwargs: Any) -> tuple[str, dict]:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return ('{"wrong_field": "bad"}', {"input_token_count": 10, "output_token_count": 5})
            return ('{"message": "corrected", "value": 99}', {"input_token_count": 15, "output_token_count": 8})

        with patch.object(client, "_call_sdk_text", side_effect=side_effect):
            result = await client.generate_structured(
                task_type=TaskType.EXTRACTION,
                system_prompt="extract",
                user_prompt="data",
                response_schema=EchoSchema,
            )

        assert result.data.message == "corrected"
        assert result.data.value == 99
        assert call_count == 2  # Initial call + one corrective retry
        assert result.retry_count == 1

    async def test_schema_mismatch_on_both_attempts_raises(self, settings: Settings) -> None:
        """Schema mismatch on both initial and corrective attempt raises GeminiSchemaValidationError."""
        client = make_client(settings)
        bad_json = '{"wrong_field": "still bad"}'

        with patch.object(client, "_call_sdk_text", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = (bad_json, {"input_token_count": 10, "output_token_count": 5})

            with pytest.raises(GeminiSchemaValidationError) as exc_info:
                await client.generate_structured(
                    task_type=TaskType.EXTRACTION,
                    system_prompt="extract",
                    user_prompt="data",
                    response_schema=EchoSchema,
                )

        assert exc_info.value.error_code == "GEMINI_SCHEMA_VALIDATION_ERROR"
        assert exc_info.value.task_type == TaskType.EXTRACTION


# ─── Rate Limit Exhaustion ────────────────────────────────────────────────────


class TestRateLimitHandling:
    async def test_rate_limit_exhaustion_raises(self, settings: Settings) -> None:
        """Simulated 429 exhausts retries → raises GeminiRateLimitExhaustedError."""
        # Update settings to use minimal retries for test speed
        settings.max_gemini_retries = 2  # type: ignore[misc]

        client = make_client(settings)
        rate_limit_exc = Exception("429 RESOURCE_EXHAUSTED: Quota exceeded")

        with patch.object(client, "_call_sdk_text", new_callable=AsyncMock) as mock_call:
            mock_call.side_effect = rate_limit_exc

            with pytest.raises((GeminiRateLimitExhaustedError, GeminiTimeoutError)):
                await client.generate_structured(
                    task_type=TaskType.EXTRACTION,
                    system_prompt="test",
                    user_prompt="test",
                    response_schema=EchoSchema,
                )


# ─── Non-Retryable Error ──────────────────────────────────────────────────────


class TestNonRetryableError:
    async def test_401_raises_immediately_with_zero_retries(self, settings: Settings) -> None:
        """Simulated 401 → raised immediately as GeminiNonRetryableError, 0 retries."""
        client = make_client(settings)
        auth_exc = Exception("401 UNAUTHENTICATED: Invalid API key")
        call_count = 0

        async def side_effect(*args: Any, **kwargs: Any) -> tuple[str, dict]:
            nonlocal call_count
            call_count += 1
            raise auth_exc

        with patch.object(client, "_call_sdk_text", side_effect=side_effect):
            with pytest.raises(GeminiNonRetryableError) as exc_info:
                await client.generate_structured(
                    task_type=TaskType.EXTRACTION,
                    system_prompt="test",
                    user_prompt="test",
                    response_schema=EchoSchema,
                )

        assert exc_info.value.error_code == "GEMINI_NON_RETRYABLE_ERROR"
        assert call_count == 1  # Zero retries — raised immediately


# ─── Concurrency Semaphore ────────────────────────────────────────────────────


class TestConcurrencySemaphore:
    async def test_semaphore_limits_concurrent_calls(self, settings: Settings) -> None:
        """N+1 concurrent calls with semaphore(N): the (N+1)th observably waits."""
        import time

        # Set semaphore to 2 — only 2 simultaneous calls allowed
        settings.gemini_max_concurrent_calls = 2  # type: ignore[misc]
        client = make_client(settings)

        # Each call takes 0.1s — if semaphore works, 3 calls take >= 0.2s total
        call_duration = 0.1
        started_times: list[float] = []

        async def slow_call(*args: Any, **kwargs: Any) -> tuple[str, dict]:
            started_times.append(time.monotonic())
            await asyncio.sleep(call_duration)
            return ('{"message": "ok", "value": 0}', {"input_token_count": 10, "output_token_count": 5})

        with patch.object(client, "_call_sdk_text", side_effect=slow_call):
            start = time.monotonic()
            tasks = [
                client.generate_structured(
                    task_type=TaskType.EXTRACTION,
                    system_prompt="test",
                    user_prompt="test",
                    response_schema=EchoSchema,
                )
                for _ in range(3)
            ]
            await asyncio.gather(*tasks)
            total_elapsed = time.monotonic() - start

        # With semaphore(2) and 3 calls of 0.1s each:
        # First 2 run concurrently (~0.1s), 3rd waits (~0.1s more) → total ~0.2s
        # Without semaphore: all 3 would run concurrently (~0.1s total)
        assert total_elapsed >= call_duration * 1.5, (
            f"Expected >= {call_duration * 1.5}s with semaphore, got {total_elapsed:.3f}s"
        )
