"""
tests/test_grammar_normalizer.py
─────────────────────────────────
Unit tests for Stage 2: grammar_normalizer.normalize_batches().

All Gemini calls are MOCKED — no live network calls, no API key needed.
Uses pytest-asyncio for async test support.

Coverage per the Day 47 DoD checklist:
  [x] Batch construction respects GRAMMAR_BATCH_MAX_TURNS limit
  [x] Batch construction respects GRAMMAR_BATCH_MAX_TOKENS limit
  [x] Response mapped by turn_id regardless of response array ordering
  [x] Missing turn_id in response → fallback to pre-Stage-2 text, logged warning
  [x] Guardrail: suspicious ratio (10% of original) → was_modified_suspiciously=True,
      cleaned_text reverted, model output NEVER in returned object
  [x] Guardrail: acceptable ratio → passes through, was_modified_suspiciously=False
  [x] Batch-level failure (Gemini exception) → CleanupBatchResult(succeeded=False)
      without propagating, sibling batches unaffected
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.cleanup_config import (
    GRAMMAR_BATCH_MAX_TOKENS,
    GRAMMAR_BATCH_MAX_TURNS,
    LENGTH_RATIO_MAX,
    LENGTH_RATIO_MIN,
)
from src.models.cleanup_models import CleanedTranscriptTurn
from src.models.common import CostRecord, GeminiCallResult, ModelTier, TaskType
from src.models.exceptions import GeminiRateLimitExhaustedError
from src.services.cleanup.grammar_normalizer import (
    CleanupBatchResponse,
    TurnCleanupItem,
    _build_batches,
    normalize_batches,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_cleaned_turn(
    turn_id: str,
    text: str,
    original_text: str | None = None,
) -> CleanedTranscriptTurn:
    return CleanedTranscriptTurn(
        turn_id=turn_id,
        cleaned_text=text,
        original_text=original_text or text,
        speaker_name="Speaker",
        speaker_user_id=None,
        start_time=0.0,
        end_time=1.0,
        filler_words_removed=0,
        was_modified=False,
        was_modified_suspiciously=False,
        uncertain=False,
    )


def _make_cost_record() -> CostRecord:
    return CostRecord(
        input_tokens=100,
        output_tokens=80,
        model_tier=ModelTier.FLASH_LITE,
        model_name="google/gemini-2.5-flash-lite",
        estimated_cost_usd=0.001,
    )


def _make_call_result(batch_response: CleanupBatchResponse) -> GeminiCallResult:
    return GeminiCallResult(
        data=batch_response,
        cost=_make_cost_record(),
        latency_ms=350.0,
        retry_count=0,
        task_type=TaskType.TRANSCRIPT_CLEANUP,
        model_name="google/gemini-2.5-flash-lite",
    )


def _mock_gemini_client(batch_response: CleanupBatchResponse) -> MagicMock:
    """Create a mocked GeminiClient that returns the given response."""
    client = MagicMock()
    client.generate_structured = AsyncMock(return_value=_make_call_result(batch_response))
    return client


# ─── Test: Batch construction — MAX_TURNS limit ───────────────────────────────


def test_batch_construction_respects_max_turns() -> None:
    """Turns exceeding GRAMMAR_BATCH_MAX_TURNS are split into multiple batches."""
    n_turns = GRAMMAR_BATCH_MAX_TURNS * 2 + 1
    # Short text so token limit doesn't fire first
    turns = [_make_cleaned_turn(f"t-{i}", "hello world") for i in range(n_turns)]

    batches = _build_batches(turns)

    assert len(batches) >= 3, f"Expected ≥3 batches for {n_turns} turns, got {len(batches)}"
    assert all(len(b) <= GRAMMAR_BATCH_MAX_TURNS for b in batches)


def test_batch_construction_no_batch_exceeds_max_turns() -> None:
    """No individual batch may exceed GRAMMAR_BATCH_MAX_TURNS."""
    turns = [_make_cleaned_turn(f"t-{i}", "text") for i in range(100)]
    batches = _build_batches(turns)
    for i, batch in enumerate(batches):
        assert len(batch) <= GRAMMAR_BATCH_MAX_TURNS, (
            f"Batch {i} has {len(batch)} turns, exceeds limit {GRAMMAR_BATCH_MAX_TURNS}"
        )


def test_batch_construction_respects_max_tokens() -> None:
    """Long-text turns should trigger the token limit before the turn limit."""
    # Each turn is ~500 words * 1.3 ≈ 650 tokens → 4 turns already exceeds 2000
    long_text = "word " * 500
    turns = [_make_cleaned_turn(f"t-{i}", long_text) for i in range(10)]
    batches = _build_batches(turns)

    # With ~650 tokens per turn and 2000 token limit, each batch should be ≤3 turns
    assert all(len(b) <= 4 for b in batches), "Token limit should cap batches at ≤4 turns"
    assert len(batches) > 1, "Multiple batches expected for long-text turns"


def test_batch_construction_covers_all_input_turns() -> None:
    """Every input turn must appear in exactly one batch — no duplicates, no gaps."""
    turns = [_make_cleaned_turn(f"t-{i}", "some text") for i in range(50)]
    batches = _build_batches(turns)

    all_ids = [t.turn_id for batch in batches for t in batch]
    assert sorted(all_ids) == sorted(t.turn_id for t in turns)


# ─── Test: ID-based response mapping (not position-based) ────────────────────


@pytest.mark.asyncio
async def test_response_mapped_by_turn_id_regardless_of_order() -> None:
    """Model returns items in a different order than input → correctly mapped by turn_id."""
    turns = [
        _make_cleaned_turn("t-alpha", "first turn"),
        _make_cleaned_turn("t-beta", "second turn"),
        _make_cleaned_turn("t-gamma", "third turn"),
    ]

    # Response arrives in reverse order — ID-based mapping must handle this
    batch_response = CleanupBatchResponse(results=[
        TurnCleanupItem(turn_id="t-gamma", cleaned_text="Third turn."),
        TurnCleanupItem(turn_id="t-alpha", cleaned_text="First turn."),
        TurnCleanupItem(turn_id="t-beta", cleaned_text="Second turn."),
    ])

    with patch(
        "src.services.cleanup.grammar_normalizer._load_prompt",
        return_value=("mock system prompt", "cleanup-v1.0"),
    ):
        client = _mock_gemini_client(batch_response)
        results = await normalize_batches(turns, client)

    assert len(results) == 1
    assert results[0].succeeded
    # Verify mapping by turn_id
    result_map = {t.turn_id: t for t in results[0].cleaned_turns}
    assert result_map["t-alpha"].cleaned_text == "First turn."
    assert result_map["t-beta"].cleaned_text == "Second turn."
    assert result_map["t-gamma"].cleaned_text == "Third turn."


# ─── Test: Missing turn_id in response → fallback, no crash ──────────────────


@pytest.mark.asyncio
async def test_missing_turn_id_in_response_falls_back_gracefully() -> None:
    """turn_id absent from model response → pre-Stage-2 text used, no exception."""
    turns = [
        _make_cleaned_turn("t-001", "original text one"),
        _make_cleaned_turn("t-002", "original text two"),
    ]

    # Model only returns t-001 — t-002 is missing
    batch_response = CleanupBatchResponse(results=[
        TurnCleanupItem(turn_id="t-001", cleaned_text="Cleaned text one."),
    ])

    with patch(
        "src.services.cleanup.grammar_normalizer._load_prompt",
        return_value=("mock system prompt", "cleanup-v1.0"),
    ):
        client = _mock_gemini_client(batch_response)
        results = await normalize_batches(turns, client)

    assert results[0].succeeded
    result_map = {t.turn_id: t for t in results[0].cleaned_turns}

    # t-001 should be cleaned
    assert result_map["t-001"].cleaned_text == "Cleaned text one."
    # t-002 should fall back to its pre-Stage-2 text
    assert result_map["t-002"].cleaned_text == "original text two"
    assert not result_map["t-002"].was_modified_suspiciously


# ─── Test: Guardrail — suspicious output discarded ───────────────────────────


@pytest.mark.asyncio
async def test_guardrail_trips_on_over_condensed_output() -> None:
    """Model returns 10% of original length → guardrail trips, model output discarded."""
    original = "The quarterly results were significantly above expectations and the team performed well."
    filler_stripped = "The quarterly results were above expectations and team performed well."
    # Model output at ~10% of original length → should trip guardrail
    suspicious_cleaned = "Good results."

    turns = [
        CleanedTranscriptTurn(
            turn_id="t-suspect",
            cleaned_text=filler_stripped,     # filler-stripped text
            original_text=original,           # original ASR
            speaker_name="Speaker",
            speaker_user_id=None,
            start_time=0.0,
            end_time=3.0,
            filler_words_removed=2,
            was_modified=False,
            was_modified_suspiciously=False,
            uncertain=False,
        )
    ]

    batch_response = CleanupBatchResponse(results=[
        TurnCleanupItem(turn_id="t-suspect", cleaned_text=suspicious_cleaned),
    ])

    with patch(
        "src.services.cleanup.grammar_normalizer._load_prompt",
        return_value=("mock system prompt", "cleanup-v1.0"),
    ):
        client = _mock_gemini_client(batch_response)
        results = await normalize_batches(turns, client)

    assert results[0].succeeded
    result_turn = results[0].cleaned_turns[0]

    # Guardrail must have tripped
    assert result_turn.was_modified_suspiciously is True
    # Model's suspicious output must NEVER appear in the returned object
    assert result_turn.cleaned_text != suspicious_cleaned
    # Reverted to filler-stripped version
    assert result_turn.cleaned_text == filler_stripped


@pytest.mark.asyncio
async def test_guardrail_does_not_trip_on_acceptable_ratio() -> None:
    """Model output within [0.5x, 1.1x] ratio passes through unmodified."""
    original = "um we need to ship this feature before friday deadline"
    filler_stripped = "we need to ship this feature before friday deadline"
    # Acceptable cleanup: same meaning, slightly shorter
    cleaned = "We need to ship this feature before the Friday deadline."

    turns = [
        CleanedTranscriptTurn(
            turn_id="t-ok",
            cleaned_text=filler_stripped,
            original_text=original,
            speaker_name="Speaker",
            speaker_user_id=None,
            start_time=0.0,
            end_time=3.0,
            filler_words_removed=1,
            was_modified=False,
            was_modified_suspiciously=False,
            uncertain=False,
        )
    ]

    batch_response = CleanupBatchResponse(results=[
        TurnCleanupItem(turn_id="t-ok", cleaned_text=cleaned),
    ])

    with patch(
        "src.services.cleanup.grammar_normalizer._load_prompt",
        return_value=("mock system prompt", "cleanup-v1.0"),
    ):
        client = _mock_gemini_client(batch_response)
        results = await normalize_batches(turns, client)

    assert results[0].succeeded
    result_turn = results[0].cleaned_turns[0]
    assert result_turn.was_modified_suspiciously is False
    assert result_turn.cleaned_text == cleaned


# ─── Test: Batch failure → CleanupBatchResult(succeeded=False) ───────────────


@pytest.mark.asyncio
async def test_batch_gemini_exception_returns_failed_result_not_raises() -> None:
    """Gemini raises GeminiRateLimitExhaustedError → CleanupBatchResult(succeeded=False).

    Must NOT propagate the exception — partial failure isolation (Decision 5).
    """
    turns = [_make_cleaned_turn("t-001", "some text")]

    failing_client = MagicMock()
    failing_client.generate_structured = AsyncMock(
        side_effect=GeminiRateLimitExhaustedError(
            "Rate limit exhausted",
            task_type=TaskType.TRANSCRIPT_CLEANUP,
            model_tier=ModelTier.FLASH_LITE,
            attempt_count=3,
        )
    )

    with patch(
        "src.services.cleanup.grammar_normalizer._load_prompt",
        return_value=("mock system prompt", "cleanup-v1.0"),
    ):
        # Must NOT raise — exception must be converted to failed result
        results = await normalize_batches(turns, failing_client)

    assert len(results) == 1
    assert results[0].succeeded is False
    assert results[0].cleaned_turns is None
    assert results[0].error is not None
    assert len(results[0].error) > 0


@pytest.mark.asyncio
async def test_one_batch_failure_does_not_abort_sibling_batches() -> None:
    """With 2 batches: first fails, second succeeds → both results present."""
    # Need enough turns to produce exactly 2 batches
    # Short text turns to stay under token limit, just enough for 2 batches
    turns = [_make_cleaned_turn(f"t-{i}", "hello world") for i in range(GRAMMAR_BATCH_MAX_TURNS + 2)]

    call_count = 0

    async def _side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise GeminiRateLimitExhaustedError(
                "first batch fails",
                task_type=TaskType.TRANSCRIPT_CLEANUP,
                model_tier=ModelTier.FLASH_LITE,
            )
        # Second call succeeds
        batch_response = CleanupBatchResponse(results=[
            TurnCleanupItem(turn_id=t.turn_id, cleaned_text=t.cleaned_text)
            for t in turns[GRAMMAR_BATCH_MAX_TURNS:]
        ])
        return _make_call_result(batch_response)

    client = MagicMock()
    client.generate_structured = AsyncMock(side_effect=_side_effect)

    with patch(
        "src.services.cleanup.grammar_normalizer._load_prompt",
        return_value=("mock system prompt", "cleanup-v1.0"),
    ):
        results = await normalize_batches(turns, client)

    assert len(results) == 2
    failed = [r for r in results if not r.succeeded]
    succeeded = [r for r in results if r.succeeded]
    assert len(failed) == 1
    assert len(succeeded) == 1


# ─── Test: Empty input ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_normalize_batches_empty_input() -> None:
    client = MagicMock()
    results = await normalize_batches([], client)
    assert results == []
    client.generate_structured.assert_not_called()
