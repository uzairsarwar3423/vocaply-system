"""
services/cleanup/confidence_flagger.py
──────────────────────────────────────
Stage 3: Confidence flagging and timestamp integrity validation.
"""

from __future__ import annotations

import statistics

from src.models.cleanup_models import (
    CleanedTranscriptTurn,
    ConfidenceFlag,
    RawTranscriptTurn,
    TimestampValidationResult,
    TimestampViolation,
)


class TimestampIntegrityError(Exception):
    """Raised by the orchestrator when validate_timestamps reports an invalid result."""

    def __init__(self, violations: list[TimestampViolation]):
        super().__init__("Timestamp integrity validation failed")
        self.violations = violations


def flag_confidence(
    turns: list[CleanedTranscriptTurn],
    raw_turns_by_id: dict[str, RawTranscriptTurn],
    threshold: float,
) -> list[CleanedTranscriptTurn]:
    """Flag turns with low ASR confidence or guardrail reversions.
    
    Args:
        turns: Cleaned and merged transcript turns from Stage 2.
        raw_turns_by_id: Lookup dictionary of original raw turns by their ID.
        threshold: Confidence threshold below which a turn is flagged.
        
    Returns:
        The mutated list of turns with confidence_detail populated.
    """
    for turn in turns:
        # Cross-stage signal: was it reverted by guardrail?
        if turn.was_modified_suspiciously:
            turn.uncertain = True
            turn.confidence_detail = ConfidenceFlag(
                uncertain=True,
                reason="guardrail_reverted",
                average_word_confidence=None,
            )
            continue
            
        # Collect all words from all raw turns that fed this merged turn
        all_word_confidences: list[float] = []
        
        for raw_id in turn.raw_turn_ids:
            raw_turn = raw_turns_by_id.get(raw_id)
            if raw_turn:
                if raw_turn.words:
                    all_word_confidences.extend([w.confidence for w in raw_turn.words])
                else:
                    # Fallback to the turn-level confidence if no words are present
                    all_word_confidences.append(raw_turn.confidence)
                    
        avg_confidence = statistics.mean(all_word_confidences) if all_word_confidences else 1.0
        
        if avg_confidence < threshold:
            turn.uncertain = True
            turn.confidence_detail = ConfidenceFlag(
                uncertain=True,
                reason="low_asr_confidence",
                average_word_confidence=avg_confidence,
            )
        elif turn.speaker_name == "Unknown Speaker" or "speaker_" in turn.speaker_name.lower():
            turn.uncertain = True
            turn.confidence_detail = ConfidenceFlag(
                uncertain=True,
                reason="unresolved_speaker",
                average_word_confidence=avg_confidence,
            )
        else:
            turn.uncertain = False
            turn.confidence_detail = ConfidenceFlag(
                uncertain=False,
                reason="none",
                average_word_confidence=avg_confidence,
            )

    return turns


def validate_timestamps(
    turns: list[CleanedTranscriptTurn],
    meeting_duration_seconds: float,
) -> TimestampValidationResult:
    """Validate the chronologically-ordered turns for timestamp integrity.
    
    Args:
        turns: Ordered transcript turns.
        meeting_duration_seconds: The total meeting duration to validate against.
        
    Returns:
        A TimestampValidationResult capturing any violations found.
    """
    violations: list[TimestampViolation] = []
    
    # Epsilon for float comparisons
    EPSILON = 0.001
    
    for i, turn in enumerate(turns):
        if turn.start_time > turn.end_time + EPSILON:
            violations.append(TimestampViolation(
                turn_id=turn.turn_id,
                violation_type="inverted_range",
                detail=f"Start time {turn.start_time} exceeds end time {turn.end_time}",
            ))
            
        if i < len(turns) - 1:
            next_turn = turns[i + 1]
            if turn.end_time > next_turn.start_time + EPSILON:
                violations.append(TimestampViolation(
                    turn_id=turn.turn_id,
                    violation_type="overlap",
                    detail=f"End time {turn.end_time} overlaps next turn start {next_turn.start_time}",
                ))
                
    if turns:
        last_turn = turns[-1]
        if last_turn.end_time > meeting_duration_seconds + EPSILON:
            violations.append(TimestampViolation(
                turn_id=last_turn.turn_id,
                violation_type="exceeds_meeting_duration",
                detail=f"End time {last_turn.end_time} exceeds meeting duration {meeting_duration_seconds}",
            ))

    return TimestampValidationResult(
        valid=len(violations) == 0,
        violations=violations,
    )
