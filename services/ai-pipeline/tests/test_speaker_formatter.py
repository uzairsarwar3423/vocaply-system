"""
tests/test_speaker_formatter.py
───────────────────────────────
Unit tests for Stage 1: speaker_formatter.merge_turns().

Coverage per the Day 47 DoD checklist:
  [x] Same-speaker turns within gap threshold are merged
  [x] Turns from different speakers are never merged regardless of gap
  [x] Same-speaker turns OUTSIDE the gap threshold remain separate
  [x] participant_map HIT → resolved name/user_id used
  [x] participant_map MISS → graceful fallback (NO exception)
  [x] Empty raw_turns → returns [] without error
  [x] Out-of-order input → raises UnsortedTranscriptError
  [x] Cross-talk (overlapping timestamps, different speakers) → not merged, no crash

All tests are synchronous (Stage 1 has zero async I/O).
"""

from __future__ import annotations

import json
import pathlib

import pytest

from src.models.cleanup_models import ParticipantInfo, RawTranscriptTurn
from src.services.cleanup.speaker_formatter import UnsortedTranscriptError, merge_turns

# ─── Fixtures ─────────────────────────────────────────────────────────────────

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"


def _load_standup() -> list[RawTranscriptTurn]:
    raw = json.loads((FIXTURES_DIR / "raw_transcript_standup_fragmented.json").read_text())
    return [RawTranscriptTurn(**t) for t in raw]


def _load_participant_map() -> dict[str, ParticipantInfo]:
    raw = json.loads((FIXTURES_DIR / "participant_map_standup.json").read_text())
    return {tag: ParticipantInfo(**info) for tag, info in raw.items()}


def _make_turn(
    speaker_tag: str,
    text: str,
    start: float,
    end: float,
    speaker_name: str | None = None,
    speaker_email: str | None = None,
    confidence: float = 0.9,
) -> RawTranscriptTurn:
    return RawTranscriptTurn(
        speaker_tag=speaker_tag,
        text=text,
        start_time=start,
        end_time=end,
        speaker_name=speaker_name,
        speaker_email=speaker_email,
        confidence=confidence,
        words=[],
    )


# ─── Test: Empty input ────────────────────────────────────────────────────────


def test_merge_empty_input_returns_empty_list() -> None:
    result = merge_turns([], {})
    assert result == []


# ─── Test: Same-speaker merge within gap threshold ────────────────────────────


def test_same_speaker_turns_within_gap_are_merged() -> None:
    """Two consecutive speaker_0 turns with 0.8s gap → merge into one."""
    turns = [
        _make_turn("speaker_0", "hello everyone", 0.0, 2.0),
        _make_turn("speaker_0", "let's get started", 2.5, 5.0),  # 0.5s gap
    ]
    result = merge_turns(turns, {})

    assert len(result) == 1
    assert "hello everyone" in result[0].cleaned_text
    assert "let's get started" in result[0].cleaned_text
    assert result[0].start_time == 0.0
    assert result[0].end_time == 5.0


def test_merge_extends_end_time_correctly() -> None:
    """Merged turn's start_time = first fragment, end_time = last fragment."""
    turns = [
        _make_turn("speaker_0", "part one", 1.0, 3.0),
        _make_turn("speaker_0", "part two", 3.4, 6.0),   # 0.4s gap
        _make_turn("speaker_0", "part three", 6.2, 8.5), # 0.2s gap
    ]
    result = merge_turns(turns, {})
    assert len(result) == 1
    assert result[0].start_time == 1.0
    assert result[0].end_time == 8.5


def test_merged_text_joined_with_single_space() -> None:
    """Text fragments are joined with exactly one space — no double-spacing."""
    turns = [
        _make_turn("speaker_0", "first", 0.0, 1.0),
        _make_turn("speaker_0", "second", 1.2, 2.0),
    ]
    result = merge_turns(turns, {})
    assert result[0].cleaned_text == "first second"
    assert "  " not in result[0].cleaned_text


# ─── Test: Different speakers are never merged ────────────────────────────────


def test_different_speakers_never_merged_regardless_of_gap() -> None:
    """Even a 0.01s gap between different speakers → two separate output turns."""
    turns = [
        _make_turn("speaker_0", "my turn", 0.0, 2.0),
        _make_turn("speaker_1", "my turn too", 2.01, 4.0),  # tiny gap, different speaker
    ]
    result = merge_turns(turns, {})
    assert len(result) == 2
    assert result[0].speaker_name != result[1].speaker_name or (
        result[0].cleaned_text == "my turn" and result[1].cleaned_text == "my turn too"
    )


# ─── Test: Same-speaker turns OUTSIDE threshold remain separate ───────────────


def test_same_speaker_outside_gap_threshold_not_merged() -> None:
    """Same speaker, but 5s gap → should NOT merge (threshold is 1.5s)."""
    turns = [
        _make_turn("speaker_0", "early statement", 0.0, 2.0),
        _make_turn("speaker_0", "late statement", 7.0, 9.0),  # 5.0s gap
    ]
    result = merge_turns(turns, {})
    assert len(result) == 2
    assert result[0].cleaned_text == "early statement"
    assert result[1].cleaned_text == "late statement"


