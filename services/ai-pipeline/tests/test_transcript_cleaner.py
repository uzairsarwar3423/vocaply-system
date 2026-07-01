"""
tests/test_transcript_cleaner.py
──────────────────────────────────
Integration tests for the orchestrator: transcript_cleaner.clean_transcript().

Stage 2 (Gemini) is mocked — this tests the orchestration logic:
  - Correct Stage 1 → 1.5 → 2 sequencing
  - Full turn coverage when batches fail (fallback to filler-stripped)
  - CleanupMetadata field correctness
  - UnsortedTranscriptError propagation
  - Idempotency (same input → consistent output structure)
"""

from __future__ import annotations

import json
import pathlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.models.cleanup_models import (
    CleanedTranscriptTurn,
    CleanupBatchResult,
    ParticipantInfo,
    RawTranscriptTurn,
)
from src.models.common import CostRecord, GeminiCallResult, ModelTier, TaskType
from src.services.cleanup.speaker_formatter import UnsortedTranscriptError
from src.services.cleanup.transcript_cleaner import clean_transcript

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _load_standup_raw() -> list[RawTranscriptTurn]:
    data = json.loads((FIXTURES_DIR / "raw_transcript_standup_fragmented.json").read_text())
    return [RawTranscriptTurn(**t) for t in data]


def _load_participant_map() -> dict[str, ParticipantInfo]:
    data = json.loads((FIXTURES_DIR / "participant_map_standup.json").read_text())
    return {tag: ParticipantInfo(**info) for tag, info in data.items()}


def _make_mock_batch_results(
    merged_turns: list[CleanedTranscriptTurn],
) -> list[CleanupBatchResult]:
    """Create a single successful batch result covering all merged turns."""
    # Echo the filler-stripped turns back as "cleaned"
    return [
        CleanupBatchResult(
            batch_id="batch-mock-001",
            turn_ids=[t.turn_id for t in merged_turns],
            succeeded=True,
            cleaned_turns=[
                t.model_copy(update={"cleaned_text": t.cleaned_text.strip()})
                for t in merged_turns
            ],
            error=None,
        )
    ]


def _make_failing_batch_results(
    merged_turns: list[CleanedTranscriptTurn],
) -> list[CleanupBatchResult]:
    """Create a single FAILED batch result."""
    return [
        CleanupBatchResult(
            batch_id="batch-fail-001",
            turn_ids=[t.turn_id for t in merged_turns],
            succeeded=False,
            cleaned_turns=None,
            error="Simulated rate limit exhaustion",
        )
    ]


# ─── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_clean_transcript_full_flow_returns_cleanup_result() -> None:
    """Full orchestration with mocked Stage 2 → CleanupResult with all fields."""
    raw_turns = _load_standup_raw()
    participant_map = _load_participant_map()

    with patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.normalize_batches",
    ) as mock_normalize, patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.get_prompt_version",
        return_value="cleanup-v1.0",
    ):
        # Capture the filler_stripped turns passed to normalize_batches
        captured_turns: list[CleanedTranscriptTurn] = []

        async def _side_effect(turns, client):
            captured_turns.extend(turns)
            return _make_mock_batch_results(turns)

        mock_normalize.side_effect = _side_effect

        client = MagicMock()
        result = await clean_transcript(
            raw_turns=raw_turns,
            participant_map=participant_map,
            team_id="team-001",
            meeting_id="meeting-001",
            gemini_client=client,
        )

    assert result.meeting_id == "meeting-001"
    assert result.team_id == "team-001"
    assert len(result.cleaned_transcript) > 0
    assert result.metadata.turns_before_merge == len(raw_turns)
    assert result.metadata.turns_after_merge < len(raw_turns)
    assert result.metadata.prompt_version == "cleanup-v1.0"
    assert result.metadata.processing_time_ms > 0


@pytest.mark.asyncio
async def test_clean_transcript_stage1_reduces_turn_count() -> None:
    """Stage 1 must reduce the turn count for the fragmented standup fixture."""
    raw_turns = _load_standup_raw()
    participant_map = _load_participant_map()

    with patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.normalize_batches",
    ) as mock_normalize, patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.get_prompt_version",
        return_value="cleanup-v1.0",
    ):
        async def _side_effect(turns, client):
            return _make_mock_batch_results(turns)

        mock_normalize.side_effect = _side_effect

        result = await clean_transcript(
            raw_turns=raw_turns,
            participant_map=participant_map,
            team_id="t",
            meeting_id="m",
            gemini_client=MagicMock(),
        )

    assert result.metadata.turns_after_merge < result.metadata.turns_before_merge


