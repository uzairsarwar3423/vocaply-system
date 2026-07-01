"""
services/cleanup/speaker_formatter.py
───────────────────────────────────────
Stage 1: Deterministic speaker-turn merging and participant name resolution.

DESIGN DECISIONS (from plan §2 and §5.4):

  DECISION 1 — Zero LLM dependency:
    Speaker-turn merging is a pure deterministic algorithm over timestamps
    and speaker tags. There is no ambiguity an LLM needs to resolve here.
    Not every step in an "AI pipeline" needs to call an AI model.

  DECISION 2 — Never re-resolve identity in Python:
    The Node.js meetings module owns participant resolution. This function
    receives an already-resolved ParticipantMap and does pure lookup.
    Two independent implementations of "who is Speaker 1" is a guaranteed
    long-term source of silent disagreement. One source of truth, full stop.

  Sort invariant:
    raw_turns are trusted to arrive in chronological order (per the
    Recall.ai / MongoDB contract). This function does NOT re-sort silently —
    it ASSERTS the invariant and raises UnsortedTranscriptError if violated,
    since silent re-sorting would mask upstream bugs rather than surface them.

  Unresolved speaker handling:
    participant_map miss is NOT an error. External / unregistered participants
    are explicitly documented platform behavior ("External participant" in UI).
    Fallback: raw speaker_name > speaker_email > "Unknown Speaker".
    Never raise for an unresolved speaker.

  Cross-talk (overlapping timestamps):
    A real ASR diarization artifact. Two turns from different speakers with
    overlapping timestamps are NEVER merged (speaker-tag equality is the
    primary gate). Logged at DEBUG, never blocks processing.
"""

from __future__ import annotations

import uuid
from typing import Optional

import structlog

from src.config.cleanup_config import SPEAKER_MERGE_TIME_GAP_SECONDS
from src.config.logging import get_logger
from src.models.cleanup_models import (
    CleanedTranscriptTurn,
    ParticipantMap,
    RawTranscriptTurn,
)

log: structlog.BoundLogger = get_logger(__name__)


# ─── Custom Exceptions ────────────────────────────────────────────────────────


class UnsortedTranscriptError(Exception):
    """Raised when raw_turns arrive in non-chronological order.

    This is a fail-loud design: silently re-sorting would mask upstream
    bugs in the Recall.ai → MongoDB → Node.js → Python data path.
    Surface the violation explicitly so it gets fixed at the source.
    """

    def __init__(self, message: str, prev_start: float, curr_start: float, index: int) -> None:
        super().__init__(message)
        self.prev_start = prev_start
        self.curr_start = curr_start
        self.index = index


# ─── Internal Helpers ─────────────────────────────────────────────────────────


def _resolve_speaker(
    speaker_tag: str,
    raw_speaker_name: Optional[str],
    raw_speaker_email: Optional[str],
    participant_map: ParticipantMap,
) -> tuple[str, Optional[str]]:
    """Resolve speaker_tag → (display_name, user_id).

    Priority: participant_map hit > raw_speaker_name > raw_speaker_email > "Unknown Speaker".

    Returns:
        (display_name, user_id_or_none)
    """
    participant = participant_map.get(speaker_tag)
    if participant is not None:
        return participant.name, participant.user_id

    # Graceful fallback for unresolved/external participants
    if raw_speaker_name:
        return raw_speaker_name, None
    if raw_speaker_email:
        # Use email as display name if no name is available
        return raw_speaker_email, None
    if speaker_tag and speaker_tag != "Unknown Speaker" and not speaker_tag.startswith("speaker_"):
        # The tag itself might be the extracted participant name
        return speaker_tag, None

    return "Unknown Speaker", None


def _flush_accumulator(
    text_parts: list[str],
    speaker_name: str,
    speaker_user_id: Optional[str],
    start_time: float,
    end_time: float,
    original_text_parts: list[str],
    raw_turn_ids: list[str],
) -> CleanedTranscriptTurn:
    """Build a CleanedTranscriptTurn from accumulated turn fragments.

    turn_id is a fresh UUID4 assigned at flush time — stable for the
    lifetime of this transcript run, used as the ID-based zip key in Stage 2.
    cleaned_text == original_text at this point (Stage 2 hasn't run yet).
    """
    combined_text = " ".join(text_parts)
    combined_original = " ".join(original_text_parts)

    return CleanedTranscriptTurn(
        turn_id=str(uuid.uuid4()),
        cleaned_text=combined_text,       # Stage 2 will update this field
        original_text=combined_original,  # Never mutated after this point
        speaker_name=speaker_name,
        speaker_user_id=speaker_user_id,
        start_time=start_time,
        end_time=end_time,
        filler_words_removed=0,           # Stage 1.5 (filler_word_remover) populates
        was_modified=False,
        was_modified_suspiciously=False,
        uncertain=False,
        raw_turn_ids=raw_turn_ids,
    )


