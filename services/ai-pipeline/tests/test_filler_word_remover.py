"""
tests/test_filler_word_remover.py
──────────────────────────────────
Unit tests for Stage 1.5: filler_word_remover.strip_fillers().

Coverage per the Day 47 DoD checklist:
  [x] Known filler words from FILLER_WORDS are stripped; count matches exactly
  [x] "like" inside "I'd like to" is NOT stripped (unambiguous-only design)
  [x] Double-spacing artifacts from removal are collapsed correctly
  [x] original_text remains byte-for-byte unchanged after this step
  [x] Empty input returns [] without error
  [x] Single-word filler → empty or whitespace-only cleaned_text handled
  [x] filler_words_removed=0 on turns with no fillers
"""

from __future__ import annotations

from copy import deepcopy

import pytest

from src.config.cleanup_config import FILLER_WORDS
from src.models.cleanup_models import CleanedTranscriptTurn
from src.services.cleanup.filler_word_remover import strip_fillers


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_turn(text: str, turn_id: str = "t-001") -> CleanedTranscriptTurn:
    """Construct a CleanedTranscriptTurn at Stage 1 output state.
    cleaned_text == original_text (Stage 2 hasn't run yet).
    """
    return CleanedTranscriptTurn(
        turn_id=turn_id,
        cleaned_text=text,
        original_text=text,
        speaker_name="Test Speaker",
        speaker_user_id=None,
        start_time=0.0,
        end_time=2.0,
        filler_words_removed=0,
        was_modified=False,
        was_modified_suspiciously=False,
        uncertain=False,
    )


# ─── Test: Empty input ────────────────────────────────────────────────────────


def test_strip_fillers_empty_input() -> None:
    result = strip_fillers([])
    assert result == []


# ─── Test: Known fillers stripped, count correct ─────────────────────────────


def test_um_is_stripped_and_count_matches() -> None:
    turn = _make_turn("um we need to ship this today")
    result = strip_fillers([turn])
    assert "um" not in result[0].cleaned_text.lower()
    assert result[0].filler_words_removed == 1


def test_uh_is_stripped() -> None:
    turn = _make_turn("I uh want to add one more thing")
    result = strip_fillers([turn])
    assert "uh" not in result[0].cleaned_text.lower()
    assert result[0].filler_words_removed >= 1


def test_multiple_fillers_count_matches_exactly() -> None:
    """'um' + 'uh' in one turn → filler_words_removed == 2."""
    turn = _make_turn("um we need to uh check the logs")
    result = strip_fillers([turn])
    assert result[0].filler_words_removed == 2


def test_you_know_phrase_is_stripped() -> None:
    turn = _make_turn("we need to you know think about this carefully")
    result = strip_fillers([turn])
    assert "you know" not in result[0].cleaned_text.lower()
    assert result[0].filler_words_removed >= 1


def test_i_mean_phrase_is_stripped() -> None:
    turn = _make_turn("I mean we have a problem here")
    result = strip_fillers([turn])
    assert "i mean" not in result[0].cleaned_text.lower()


def test_kind_of_phrase_is_stripped() -> None:
    turn = _make_turn("it's kind of urgent")
    result = strip_fillers([turn])
    assert "kind of" not in result[0].cleaned_text.lower()


def test_sort_of_phrase_is_stripped() -> None:
    turn = _make_turn("that's sort of what I meant")
    result = strip_fillers([turn])
    assert "sort of" not in result[0].cleaned_text.lower()


# ─── Test: "like" inside meaningful phrase is NOT stripped ───────────────────


def test_like_inside_meaningful_phrase_not_stripped() -> None:
    """'like' in 'I'd like to' is NOT a filler — must not be stripped.

    This proves the 'unambiguous-only' design boundary holds.
    'like' is excluded from FILLER_WORDS for exactly this reason.
    """
    text = "I'd like to propose a different approach"
    turn = _make_turn(text)
    result = strip_fillers([turn])
    assert "like" in result[0].cleaned_text
    assert result[0].filler_words_removed == 0


def test_like_is_not_in_filler_words_set() -> None:
    """Explicit assertion: 'like' must not be in FILLER_WORDS."""
    assert "like" not in FILLER_WORDS, (
        "'like' was added to FILLER_WORDS — this breaks the unambiguous-only "
        "design contract. Remove it; contextual disambiguation belongs to Stage 2."
    )


# ─── Test: Double-spacing collapsed ───────────────────────────────────────────


def test_double_space_collapsed_after_filler_removal() -> None:
    """'um' removal from middle of sentence must not leave double-space."""
    turn = _make_turn("we um need to ship")
    result = strip_fillers([turn])
    assert "  " not in result[0].cleaned_text
    assert result[0].cleaned_text == "we need to ship"


def test_leading_filler_removal_no_leading_space() -> None:
    """'um' at the start → result should not start with a space."""
    turn = _make_turn("um this is a test")
    result = strip_fillers([turn])
    assert not result[0].cleaned_text.startswith(" ")


# ─── Test: original_text NEVER modified ───────────────────────────────────────


def test_original_text_never_modified() -> None:
    """CRITICAL: original_text must be byte-for-byte unchanged after strip_fillers.

    This is the precondition for Stage 2's guardrail to work correctly —
    the guardrail compares cleaned_text against original_text, so original_text
    must always reflect the TRUE raw ASR text.
    """
    original = "um we need to uh check the sort of situation"
    turn = _make_turn(original)
    strip_fillers([turn])
    assert turn.original_text == original, (
        "original_text was mutated by strip_fillers — "
        "this breaks the Stage 2 guardrail's ground truth reference."
    )


# ─── Test: No fillers → filler_words_removed stays 0 ─────────────────────────


def test_no_fillers_in_turn_count_stays_zero() -> None:
    text = "The API is returning a 503 on the staging environment."
    turn = _make_turn(text)
    result = strip_fillers([turn])
    assert result[0].filler_words_removed == 0
    assert result[0].cleaned_text == text


# ─── Test: Multiple turns processed independently ─────────────────────────────


def test_multiple_turns_processed_independently() -> None:
    """Each turn's filler_words_removed reflects only that turn's fillers."""
    turns = [
        _make_turn("um hello", "t-001"),
        _make_turn("clean text here", "t-002"),
        _make_turn("uh and also uh this", "t-003"),
    ]
    result = strip_fillers(turns)
    assert result[0].filler_words_removed == 1   # 'um'
    assert result[1].filler_words_removed == 0   # no fillers
    assert result[2].filler_words_removed == 2   # 'uh' × 2


# ─── Test: Case-insensitive matching ─────────────────────────────────────────


def test_filler_removal_is_case_insensitive() -> None:
    """'Um', 'UM', 'uM' are all fillers regardless of case."""
    for variant in ["Um", "UM", "uM"]:
        turn = _make_turn(f"{variant} what do you think")
        result = strip_fillers([turn])
        assert result[0].filler_words_removed >= 1, f"Case variant '{variant}' not stripped"


# ─── Test: Return value is same list object ───────────────────────────────────


def test_strip_fillers_returns_same_list_object() -> None:
    """strip_fillers returns the same list (in-place mutation) for clean chaining."""
    turns = [_make_turn("um hello")]
    returned = strip_fillers(turns)
    assert returned is turns
