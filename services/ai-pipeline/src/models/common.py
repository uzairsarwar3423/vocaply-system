"""
models/common.py
────────────────
Shared domain types for the AI pipeline service.

PRINCIPAL DESIGN NOTE — Two key choices made here:

1. TaskType covers ALL Phase-4 task categories up front (not just today's)
   so model_routing.py never needs structural changes as new features land.

2. GeminiCallResult is Generic[T] — callers get full static type safety
   (mypy will catch field-access errors at lint time, not runtime).
"""

from __future__ import annotations

from enum import Enum
from typing import Generic, TypeVar

from pydantic import BaseModel, Field, computed_field, model_validator


# ─── Enumerations ─────────────────────────────────────────────────────────────


class TaskType(str, Enum):
    """All AI task categories this service will ever handle.

    Defining the full set today prevents model_routing.py from needing
    repeated structural edits as Phase 4 days progress.
    """

    TRANSCRIPT_CLEANUP = "transcript_cleanup"
    EXTRACTION = "extraction"
    RESOLUTION_CHECK = "resolution_check"
    SUMMARY = "summary"
    CHAT_ANSWER = "chat_answer"
    EMBEDDING = "embedding"
    RERANK = "rerank"


class ModelTier(str, Enum):
    """Logical model tiers — callers reason about tiers, not model names.

    EMBEDDING is its own tier because embedding calls use a fundamentally
    different SDK code path (not a text-generation call) and are never
    interchangeable with FLASH/FLASH_LITE tiers.
    """

    FLASH_LITE = "flash_lite"
    FLASH = "flash"
    EMBEDDING = "embedding"


# ─── Cost / Usage ─────────────────────────────────────────────────────────────


class CostRecord(BaseModel):
    """Token usage and estimated cost for one Gemini call.

    estimated_cost_usd is stored per-call in structured logs. Day 60's
    cost-eval script aggregates these fields — nothing else needs to be
    built later to produce that report.
    """

    input_tokens: int = Field(..., ge=0)
    output_tokens: int = Field(..., ge=0)
    model_tier: ModelTier
    model_name: str = Field(..., min_length=1)
    estimated_cost_usd: float = Field(..., ge=0.0)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    @model_validator(mode="after")
    def _validate_cost_is_non_negative(self) -> "CostRecord":
        if self.estimated_cost_usd < 0:
            raise ValueError("estimated_cost_usd must be >= 0")
        return self


# ─── Generic Call Result Envelope ─────────────────────────────────────────────

T = TypeVar("T")


class GeminiCallResult(BaseModel, Generic[T]):
    """Typed result envelope for every Gemini call — success or decorated failure.

    Generic over T: gemini_client.generate_structured(..., response_schema=MyModel)
    returns GeminiCallResult[MyModel], giving full mypy type-safety to callers.

    Every field here is a first-class citizen, not a TODO — cost and latency
    are captured on call #1 because retroactively reconstructing per-call
    costs from logs that never stored them is not possible.
    """

    data: T
    cost: CostRecord
    latency_ms: float = Field(..., ge=0.0)
    retry_count: int = Field(..., ge=0)
    task_type: TaskType
    model_name: str = Field(..., min_length=1)


# ─── Error Response Shape ──────────────────────────────────────────────────────


class ErrorEnvelope(BaseModel):
    """Uniform error response body for all FastAPI error responses.

    Structurally consistent with the Node.js API's error envelope
    {success: false, error: {code, message, details}} — not byte-identical
    (internal service, different shape is acceptable), but conceptually
    identical so cross-service debugging doesn't require re-learning conventions.
    """

    error_code: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    request_id: str
    details: dict | None = None
