"""
models/exceptions.py
────────────────────
Typed exception hierarchy for the AI pipeline service.

PRINCIPAL DESIGN NOTE:
Every exception carries enough structured context (task_type, model_tier,
attempt counts) that the global error handler can log richly WITHOUT
introspecting string messages. This is the typed-exceptions discipline —
string-matched exceptions are a maintenance liability as error messages evolve.

Hierarchy:
    AIPipelineError                     ← base; catches the whole tree
    ├── GeminiError                     ← any Gemini call failure
    │   ├── GeminiSchemaValidationError ← structured-output Pydantic mismatch
    │   ├── GeminiTimeoutError          ← per-attempt timeout exhausted
    │   ├── GeminiNonRetryableError     ← 400/401/403-class upstream error
    │   └── GeminiRateLimitExhaustedError ← 429s consumed full retry budget
    ├── DependencyUnavailableError      ← Mongo/Redis unreachable at startup
    └── InternalAuthError               ← missing/invalid X-Internal-Service-Key
"""

from __future__ import annotations

from src.models.common import ModelTier, TaskType


# ─── Base ─────────────────────────────────────────────────────────────────────


class AIPipelineError(Exception):
    """Root exception for all AI pipeline domain errors.

    The global error handler catches this class and its subclasses,
    mapping them to structured ErrorEnvelope HTTP responses.
    """

    error_code: str = "INTERNAL_ERROR"
    http_status: int = 500

    def __init__(self, message: str, **context: object) -> None:
        super().__init__(message)
        self.message = message
        self.context = context  # Arbitrary structured context for logging


# ─── Gemini Errors ────────────────────────────────────────────────────────────


class GeminiError(AIPipelineError):
    """Base for all Gemini-call-related failures."""

    error_code = "GEMINI_ERROR"

    def __init__(
        self,
        message: str,
        *,
        task_type: TaskType | None = None,
        model_tier: ModelTier | None = None,
        attempt_count: int = 0,
        **context: object,
    ) -> None:
        super().__init__(message, **context)
        self.task_type = task_type
        self.model_tier = model_tier
        self.attempt_count = attempt_count


class GeminiSchemaValidationError(GeminiError):
    """Raised when structured output fails Pydantic validation after all retries.

    Carries the raw offending text for offline debugging/eval — never
    returned to callers as data, only logged by the error handler.
    """

    error_code = "GEMINI_SCHEMA_VALIDATION_ERROR"
    http_status = 502  # Bad Gateway — upstream returned unusable payload

    def __init__(
        self,
        message: str,
        *,
        raw_response: str,
        validation_error: str,
        task_type: TaskType | None = None,
        model_tier: ModelTier | None = None,
        attempt_count: int = 0,
    ) -> None:
        super().__init__(
            message,
            task_type=task_type,
            model_tier=model_tier,
            attempt_count=attempt_count,
            raw_response=raw_response[:500],  # Truncate to avoid log bloat
            validation_error=validation_error,
        )
        self.raw_response = raw_response
        self.validation_error = validation_error


class GeminiTimeoutError(GeminiError):
    """Raised when a Gemini call exceeds gemini_timeout_seconds per-attempt,
    and the full tenacity retry budget is exhausted.

    PRINCIPAL NOTE: timeout is per-attempt (inside tenacity loop), NOT a
    single outer wrapper. One slow attempt doesn't eat the whole retry budget.
    """

    error_code = "GEMINI_TIMEOUT_ERROR"
    http_status = 504  # Gateway Timeout

    def __init__(
        self,
        message: str,
        *,
        timeout_seconds: float,
        task_type: TaskType | None = None,
        model_tier: ModelTier | None = None,
        attempt_count: int = 0,
    ) -> None:
        super().__init__(
            message,
            task_type=task_type,
            model_tier=model_tier,
            attempt_count=attempt_count,
            timeout_seconds=timeout_seconds,
        )
        self.timeout_seconds = timeout_seconds


class GeminiNonRetryableError(GeminiError):
    """Raised for 400/401/403-class errors — never retried.

    WHY DISTINCT: A 401 means "wrong API key" — retrying is pointless and
    burns the retry budget uselessly. This exception is raised immediately,
    on the first attempt, with zero retries.
    """

    error_code = "GEMINI_NON_RETRYABLE_ERROR"
    http_status = 502

    def __init__(
        self,
        message: str,
        *,
        upstream_status_code: int,
        upstream_message: str,
        task_type: TaskType | None = None,
        model_tier: ModelTier | None = None,
    ) -> None:
        super().__init__(
            message,
            task_type=task_type,
            model_tier=model_tier,
            attempt_count=1,
            upstream_status_code=upstream_status_code,
            upstream_message=upstream_message,
        )
        self.upstream_status_code = upstream_status_code
        self.upstream_message = upstream_message


class GeminiRateLimitExhaustedError(GeminiError):
    """Raised when the full tenacity retry budget is consumed on 429 responses.

    WHY DISTINCT FROM TIMEOUT: "Google throttled us" (429s) vs "Google was
    slow/down" (timeouts/5xx) have different operational responses:
    - 429 exhaustion may warrant backing off NEW call issuance platform-wide
    - Timeout exhaustion is more likely transient infrastructure issues
    """

    error_code = "GEMINI_RATE_LIMIT_EXHAUSTED"
    http_status = 429

    def __init__(
        self,
        message: str,
        *,
        task_type: TaskType | None = None,
        model_tier: ModelTier | None = None,
        attempt_count: int = 0,
    ) -> None:
        super().__init__(
            message,
            task_type=task_type,
            model_tier=model_tier,
            attempt_count=attempt_count,
        )


# ─── Infrastructure Errors ────────────────────────────────────────────────────


class DependencyUnavailableError(AIPipelineError):
    """Raised by Mongo/Redis wrappers when connection fails at startup.

    The FastAPI lifespan lets this propagate — the process refuses to start
    if a required dependency is unreachable. Fail-fast beats silent degradation.
    """

    error_code = "DEPENDENCY_UNAVAILABLE"
    http_status = 503

    def __init__(self, message: str, *, dependency: str) -> None:
        super().__init__(message, dependency=dependency)
        self.dependency = dependency


# ─── Auth Errors ──────────────────────────────────────────────────────────────


class InternalAuthError(AIPipelineError):
    """Raised by the auth dependency when X-Internal-Service-Key is missing
    or does not match the configured api_shared_secret.

    The global error handler maps this to a 401 response.
    """

    error_code = "INTERNAL_AUTH_ERROR"
    http_status = 401

    def __init__(self, message: str = "Invalid or missing internal service key") -> None:
        super().__init__(message)