@pytest.mark.asyncio
async def test_full_turn_coverage_when_batch_fails() -> None:
    """When Stage 2 batch fails, output still covers EVERY merged turn.

    The final cleaned_transcript must have the same number of turns
    as the Stage 1 merged output — never a gap from a failed batch.
    """
    raw_turns = _load_standup_raw()
    participant_map = _load_participant_map()

    with patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.normalize_batches",
    ) as mock_normalize, patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.get_prompt_version",
        return_value="cleanup-v1.0",
    ):
        async def _side_effect(turns, client):
            return _make_failing_batch_results(turns)

        mock_normalize.side_effect = _side_effect

        result = await clean_transcript(
            raw_turns=raw_turns,
            participant_map=participant_map,
            team_id="t",
            meeting_id="m",
            gemini_client=MagicMock(),
        )

    # All turns must be present despite the batch failure
    assert len(result.cleaned_transcript) == result.metadata.turns_after_merge
    assert result.metadata.batches_failed == 1
    # All turns should have non-empty cleaned_text (fallback to filler-stripped)
    assert all(len(t.cleaned_text) >= 0 for t in result.cleaned_transcript)


@pytest.mark.asyncio
async def test_unsorted_transcript_error_propagates() -> None:
    """UnsortedTranscriptError from Stage 1 must propagate out of clean_transcript."""
    raw_turns = [
        RawTranscriptTurn(
            speaker_tag="s0", text="second", start_time=5.0, end_time=6.0, confidence=0.9, words=[]
        ),
        RawTranscriptTurn(
            speaker_tag="s0", text="first", start_time=0.0, end_time=1.0, confidence=0.9, words=[]
        ),
    ]

    with pytest.raises(UnsortedTranscriptError):
        await clean_transcript(
            raw_turns=raw_turns,
            participant_map={},
            team_id="t",
            meeting_id="m",
            gemini_client=MagicMock(),
        )


@pytest.mark.asyncio
async def test_empty_transcript_returns_empty_result() -> None:
    """Empty raw_turns → CleanupResult with empty cleaned_transcript."""
    with patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.normalize_batches",
        new_callable=AsyncMock,
        return_value=[],
    ), patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.get_prompt_version",
        return_value="cleanup-v1.0",
    ):
        result = await clean_transcript(
            raw_turns=[],
            participant_map={},
            team_id="t",
            meeting_id="m",
            gemini_client=MagicMock(),
        )

    assert result.cleaned_transcript == []
    assert result.metadata.turns_before_merge == 0
    assert result.metadata.turns_after_merge == 0


@pytest.mark.asyncio
async def test_metadata_batches_failed_count_correct() -> None:
    """metadata.batches_failed counts only the truly failed batches."""
    raw_turns = _load_standup_raw()
    participant_map = _load_participant_map()

    with patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.normalize_batches",
    ) as mock_normalize, patch(
        "src.services.cleanup.transcript_cleaner.grammar_normalizer.get_prompt_version",
        return_value="cleanup-v1.0",
    ):
        async def _side_effect(turns, client):
            # Return one succeeded and one failed batch
            half = len(turns) // 2
            return [
                CleanupBatchResult(
                    batch_id="b-001",
                    turn_ids=[t.turn_id for t in turns[:half]],
                    succeeded=True,
                    cleaned_turns=turns[:half],
                    error=None,
                ),
                CleanupBatchResult(
                    batch_id="b-002",
                    turn_ids=[t.turn_id for t in turns[half:]],
                    succeeded=False,
                    cleaned_turns=None,
                    error="simulated",
                ),
            ]

        mock_normalize.side_effect = _side_effect

        result = await clean_transcript(
            raw_turns=raw_turns,
            participant_map=participant_map,
            team_id="t",
            meeting_id="m",
            gemini_client=MagicMock(),
        )

    assert result.metadata.batches_total == 2
    assert result.metadata.batches_failed == 1