# ─── Test: Participant map HIT ────────────────────────────────────────────────


def test_participant_map_hit_uses_resolved_name_and_user_id() -> None:
    turns = [_make_turn("speaker_0", "hello", 0.0, 1.0)]
    participant_map = {
        "speaker_0": ParticipantInfo(
            user_id="usr_001",
            name="Ahmed Hassan",
            email="ahmed@example.com",
            speaker_tag="speaker_0",
        )
    }
    result = merge_turns(turns, participant_map)
    assert result[0].speaker_name == "Ahmed Hassan"
    assert result[0].speaker_user_id == "usr_001"


# ─── Test: Participant map MISS → graceful fallback ───────────────────────────


def test_participant_map_miss_falls_back_to_raw_speaker_name() -> None:
    """Unresolved speaker with raw name → uses raw name, no exception."""
    turns = [_make_turn("speaker_99", "hello", 0.0, 1.0, speaker_name="External Joe")]
    result = merge_turns(turns, {})  # empty map — miss
    assert result[0].speaker_name == "External Joe"
    assert result[0].speaker_user_id is None


def test_participant_map_miss_falls_back_to_email_when_no_name() -> None:
    """Unresolved speaker, no name, has email → uses email, no exception."""
    turns = [_make_turn("speaker_99", "hello", 0.0, 1.0, speaker_email="unknown@ext.com")]
    result = merge_turns(turns, {})
    assert result[0].speaker_name == "unknown@ext.com"


def test_participant_map_miss_falls_back_to_unknown_speaker() -> None:
    """Unresolved speaker, no name, no email → 'Unknown Speaker', no exception."""
    turns = [_make_turn("speaker_99", "hello", 0.0, 1.0)]
    result = merge_turns(turns, {})
    assert result[0].speaker_name == "Unknown Speaker"
    assert result[0].speaker_user_id is None


# ─── Test: UnsortedTranscriptError on out-of-order input ─────────────────────


def test_unsorted_input_raises_unsorted_transcript_error() -> None:
    """Out-of-chronological-order input must raise UnsortedTranscriptError.

    Fail-loud: silent re-sort would mask upstream ASR/MongoDB bugs.
    """
    turns = [
        _make_turn("speaker_0", "second", 5.0, 7.0),
        _make_turn("speaker_0", "first", 0.0, 2.0),  # Out of order
    ]
    with pytest.raises(UnsortedTranscriptError) as exc_info:
        merge_turns(turns, {})

    assert exc_info.value.index == 1
    assert exc_info.value.curr_start < exc_info.value.prev_start


# ─── Test: Cross-talk (overlapping timestamps, different speakers) ────────────


def test_crosstalk_different_speakers_not_merged_no_crash() -> None:
    """Two overlapping-timestamp turns from different speakers → never merged, no crash."""
    turns = [
        _make_turn("speaker_0", "I was saying", 0.0, 3.0),
        _make_turn("speaker_1", "sorry go ahead", 2.0, 4.5),  # Overlaps speaker_0
    ]
    result = merge_turns(turns, {})
    assert len(result) == 2  # Not merged
    assert result[0].cleaned_text == "I was saying"
    assert result[1].cleaned_text == "sorry go ahead"


# ─── Test: Stable UUID assignment ────────────────────────────────────────────


def test_each_merged_turn_gets_unique_turn_id() -> None:
    """Every output turn must have a unique, non-empty turn_id."""
    turns = [
        _make_turn("speaker_0", "turn 1", 0.0, 1.0),
        _make_turn("speaker_1", "turn 2", 2.0, 3.0),
        _make_turn("speaker_0", "turn 3", 5.0, 6.0),
    ]
    result = merge_turns(turns, {})
    turn_ids = [t.turn_id for t in result]
    assert len(turn_ids) == len(set(turn_ids)), "turn_ids must be unique"
    assert all(len(tid) > 0 for tid in turn_ids)


# ─── Test: original_text == cleaned_text at Stage 1 output ───────────────────


def test_original_text_equals_cleaned_text_after_stage1() -> None:
    """After Stage 1 only, cleaned_text must equal original_text.
    Stage 2 hasn't run yet — no premature cleaning.
    """
    turns = [_make_turn("speaker_0", "hello world", 0.0, 1.0)]
    result = merge_turns(turns, {})
    assert result[0].cleaned_text == result[0].original_text


# ─── Integration: Standup fixture ─────────────────────────────────────────────


def test_standup_fixture_merge_reduces_turn_count() -> None:
    """Realistic standup fixture has fragmented same-speaker turns → merging reduces count."""
    raw = _load_standup()
    participant_map = _load_participant_map()
    result = merge_turns(raw, participant_map)

    assert len(result) < len(raw), "Merge should reduce turn count"
    assert all(t.speaker_name for t in result), "All turns should have a speaker name"
    assert all(t.turn_id for t in result), "All turns should have a turn_id"
    # speaker_2 is not in the participant_map → Unknown Speaker fallback
    unresolved = [t for t in result if t.speaker_name == "Unknown Speaker"]
    assert len(unresolved) >= 1, "speaker_2 should fall back to Unknown Speaker"
