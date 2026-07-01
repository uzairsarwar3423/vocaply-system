"""
services/cleanup/grammar_normalizer.py
───────────────────────────────────────
Stage 2: Batch grammar normalization via Gemini-on-OpenRouter.

DESIGN DECISIONS (from plan §2 and §5.6):

  DECISION 3 — Batch first, per-turn never.
    A 30-min standup with ~40-50 post-merge turns becomes 2-3 calls,
    not 40-50. ~95% reduction in call count = real latency and cost savings.

  DECISION 4 — Model is never trusted by default; guardrail is default-deny.
    The length-ratio guardrail is a blunt, cheap, deterministic instrument
    deliberately chosen over semantic-similarity checks (which would themselves
    be model calls with their own error rates — turtles all the way down).
    When the guardrail trips: discard model output, revert to filler-stripped
    text, set was_modified_suspiciously=True. Never surfaces to the UI.

  DECISION 5 — Per-batch partial failure isolation.
    Each batch's generate_structured() call is caught individually. On failure
    (after Day 46's internal retries are exhausted), this module returns a
    CleanupBatchResult(succeeded=False, ...) for that batch — sibling batches
    are NOT aborted. The orchestrator (transcript_cleaner.py) handles fallback.

  ID-based response zip (not position-based):
    The model's JSON array is zipped back against input by turn_id, not array
    index. Array-index zip silently breaks the moment the model omits or
    reorders an item. turn_id zip surfaces the miss explicitly (logged,
    handled by fallback) rather than silently corrupting transcript order.

  Prompt version threaded into every batch call:
    prompt_version is parsed from cleanup_system.txt's first line at load time
    and stored on every CleanupBatchResult for aggregation into CleanupMetadata.
"""

from __future__ import annotations

import asyncio
import pathlib
import time
import uuid
from typing import Optional

import structlog
from pydantic import BaseModel, Field

from src.config.cleanup_config import (
    CLEANUP_BATCH_CONCURRENCY,
    CLEANUP_PROMPT_PATH,
    GRAMMAR_BATCH_MAX_TOKENS,
    GRAMMAR_BATCH_MAX_TURNS,
    GRAMMAR_NORMALIZER_TEMPERATURE,
    LENGTH_RATIO_MAX,
    LENGTH_RATIO_MIN,
)
from src.config.logging import get_logger
from src.models.cleanup_models import CleanedTranscriptTurn, CleanupBatchResult
from src.models.common import CostRecord, ModelTier, TaskType
from src.services.gemini_client import GeminiClient

log: structlog.BoundLogger = get_logger(__name__)


# ─── Structured Output Schema (internal to this module) ───────────────────────


class TurnCleanupItem(BaseModel):
    """One cleaned turn as returned by the model."""

    turn_id: str = Field(..., min_length=1)
    cleaned_text: str


class CleanupBatchResponse(BaseModel):
    """Top-level structured response schema for a grammar-normalization batch.

    The model must return a JSON array of TurnCleanupItem objects.
    OpenRouter enforces this shape via response_format: json_schema.
    """

    results: list[TurnCleanupItem]


# ─── Prompt Loading (module-level singleton) ──────────────────────────────────

_SYSTEM_PROMPT: Optional[str] = None
_PROMPT_VERSION: str = "unknown"


def _load_prompt() -> tuple[str, str]:
    """Load cleanup_system.txt once and parse the version header.

    Returns:
        (system_prompt_text, prompt_version_string)
    """
    global _SYSTEM_PROMPT, _PROMPT_VERSION

    if _SYSTEM_PROMPT is not None:
        return _SYSTEM_PROMPT, _PROMPT_VERSION

    prompt_path = pathlib.Path(CLEANUP_PROMPT_PATH)

    if not prompt_path.exists():
        # Fallback: try relative to this file's package root
        prompt_path = pathlib.Path(__file__).parents[3] / "prompts" / "cleanup_system.txt"

    if not prompt_path.exists():
        raise FileNotFoundError(
            f"cleanup_system.txt not found at '{CLEANUP_PROMPT_PATH}' "
            f"or fallback path '{prompt_path}'. "
            "Ensure the prompts directory is present in the project root."
        )

    raw = prompt_path.read_text(encoding="utf-8")
    lines = raw.splitlines()

    # Parse the machine-readable version marker from line 1:
    # Expected format: "# prompt_version: cleanup-v1.0"
    version = "unknown"
    if lines and lines[0].startswith("# prompt_version:"):
        version = lines[0].split(":", 1)[1].strip()

    _SYSTEM_PROMPT = raw
    _PROMPT_VERSION = version

    log.info("cleanup_prompt_loaded", prompt_version=version, path=str(prompt_path))
    return _SYSTEM_PROMPT, _PROMPT_VERSION


# ─── Tokenization Estimate ────────────────────────────────────────────────────


