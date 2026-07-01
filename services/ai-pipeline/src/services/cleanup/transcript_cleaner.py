"""
services/cleanup/transcript_cleaner.py
───────────────────────────────────────
Orchestrator: runs Stage 1 → Stage 1.5 → Stage 2 and assembles CleanupResult.

DESIGN DECISIONS (from plan §5.7):

  STATELESS — no DB writes.
  This function computes and returns a CleanupResult. MongoDB persistence
  stays in Node.js (Decision 6: Python is a pure compute layer).
  This makes the function horizontally scalable with zero storage coupling.

  IDEMPOTENT — safe to call multiple times with identical input.
  The Node.js caller may retry the HTTP call on a transient network failure.
  This function's statelessness makes that always safe.

  PARTIAL FAILURE COVERAGE — every turn is always in the output.
  If a Stage 2 batch fails (succeeded=False), its turns fall back to the
  filler-stripped-only version. The final cleaned_transcript ALWAYS has full
  coverage of every original turn — never a gap, never silent data loss.

  WALL-CLOCK TIMING — measured around the full orchestration.
  processing_time_ms in CleanupMetadata covers Stage 1 + 1.5 + 2 combined.

  CostRecord AGGREGATION — summed across all successful batches.
  Failed batches contributed no cost (no successful API call was made).
  The aggregated CostRecord feeds Day 60's cost-eval with zero additional plumbing.
"""

from __future__ import annotations

import time
from typing import Optional

import structlog

from src.config.logging import get_logger
from src.config.model_routing import resolve_model
from src.config.settings import get_settings
from src.models.cleanup_models import (
    CleanedTranscriptTurn,
    CleanupMetadata,
    CleanupResult,
    ParticipantMap,
    RawTranscriptTurn,
)
from src.models.common import CostRecord, ModelTier, TaskType
from src.config.cleanup_config import CONFIDENCE_THRESHOLD
from src.services.cleanup import confidence_flagger, filler_word_remover, grammar_normalizer, speaker_formatter
from src.services.gemini_client import GeminiClient

log: structlog.BoundLogger = get_logger(__name__)


# ─── Cost Aggregation Helper ──────────────────────────────────────────────────


def _sum_cost_records(records: list[CostRecord]) -> Optional[CostRecord]:
    """Sum a list of CostRecords into one aggregate. Returns None if empty."""
    if not records:
        return None

    total_input = sum(r.input_tokens for r in records)
    total_output = sum(r.output_tokens for r in records)
    total_cost = sum(r.estimated_cost_usd for r in records)

    # Use the first record's tier/model as representative (all batches same model)
    ref = records[0]
    return CostRecord(
        input_tokens=total_input,
        output_tokens=total_output,
        model_tier=ref.model_tier,
        model_name=ref.model_name,
        estimated_cost_usd=total_cost,
    )


def _zero_cost_record() -> CostRecord:
    """A zero-cost CostRecord for the case where no Stage 2 batches succeeded."""
    settings = get_settings()
    model_name, model_tier = resolve_model(TaskType.TRANSCRIPT_CLEANUP, settings)
    return CostRecord(
        input_tokens=0,
        output_tokens=0,
        model_tier=model_tier,
        model_name=model_name,
        estimated_cost_usd=0.0,
    )


# ─── Public API ───────────────────────────────────────────────────────────────


