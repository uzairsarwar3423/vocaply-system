"""
services/gemini_client.py
─────────────────────────
Core AI client — powered by OpenRouter (OpenAI-compatible API).

TRANSPORT CHANGE (Day 46 → OpenRouter):
  Originally targeted the google-genai SDK directly. Switched to OpenRouter
  because it provides:
    - One API key for Gemini, Claude, GPT, etc. (future flexibility)
    - OpenAI-compatible API (standard tooling, easier to swap providers)
    - Dashboard cost tracking out of the box

  The public interface is UNCHANGED — every Day 47+ feature calls
  generate_structured(), generate_text(), embed() exactly as before.
  Only this file changed.

RESPONSIBILITIES:
  (a) Construction   — single AsyncOpenAI client instance per process
  (b) generate_structured() — schema-first structured output with retry
  (c) generate_text()       — free-text generation with retry
  (d) embed()               — batch embedding (stubbed, not yet on OpenRouter)
  (e) Timeout enforcement   — per-attempt timeout (inside tenacity loop)
  (f) Concurrency control   — process-local semaphore

KEY DESIGN CHOICES:
  1. Schema-first output via json_schema response_format (API-enforced)
  2. Two-layer retry: tenacity for transient errors, one corrective retry
     for schema-mismatch (different failure classes → different semantics)
  3. Every call returns typed GeminiCallResult — cost and latency always present
  4. Per-attempt timeout — one slow attempt doesn't eat the entire retry budget
  5. Concurrency semaphore at client level — shared process-wide
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Generic, Type, TypeVar, cast

import structlog
from openai import AsyncOpenAI, APIStatusError, APITimeoutError, RateLimitError
from pydantic import BaseModel, ValidationError
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.config.logging import get_logger
from src.config.model_routing import compute_cost, resolve_model
from src.config.settings import Settings, get_settings
from src.models.common import CostRecord, GeminiCallResult, ModelTier, TaskType
from src.models.exceptions import (
    GeminiNonRetryableError,
    GeminiRateLimitExhaustedError,
    GeminiSchemaValidationError,
    GeminiTimeoutError,
)

log: structlog.BoundLogger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)


# ─── SDK Error Classification Helpers ─────────────────────────────────────────

def _is_rate_limit_error(exc: BaseException) -> bool:
    """True for 429 / rate-limit errors from OpenRouter."""
    if isinstance(exc, RateLimitError):
        return True
    exc_str = str(exc).lower()
    return "429" in exc_str or "quota" in exc_str or "rate_limit" in exc_str or "resource_exhausted" in exc_str


def _is_server_error(exc: BaseException) -> bool:
    """True for 5xx server errors from OpenRouter (retryable)."""
    if isinstance(exc, APIStatusError) and exc.status_code >= 500:
        return True
    exc_str = str(exc).lower()
    return any(code in exc_str for code in ("500", "503", "504", "server error", "internal"))


def _is_non_retryable_error(exc: BaseException) -> bool:
    """True for 400/401/403 — auth failures or bad requests (never retry)."""
    if isinstance(exc, APIStatusError) and exc.status_code in (400, 401, 403):
        return True
    exc_str = str(exc).lower()
    return any(
        code in exc_str
        for code in ("400", "401", "403", "invalid_argument", "permission_denied", "unauthenticated")
    )


def _extract_status_code(exc: BaseException) -> int:
    """Best-effort status code extraction."""
    if isinstance(exc, APIStatusError):
        return exc.status_code
    exc_str = str(exc)
    for code in (400, 401, 403, 404, 429, 500, 503, 504):
        if str(code) in exc_str:
            return code
    return 0


# ─── GeminiClient ─────────────────────────────────────────────────────────────


class GeminiClient:
    """Async AI client backed by OpenRouter — one instance per process.

    Despite the class name, this client now routes requests through
    OpenRouter's OpenAI-compatible API. The name is preserved so no
    Day 47+ consumer code needs to change.

    Args:
        settings: The application settings (injected for testability).
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

        # AsyncOpenAI client pointed at OpenRouter's base URL
        self._client = AsyncOpenAI(
            api_key=self._settings.openrouter_api_key.get_secret_value(),
            base_url=self._settings.openrouter_base_url,
            default_headers={
                # OpenRouter attribution headers — shown in their dashboard
                "HTTP-Referer": self._settings.openrouter_site_url,
                "X-Title": self._settings.openrouter_site_name,
            },
            timeout=self._settings.gemini_timeout_seconds,
        )

        # Process-local concurrency semaphore — shared across ALL callers.
        # SCALABILITY NOTE: at N replicas, true global concurrency =
        # gemini_max_concurrent_calls × N. At high replica counts, consider
        # replacing with a Redis-backed token bucket (swap point is here).
        self._semaphore = asyncio.Semaphore(self._settings.gemini_max_concurrent_calls)

        log.info(
            "GeminiClient initialized",
            provider="openrouter",
            base_url=self._settings.openrouter_base_url,
            flash_model=self._settings.gemini_flash_model_name,
            flash_lite_model=self._settings.gemini_flash_lite_model_name,
            max_concurrent=self._settings.gemini_max_concurrent_calls,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # (b) Structured Output Generation
    # ─────────────────────────────────────────────────────────────────────────

    async def generate_structured(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
        response_schema: type[T],
    ) -> GeminiCallResult[T]:
        """Generate structured output validated against a Pydantic schema.

        Uses OpenRouter's json_schema response_format (API-enforced JSON),
        NOT prompt instructions like "respond only in JSON".

        Retry contract (two distinct layers):
          - Tenacity layer: transient network/rate-limit/server errors
          - Schema-mismatch layer: one corrective retry with amended prompt

        Args:
            task_type: Semantic task category (drives model selection).
            system_prompt: System instruction for the model.
            user_prompt: User content prompt.
            response_schema: Pydantic model class defining expected output.

        Returns:
            GeminiCallResult[T] — typed envelope with data, cost, latency, retries.

        Raises:
            GeminiSchemaValidationError: Output failed schema validation after retries.
            GeminiTimeoutError: Per-attempt timeout exhausted after all retries.
            GeminiRateLimitExhaustedError: 429s consumed the full retry budget.
            GeminiNonRetryableError: 4xx (not 429) — raised immediately, no retries.
        """
        model_name, model_tier = resolve_model(task_type, self._settings)
        start_time = time.monotonic()

        async with self._semaphore:
            return await self._generate_structured_with_retry(
                task_type=task_type,
                model_name=model_name,
                model_tier=model_tier,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_schema=response_schema,
                start_time=start_time,
            )

    async def _generate_structured_with_retry(
        self,
        task_type: TaskType,
        model_name: str,
        model_tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        response_schema: type[T],
        start_time: float,
    ) -> GeminiCallResult[T]:
        """Inner implementation of generate_structured with full retry logic."""
        total_retry_count = 0
        last_exc: BaseException | None = None

        # ── Tenacity retry loop for transient errors ───────────────────────
        # NOTE: GeminiNonRetryableError and GeminiSchemaValidationError are
        # excluded — they must propagate immediately without burning retry budget.
        try:
            async for attempt in AsyncRetrying(
                wait=wait_exponential(multiplier=1.0, min=1, max=20),
                stop=stop_after_attempt(self._settings.max_gemini_retries),
                retry=retry_if_exception(
                    lambda exc: not isinstance(exc, (GeminiNonRetryableError, GeminiSchemaValidationError))
                ),
                reraise=False,
            ):
                with attempt:
                    total_retry_count = attempt.retry_state.attempt_number - 1

                    try:
                        raw_text, usage = await self._call_openrouter(
                            model_name=model_name,
                            system_prompt=system_prompt,
                            user_prompt=user_prompt,
                            response_schema=response_schema,
                        )
                    except Exception as exc:
                        # Classify and re-raise appropriately
                        if _is_non_retryable_error(exc):
                            raise GeminiNonRetryableError(
                                f"Non-retryable OpenRouter error: {exc}",
                                upstream_status_code=_extract_status_code(exc),
                                upstream_message=str(exc),
                                task_type=task_type,
                                model_tier=model_tier,
                            ) from exc

                        if _is_rate_limit_error(exc) or _is_server_error(exc):
                            last_exc = exc
                            raise  # Let tenacity handle retry

                        if isinstance(exc, (asyncio.TimeoutError, APITimeoutError)):
                            last_exc = exc
                            raise

                        # Unknown exception — surface immediately
                        raise GeminiNonRetryableError(
                            f"Unexpected OpenRouter error: {exc}",
                            upstream_status_code=0,
                            upstream_message=str(exc),
                            task_type=task_type,
                            model_tier=model_tier,
                        ) from exc

                    # ── Schema validation (one corrective retry) ───────────
                    # cast: Pyrefly resolves TypeVar-bound type[T] as type[object];
                    # cast to type[BaseModel] to surface model_validate_json.
                    schema_cls = cast(Type[BaseModel], response_schema)
                    try:
                        parsed_data = cast(T, schema_cls.model_validate_json(raw_text))
                    except ValidationError as ve:
                        parsed_data = await self._corrective_schema_retry(
                            model_name=model_name,
                            system_prompt=system_prompt,
                            user_prompt=user_prompt,
                            raw_bad_response=raw_text,
                            response_schema=response_schema,
                            task_type=task_type,
                            model_tier=model_tier,
                            validation_error=ve,
                        )
                        total_retry_count += 1

        except GeminiNonRetryableError:
            raise

        except GeminiSchemaValidationError:
            raise

        except RetryError as re:
            latency_ms = (time.monotonic() - start_time) * 1000
            root_cause = last_exc or re

            self._log_call(
                event="gemini_call_failed",
                task_type=task_type,
                model_tier=model_tier,
                model_name=model_name,
                latency_ms=latency_ms,
                retry_count=total_retry_count,
                error=str(root_cause),
            )

            if root_cause and _is_rate_limit_error(root_cause):
                raise GeminiRateLimitExhaustedError(
                    f"OpenRouter rate limit exhausted after {total_retry_count} retries",
                    task_type=task_type,
                    model_tier=model_tier,
                    attempt_count=total_retry_count,
                ) from re

            raise GeminiTimeoutError(
                f"OpenRouter call failed after {total_retry_count} retries",
                timeout_seconds=self._settings.gemini_timeout_seconds,
                task_type=task_type,
                model_tier=model_tier,
                attempt_count=total_retry_count,
            ) from re

        except (asyncio.TimeoutError, APITimeoutError) as te:
            latency_ms = (time.monotonic() - start_time) * 1000
            self._log_call(
                event="gemini_call_timeout",
                task_type=task_type,
                model_tier=model_tier,
                model_name=model_name,
                latency_ms=latency_ms,
                retry_count=total_retry_count,
                error=str(te),
            )
            raise GeminiTimeoutError(
                "OpenRouter call timed out",
                timeout_seconds=self._settings.gemini_timeout_seconds,
                task_type=task_type,
                model_tier=model_tier,
                attempt_count=total_retry_count,
            ) from te

        # ── Success path ───────────────────────────────────────────────────
        latency_ms = (time.monotonic() - start_time) * 1000
        cost_record = self._build_cost_record(usage, model_tier, model_name)

        self._log_call(
            event="gemini_call_success",
            task_type=task_type,
            model_tier=model_tier,
            model_name=model_name,
            latency_ms=latency_ms,
            retry_count=total_retry_count,
            input_tokens=cost_record.input_tokens,
            output_tokens=cost_record.output_tokens,
            total_tokens=cost_record.total_tokens,
            estimated_cost_usd=cost_record.estimated_cost_usd,
        )

        return GeminiCallResult(
            data=parsed_data,
            cost=cost_record,
            latency_ms=latency_ms,
            retry_count=total_retry_count,
            task_type=task_type,
            model_name=model_name,
        )

    async def _corrective_schema_retry(
        self,
        model_name: str,
        system_prompt: str,
        user_prompt: str,
        raw_bad_response: str,
        response_schema: type[T],
        task_type: TaskType,
        model_tier: ModelTier,
        validation_error: ValidationError,
    ) -> T:
        """One corrective re-issue when structured output fails schema validation."""
        corrective_prompt = (
            f"{user_prompt}\n\n"
            "IMPORTANT: Your previous response did not match the required JSON schema. "
            f"Validation error: {validation_error}. "
            "Please respond with valid JSON that strictly matches the required schema. "
            "Do not include any text outside the JSON object."
        )

        log.warning(
            "gemini_schema_mismatch_corrective_retry",
            task_type=task_type.value,
            model_name=model_name,
            validation_error=str(validation_error)[:200],
        )

        try:
            raw_text, _usage = await self._call_openrouter(
                model_name=model_name,
                system_prompt=system_prompt,
                user_prompt=corrective_prompt,
                response_schema=response_schema,
            )
            schema_cls = cast(Type[BaseModel], response_schema)
            return cast(T, schema_cls.model_validate_json(raw_text))
        except ValidationError as ve2:
            raise GeminiSchemaValidationError(
                "Structured output failed schema validation after corrective retry",
                raw_response=raw_text if "raw_text" in dir() else raw_bad_response,
                validation_error=str(ve2),
                task_type=task_type,
                model_tier=model_tier,
                attempt_count=2,
            ) from ve2

    # ─────────────────────────────────────────────────────────────────────────
    # (c) Free-Text Generation
    # ─────────────────────────────────────────────────────────────────────────

    async def generate_text(
        self,
        task_type: TaskType,
        system_prompt: str,
        user_prompt: str,
    ) -> GeminiCallResult[str]:
        """Generate free-text output (e.g. narrative summaries)."""
        model_name, model_tier = resolve_model(task_type, self._settings)
        start_time = time.monotonic()

        async with self._semaphore:
            total_retry_count = 0
            last_exc: BaseException | None = None

            try:
                async for attempt in AsyncRetrying(
                    wait=wait_exponential(multiplier=1.0, min=1, max=20),
                    stop=stop_after_attempt(self._settings.max_gemini_retries),
                    retry=retry_if_exception(
                        lambda exc: not isinstance(exc, GeminiNonRetryableError)
                    ),
                    reraise=False,
                ):
                    with attempt:
                        total_retry_count = attempt.retry_state.attempt_number - 1
                        try:
                            raw_text, usage = await self._call_openrouter(
                                model_name=model_name,
                                system_prompt=system_prompt,
                                user_prompt=user_prompt,
                                response_schema=None,
                            )
                        except Exception as exc:
                            if _is_non_retryable_error(exc):
                                raise GeminiNonRetryableError(
                                    f"Non-retryable OpenRouter error: {exc}",
                                    upstream_status_code=_extract_status_code(exc),
                                    upstream_message=str(exc),
                                    task_type=task_type,
                                    model_tier=model_tier,
                                ) from exc
                            last_exc = exc
                            raise

            except GeminiNonRetryableError:
                raise
            except RetryError as re:
                latency_ms = (time.monotonic() - start_time) * 1000
                self._log_call(
                    event="gemini_text_call_failed",
                    task_type=task_type,
                    model_tier=model_tier,
                    model_name=model_name,
                    latency_ms=latency_ms,
                    retry_count=total_retry_count,
                    error=str(last_exc or re),
                )
                if last_exc and _is_rate_limit_error(last_exc):
                    raise GeminiRateLimitExhaustedError(
                        f"OpenRouter rate limit exhausted after {total_retry_count} retries",
                        task_type=task_type,
                        model_tier=model_tier,
                        attempt_count=total_retry_count,
                    ) from re
                raise GeminiTimeoutError(
                    "OpenRouter text call failed after retries",
                    timeout_seconds=self._settings.gemini_timeout_seconds,
                    task_type=task_type,
                    model_tier=model_tier,
                    attempt_count=total_retry_count,
                ) from re

        latency_ms = (time.monotonic() - start_time) * 1000
        cost_record = self._build_cost_record(usage, model_tier, model_name)

        self._log_call(
            event="gemini_text_call_success",
            task_type=task_type,
            model_tier=model_tier,
            model_name=model_name,
            latency_ms=latency_ms,
            retry_count=total_retry_count,
            input_tokens=cost_record.input_tokens,
            output_tokens=cost_record.output_tokens,
            estimated_cost_usd=cost_record.estimated_cost_usd,
        )

        return GeminiCallResult(
            data=raw_text,
            cost=cost_record,
            latency_ms=latency_ms,
            retry_count=total_retry_count,
            task_type=task_type,
            model_name=model_name,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # (d) Embedding Generation
    # ─────────────────────────────────────────────────────────────────────────

    async def embed(
        self,
        texts: list[str],
    ) -> GeminiCallResult[list[list[float]]]:
        """Generate embeddings for a list of texts.

        NOTE: OpenRouter has limited embedding model support. This is scaffolded
        for Day 56+ and will be wired to a supported embedding model at that time.
        """
        model_name, model_tier = resolve_model(TaskType.EMBEDDING, self._settings)
        start_time = time.monotonic()

        async with self._semaphore:
            try:
                response = await self._client.embeddings.create(
                    model=model_name,
                    input=texts,
                )
            except Exception as exc:
                raise GeminiNonRetryableError(
                    f"Embedding call failed: {exc}",
                    upstream_status_code=_extract_status_code(exc),
                    upstream_message=str(exc),
                    task_type=TaskType.EMBEDDING,
                    model_tier=model_tier,
                ) from exc

        embeddings = [list(e.embedding) for e in response.data]
        latency_ms = (time.monotonic() - start_time) * 1000

        approx_tokens = sum(len(t.split()) for t in texts)
        cost_record = self._build_cost_record(
            {"input_token_count": approx_tokens, "output_token_count": 0},
            model_tier,
            model_name,
        )

        self._log_call(
            event="gemini_embed_success",
            task_type=TaskType.EMBEDDING,
            model_tier=model_tier,
            model_name=model_name,
            latency_ms=latency_ms,
            retry_count=0,
            text_count=len(texts),
            estimated_cost_usd=cost_record.estimated_cost_usd,
        )

        return GeminiCallResult(
            data=embeddings,
            cost=cost_record,
            latency_ms=latency_ms,
            retry_count=0,
            task_type=TaskType.EMBEDDING,
            model_name=model_name,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Internal Helpers
    # ─────────────────────────────────────────────────────────────────────────

    async def _call_openrouter(
        self,
        model_name: str,
        system_prompt: str,
        user_prompt: str,
        response_schema: type[BaseModel] | None,
    ) -> tuple[str, dict[str, int]]:
        """Single OpenRouter API call with per-attempt timeout.

        Uses chat.completions.create with json_schema response_format
        when a schema is provided (API-enforced JSON, not prompt-only).

        Returns: (raw_response_text, usage_dict)
        """
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        kwargs: dict[str, Any] = {
            "model": model_name,
            "messages": messages,
        }

        if response_schema is not None:
            # API-enforced JSON schema — not prompt instructions
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": response_schema.__name__,
                    "strict": True,
                    "schema": response_schema.model_json_schema(),
                },
            }

        from openai.types.chat import ChatCompletion
        response = cast(ChatCompletion, await self._client.chat.completions.create(**kwargs))

        raw_text = response.choices[0].message.content or ""

        # Extract token usage — OpenRouter mirrors OpenAI's usage object
        usage_obj = response.usage
        usage: dict[str, int] = {
            "input_token_count": usage_obj.prompt_tokens if usage_obj else 0,
            "output_token_count": usage_obj.completion_tokens if usage_obj else 0,
        }

        return raw_text, usage

    def _build_cost_record(
        self,
        usage: dict[str, int],
        model_tier: ModelTier,
        model_name: str,
    ) -> CostRecord:
        """Build a CostRecord from API usage metadata."""
        input_tokens = usage.get("input_token_count", 0)
        output_tokens = usage.get("output_token_count", 0)
        estimated_cost = compute_cost(input_tokens, output_tokens, model_tier)

        return CostRecord(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model_tier=model_tier,
            model_name=model_name,
            estimated_cost_usd=estimated_cost,
        )

    def _log_call(
        self,
        event: str,
        task_type: TaskType,
        model_tier: ModelTier,
        model_name: str,
        latency_ms: float,
        retry_count: int,
        **extra: Any,
    ) -> None:
        """One structured log line per call — raw data source for Day 60 cost-eval."""
        log.info(
            event,
            task_type=task_type.value,
            model_tier=model_tier.value,
            model_name=model_name,
            latency_ms=round(latency_ms, 2),
            retry_count=retry_count,
            **extra,
        )