def _estimate_tokens(text: str) -> int:
    """Conservative token count estimate: word_count * 1.3.

    Not a trained tokenizer — that would be an additional dependency.
    1.3× word count overestimates punctuation and subword splits, keeping
    batch sizes safely under the model's effective context window.
    Recalibrate this multiplier once real token counts are observable.
    """
    return int(len(text.split()) * 1.3) + 1  # +1 for the turn_id overhead


# ─── Batch Construction ───────────────────────────────────────────────────────


def _build_batches(turns: list[CleanedTranscriptTurn]) -> list[list[CleanedTranscriptTurn]]:
    """Group consecutive turns into batches respecting both limits.

    Whichever limit fires first (MAX_TURNS or MAX_TOKENS) closes the current
    batch and starts a new one. Both limits live in cleanup_config.py —
    tunable without touching business logic.
    """
    batches: list[list[CleanedTranscriptTurn]] = []
    current_batch: list[CleanedTranscriptTurn] = []
    current_token_estimate = 0

    for turn in turns:
        turn_tokens = _estimate_tokens(turn.cleaned_text)

        # Would adding this turn exceed either limit? Flush if so.
        if current_batch and (
            len(current_batch) >= GRAMMAR_BATCH_MAX_TURNS
            or current_token_estimate + turn_tokens > GRAMMAR_BATCH_MAX_TOKENS
        ):
            batches.append(current_batch)
            current_batch = []
            current_token_estimate = 0

        current_batch.append(turn)
        current_token_estimate += turn_tokens

    if current_batch:
        batches.append(current_batch)

    log.debug(
        "batches_constructed",
        total_turns=len(turns),
        batch_count=len(batches),
        batch_sizes=[len(b) for b in batches],
    )
    return batches


# ─── User Prompt Builder ──────────────────────────────────────────────────────


def _build_user_prompt(batch: list[CleanedTranscriptTurn]) -> str:
    """Serialize a batch of turns into the user message payload.

    Uses an inline f-string template (not a separate .txt file) because
    this is pure data injection — the actual prompt engineering lives in
    cleanup_system.txt. The data delimiter (```json ... ```) makes it
    explicit to the model that this is data to process, not instructions
    to follow (prompt injection mitigation, per plan §7).
    """
    import json

    turns_payload = [
        {"turn_id": turn.turn_id, "text": turn.cleaned_text}
        for turn in batch
    ]
    return (
        "Clean the following transcript turns. "
        "Return a JSON object with a 'results' array as specified in your instructions.\n\n"
        "```json\n"
        f"{json.dumps(turns_payload, ensure_ascii=False, indent=2)}\n"
        "```"
    )


# ─── Guardrail ────────────────────────────────────────────────────────────────


def _apply_guardrail(
    turn: CleanedTranscriptTurn,
    model_cleaned_text: str,
) -> tuple[str, bool]:
    """Apply the length-ratio guardrail to one turn's model output.

    If ratio = len(cleaned) / len(original) falls outside [MIN, MAX]:
      - Discard model output
      - Revert to the filler-stripped text (the current cleaned_text value)
      - Set suspicious=True

    Returns:
        (final_cleaned_text, was_modified_suspiciously)
    """
    original_len = max(len(turn.original_text), 1)
    cleaned_len = len(model_cleaned_text)
    ratio = cleaned_len / original_len

    if ratio < LENGTH_RATIO_MIN or ratio > LENGTH_RATIO_MAX:
        log.warning(
            "guardrail_tripped",
            turn_id=turn.turn_id,
            ratio=round(ratio, 3),
            ratio_min=LENGTH_RATIO_MIN,
            ratio_max=LENGTH_RATIO_MAX,
            original_len=original_len,
            cleaned_len=cleaned_len,
            discarded_preview=model_cleaned_text[:100],
        )
        # Revert to filler-stripped text (turn.cleaned_text, NOT original_text)
        return turn.cleaned_text, True

    return model_cleaned_text, False


# ─── Single Batch Processor ───────────────────────────────────────────────────