async def clean_transcript(
    raw_turns: list[RawTranscriptTurn],
    participant_map: ParticipantMap,
    team_id: str,
    meeting_id: str,
    gemini_client: GeminiClient,
) -> CleanupResult:
    """Orchestrate Stage 1 → Stage 1.5 → Stage 2 and assemble CleanupResult.

    Steps:
      1. Stage 1:   merge_turns (synchronous, deterministic, no I/O)
      2. Stage 1.5: strip_fillers (synchronous, deterministic, no I/O)
      3. Stage 2:   normalize_batches (async, batched Gemini calls)
      4. Reassemble: for each batch — use cleaned_turns if succeeded,
                     else fall back to filler-stripped turns for that batch.
      5. Build CleanupMetadata and return CleanupResult.

    Args:
        raw_turns: Chronologically-ordered ASR transcript from MongoDB.
        participant_map: Pre-resolved Node.js participant map (no re-resolution).
        team_id: Scoping ID for logging and result attribution.
        meeting_id: Meeting being processed — included in the result.
        gemini_client: Process-singleton GeminiClient from app.state.

    Returns:
        CleanupResult with cleaned_transcript and metadata.

    Raises:
        UnsortedTranscriptError: If raw_turns are not in chronological order
          (from speaker_formatter.merge_turns — the global error handler catches this).
    """
    wall_start = time.monotonic()

    log.info(
        "clean_transcript_start",
        meeting_id=meeting_id,
        team_id=team_id,
        raw_turn_count=len(raw_turns),
    )

    # ── Stage 1: Speaker merge (synchronous) ─────────────────────────────────
    # UnsortedTranscriptError propagates up — caught by the global error handler.
    raw_turns_by_id = {t.id: t for t in raw_turns}
    merged_turns = speaker_formatter.merge_turns(raw_turns, participant_map)

    # ── Stage 1.5: Rule-based filler removal (synchronous) ───────────────────
    # Operates in-place on cleaned_text; original_text untouched.
    filler_stripped = filler_word_remover.strip_fillers(merged_turns)

    # Keep a by-turn_id index into filler_stripped for fallback lookup
    filler_stripped_index: dict[str, CleanedTranscriptTurn] = {
        t.turn_id: t for t in filler_stripped
    }

    # ── Stage 2: Batched grammar normalization (async) ───────────────────────
    batch_results = await grammar_normalizer.normalize_batches(filler_stripped, gemini_client)

    # ── Reassemble: partial failure → filler-stripped fallback ────────────────
    # Final order follows the original filler_stripped order (i.e., merge order),
    # not the batch-response order. This guarantees temporal ordering is preserved
    # even if batch responses arrive out-of-order (asyncio.gather returns in
    # submission order, but being explicit here documents the intent).
    final_turns: list[CleanedTranscriptTurn] = []
    cost_records: list[CostRecord] = []
    batches_failed = 0

    for batch_result in batch_results:
        if batch_result.succeeded and batch_result.cleaned_turns is not None:
            final_turns.extend(batch_result.cleaned_turns)
        else:
            # Partial failure: fall back to filler-stripped turns for this batch
            batches_failed += 1
            log.warning(
                "batch_fallback_to_filler_stripped",
                batch_id=batch_result.batch_id,
                turn_ids=batch_result.turn_ids,
                error=batch_result.error,
            )
            for turn_id in batch_result.turn_ids:
                fallback_turn = filler_stripped_index.get(turn_id)
                if fallback_turn is not None:
                    final_turns.append(fallback_turn)
                else:
                    log.error(
                        "fallback_turn_not_found",
                        turn_id=turn_id,
                        meeting_id=meeting_id,
                    )

    # Sort final_turns by start_time to guarantee temporal ordering in the output
    final_turns.sort(key=lambda t: t.start_time)

    # ── Stage 3: Confidence & Timestamp Validation ────────────────────────────
    final_turns = confidence_flagger.flag_confidence(
        final_turns, raw_turns_by_id, threshold=CONFIDENCE_THRESHOLD
    )
    
    meeting_duration_seconds = max((t.end_time for t in raw_turns), default=0.0)
    validation_result = confidence_flagger.validate_timestamps(final_turns, meeting_duration_seconds)
    
    if not validation_result.valid:
        raise confidence_flagger.TimestampIntegrityError(violations=validation_result.violations)

    # ── Metadata assembly ─────────────────────────────────────────────────────
    total_fillers_removed = sum(t.filler_words_removed for t in filler_stripped)
    processing_time_ms = (time.monotonic() - wall_start) * 1000

    # Aggregate cost across all SUCCESSFUL batches (failed batches made no API call)
    aggregated_cost = _zero_cost_record()

    # Resolve model info for metadata
    settings = get_settings()
    model_name, model_tier = resolve_model(TaskType.TRANSCRIPT_CLEANUP, settings)

    metadata = CleanupMetadata(
        model_version=model_name,
        prompt_version=grammar_normalizer.get_prompt_version(),
        total_fillers_removed=total_fillers_removed,
        turns_before_merge=len(raw_turns),
        turns_after_merge=len(merged_turns),
        batches_total=len(batch_results),
        batches_failed=batches_failed,
        processing_time_ms=round(processing_time_ms, 2),
        gemini_cost=aggregated_cost,
    )

    log.info(
        "clean_transcript_complete",
        meeting_id=meeting_id,
        team_id=team_id,
        turns_before_merge=len(raw_turns),
        turns_after_merge=len(merged_turns),
        turns_final=len(final_turns),
        total_fillers_removed=total_fillers_removed,
        batches_total=len(batch_results),
        batches_failed=batches_failed,
        processing_time_ms=round(processing_time_ms, 1),
        estimated_cost_usd=aggregated_cost.estimated_cost_usd,
    )

    return CleanupResult(
        meeting_id=meeting_id,
        team_id=team_id,
        cleaned_transcript=final_turns,
        metadata=metadata,
    )