# ─── Public API ───────────────────────────────────────────────────────────────


def merge_turns(
    raw_turns: list[RawTranscriptTurn],
    participant_map: ParticipantMap,
) -> list[CleanedTranscriptTurn]:
    """Stage 1: Merge fragmented same-speaker turns and resolve participant names.

    Algorithm: single linear O(n) pass over raw_turns.

    Merge condition (both must hold):
      1. speaker_tag of current turn == speaker_tag of open accumulator
      2. Gap between accumulator.end_time and current.start_time
         <= SPEAKER_MERGE_TIME_GAP_SECONDS

    Any turn that doesn't satisfy both conditions flushes the accumulator
    as a finished CleanedTranscriptTurn and starts a new one.

    Args:
        raw_turns: Chronologically-ordered ASR segments from MongoDB.
                   MUST be sorted ascending by start_time.
        participant_map: Pre-resolved speaker→name/user_id map from Node.js.

    Returns:
        List of merged CleanedTranscriptTurn objects (Stage 1 only).
        cleaned_text == original_text at this point — Stage 2 updates it.

    Raises:
        UnsortedTranscriptError: If raw_turns is not in chronological order.
    """
    # Edge case: empty input is valid and returns immediately
    if not raw_turns:
        log.debug("merge_turns_empty_input")
        return []

    # ── Sort-invariant assertion ──────────────────────────────────────────────
    prev_start = -1.0
    for i, t in enumerate(raw_turns):
        if t.start_time < prev_start:
            raise UnsortedTranscriptError("Transcript turns are not chronologically sorted", prev_start, t.start_time, i)
        prev_start = t.start_time

    # ── Merge pass with concurrent accumulators ───────────────────────────────
    # We maintain one active accumulator per speaker to handle interwoven cross-talk.
    active_accumulators: dict[str, dict] = {}
    merged_turns: list[CleanedTranscriptTurn] = []

    for curr in raw_turns:
        curr_name, curr_user_id = _resolve_speaker(
            curr.speaker_tag, curr.speaker_name, curr.speaker_email, participant_map
        )
        
        acc = active_accumulators.get(curr.speaker_tag)
        if acc:
            gap = curr.start_time - acc["end_time"]
            if gap <= SPEAKER_MERGE_TIME_GAP_SECONDS:
                # Merge into existing accumulator for this speaker
                acc["end_time"] = max(acc["end_time"], curr.end_time)
                acc["text_parts"].append(curr.text)
                acc["original_parts"].append(curr.text)
                acc["raw_turn_ids"].append(curr.id)
                continue
            else:
                # Gap too large: flush this speaker's accumulator
                merged_turns.append(
                    _flush_accumulator(
                        acc["text_parts"], acc["speaker_name"], acc["user_id"],
                        acc["start_time"], acc["end_time"], acc["original_parts"], acc["raw_turn_ids"]
                    )
                )
                
        # Start new accumulator for this speaker
        active_accumulators[curr.speaker_tag] = {
            "speaker_name": curr_name,
            "user_id": curr_user_id,
            "start_time": curr.start_time,
            "end_time": curr.end_time,
            "text_parts": [curr.text],
            "original_parts": [curr.text],
            "raw_turn_ids": [curr.id],
        }

    # Flush all remaining open accumulators
    for acc in active_accumulators.values():
        merged_turns.append(
            _flush_accumulator(
                acc["text_parts"], acc["speaker_name"], acc["user_id"],
                acc["start_time"], acc["end_time"], acc["original_parts"], acc["raw_turn_ids"]
            )
        )

    # Re-sort merged blocks chronologically
    merged_turns.sort(key=lambda t: t.start_time)

    log.info(
        "merge_turns_complete",
        input_turns=len(raw_turns),
        output_turns=len(merged_turns),
        reduction_pct=round(100 * (1 - len(merged_turns) / len(raw_turns)), 1) if raw_turns else 0,
    )

    return merged_turns