async def _process_batch(
    batch: list[CleanedTranscriptTurn],
    batch_id: str,
    gemini_client: GeminiClient,
    system_prompt: str,
    semaphore: asyncio.Semaphore,
) -> CleanupBatchResult:
    """Process one batch: call Gemini, apply guardrail, return CleanupBatchResult.

    Per-batch failure isolation: exceptions from generate_structured (after
    Day 46's internal retries are exhausted) are caught HERE and returned as
    CleanupBatchResult(succeeded=False, ...) — they do NOT propagate out and
    abort sibling batches. This is Decision 5 made concrete.
    """
    turn_ids = [t.turn_id for t in batch]

    async with semaphore:
        try:
            user_prompt = _build_user_prompt(batch)
            call_result = await gemini_client.generate_structured(
                task_type=TaskType.TRANSCRIPT_CLEANUP,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_schema=CleanupBatchResponse,
            )

        except Exception as exc:
            # Any exception after Day 46's exhausted retries → partial failure
            log.warning(
                "grammar_batch_failed",
                batch_id=batch_id,
                turn_ids=turn_ids,
                error=str(exc)[:200],
            )
            return CleanupBatchResult(
                batch_id=batch_id,
                turn_ids=turn_ids,
                succeeded=False,
                cleaned_turns=None,
                error=str(exc),
            )

    # ── Map response back to turns by ID (not array position) ─────────────
    response_map: dict[str, str] = {
        item.turn_id: item.cleaned_text
        for item in call_result.data.results
    }

    cleaned_turns: list[CleanedTranscriptTurn] = []

    for turn in batch:
        model_text = response_map.get(turn.turn_id)

        if model_text is None:
            # Missing turn_id in model response — soft degradation, not hard error
            log.warning(
                "grammar_turn_missing_from_response",
                batch_id=batch_id,
                turn_id=turn.turn_id,
            )
            # Fall back to pre-Stage-2 text (filler-stripped only)
            cleaned_turns.append(turn.model_copy())
            continue

        # Apply the length-ratio guardrail
        final_text, was_suspicious = _apply_guardrail(turn, model_text)
        was_modified = final_text != turn.original_text

        cleaned_turn = turn.model_copy(
            update={
                "cleaned_text": final_text,
                "was_modified": was_modified,
                "was_modified_suspiciously": was_suspicious,
            }
        )
        cleaned_turns.append(cleaned_turn)

    log.info(
        "grammar_batch_succeeded",
        batch_id=batch_id,
        turns_in_batch=len(batch),
        turns_modified=sum(1 for t in cleaned_turns if t.was_modified),
        turns_suspicious=sum(1 for t in cleaned_turns if t.was_modified_suspiciously),
        latency_ms=round(call_result.latency_ms, 1),
        cost_usd=call_result.cost.estimated_cost_usd,
    )

    return CleanupBatchResult(
        batch_id=batch_id,
        turn_ids=turn_ids,
        succeeded=True,
        cleaned_turns=cleaned_turns,
        error=None,
    )


# ─── Public API ───────────────────────────────────────────────────────────────


async def normalize_batches(
    turns: list[CleanedTranscriptTurn],
    gemini_client: GeminiClient,
) -> list[CleanupBatchResult]:
    """Stage 2: Batch-normalize grammar/punctuation via Gemini-on-OpenRouter.

    Steps:
      1. Load system prompt (once, cached after first call).
      2. Build batches respecting GRAMMAR_BATCH_MAX_TURNS + MAX_TOKENS.
      3. Dispatch all batches concurrently, bounded by CLEANUP_BATCH_CONCURRENCY
         (nested inside Day 46's global GeminiClient semaphore as the outer ceiling).
      4. Each batch is individually failure-isolated — one failed batch does not
         abort the rest (Decision 5).

    Args:
        turns: Post-Stage-1.5 (filler-stripped) CleanedTranscriptTurn list.
        gemini_client: The process-singleton GeminiClient from app.state.

    Returns:
        List of CleanupBatchResult, one per batch. Some may have succeeded=False.
        The caller (transcript_cleaner.py) handles the fallback for failed batches.
    """
    if not turns:
        log.debug("normalize_batches_empty_input")
        return []

    system_prompt, _prompt_version = _load_prompt()
    batches = _build_batches(turns)

    # Cleanup-stage local semaphore — nested inside the GeminiClient's own semaphore
    semaphore = asyncio.Semaphore(CLEANUP_BATCH_CONCURRENCY)

    # Coroutines for each batch — NOTE: return_exceptions=False is deliberate.
    # Each coroutine already converts its own exceptions to CleanupBatchResult(succeeded=False),
    # so gather() never actually sees a raised exception in the normal-degradation case.
    # return_exceptions=True would silently swallow unexpected bugs alongside expected failures.
    batch_coroutines = [
        _process_batch(
            batch=batch,
            batch_id=str(uuid.uuid4()),
            gemini_client=gemini_client,
            system_prompt=system_prompt,
            semaphore=semaphore,
        )
        for batch in batches
    ]

    results: list[CleanupBatchResult] = await asyncio.gather(*batch_coroutines)

    succeeded_count = sum(1 for r in results if r.succeeded)
    log.info(
        "normalize_batches_complete",
        total_batches=len(results),
        succeeded=succeeded_count,
        failed=len(results) - succeeded_count,
    )

    return results


def get_prompt_version() -> str:
    """Return the loaded prompt version string.

    Loads the prompt if not already cached. Used by transcript_cleaner.py
    to populate CleanupMetadata.prompt_version.
    """
    _, version = _load_prompt()
    return version
