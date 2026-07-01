"""
services/cleanup/filler_word_remover.py
────────────────────────────────────────
Stage 1.5: Rule-based filler word removal — deterministic, model-free.

DESIGN DECISIONS (from plan §2 DECISION 3 and §5.5):

  Runs BEFORE the Gemini call — not after.
  This is a deliberate cost-architecture decision: every filler word stripped
  by this free regex pass is a filler word the paid Gemini-via-OpenRouter call
  never has to see, reason about, or spend output tokens reproducing.
  At Vocaply's meeting volume, this ordering is a real, measurable cost lever.

  Deliberately conservative — only unambiguous fillers from FILLER_WORDS.
  This function does NOT attempt sentence-restructuring after removal.
  (e.g. fixing now-awkward phrasing like "I think, we should" after an "um"
  removal) — that polish is Stage 2's job. Keeping this function's behavior
  simple, fast, and trivially testable in isolation is a deliberate design goal.

  original_text is NEVER touched.
  Only cleaned_text is mutated. This is the critical invariant that lets
  Stage 2's length-ratio guardrail compare cleaned vs original meaningfully
  against the TRUE original ASR text, not an already-partially-modified string.

  Regex compiled ONCE at module load (not per-call).
  This is correct Python: importing this module initialises the compiled
  pattern once, shared across all calls in the process lifetime.
"""

from __future__ import annotations

import re
from typing import Optional

import structlog

from src.config.cleanup_config import FILLER_WORDS
from src.config.logging import get_logger
from src.models.cleanup_models import CleanedTranscriptTurn

log: structlog.BoundLogger = get_logger(__name__)


# ─── Compiled Regex (module-level singleton) ──────────────────────────────────
#
# Word-boundary-aware: \b prevents "um" matching inside "umbrella", etc.
# Case-insensitive: handles "Um", "UM", "um" uniformly.
# Multi-word phrases (e.g. "you know") must appear before single-word entries
# in the alternation, but re.compile with | handles this correctly since
# the regex engine tries left-to-right and picks the longest match first
# when alternatives are anchored with \b.
#
# sorted() with key=len descending ensures longer phrases are tried first,
# preventing "you" from matching inside "you know" and leaving " know" stranded.

_FILLER_PATTERN: Optional[re.Pattern[str]] = None


def _get_filler_pattern() -> re.Pattern[str]:
    """Lazy-initialised compiled regex — built once from FILLER_WORDS."""
    global _FILLER_PATTERN
    if _FILLER_PATTERN is None:
        # Sort by length descending so multi-word phrases match before single-word subsets
        sorted_fillers: list[str] = sorted(FILLER_WORDS, key=len, reverse=True)
        pattern_str = r"\b(" + "|".join([str(re.escape(w)) for w in sorted_fillers]) + r")\b"
        _FILLER_PATTERN = re.compile(pattern_str, re.IGNORECASE)
        log.debug(
            "filler_pattern_compiled",
            filler_count=len(sorted_fillers),
            pattern_preview=pattern_str[:120],
        )
    return _FILLER_PATTERN


# ─── Internal Helpers ─────────────────────────────────────────────────────────


def _collapse_whitespace(text: str) -> str:
    """Collapse multiple consecutive spaces into one and strip leading/trailing."""
    return re.sub(r"  +", " ", text).strip()


# ─── Public API ───────────────────────────────────────────────────────────────


def strip_fillers(turns: list[CleanedTranscriptTurn]) -> list[CleanedTranscriptTurn]:
    """Stage 1.5: Strip unambiguous filler words from all turns in-place.

    Mutates ONLY cleaned_text and filler_words_removed on each turn.
    original_text is NEVER modified — it is the guardrail's reference ground truth.

    The function returns the same list object (with mutations applied) for
    idiomatic chaining: filler_stripped = strip_fillers(merged).

    Edge cases:
      - Empty turn list → returns [] immediately, no error.
      - Turn with no fillers → cleaned_text and filler_words_removed unchanged.
      - Single-character turn → processed normally, no special-casing.

    Args:
        turns: CleanedTranscriptTurn list from Stage 1 (speaker_formatter).
               cleaned_text == original_text at this point.

    Returns:
        The same list with cleaned_text and filler_words_removed mutated per-turn.
    """
    if not turns:
        log.debug("strip_fillers_empty_input")
        return turns

    pattern = _get_filler_pattern()
    total_removed = 0

    for turn in turns:
        # Only mutate cleaned_text — original_text is sacrosanct
        cleaned, n_subs = pattern.subn("", turn.cleaned_text)

        if n_subs > 0:
            # Collapse double-spaces left behind by the removal
            cleaned = _collapse_whitespace(cleaned)

            # Pydantic models are frozen-by-default only if model_config says so.
            # Our CleanedTranscriptTurn doesn't set frozen=True, so direct
            # attribute assignment works. If we ever add frozen=True, switch to
            # model_copy(update=...) here.
            turn.cleaned_text = cleaned
            turn.filler_words_removed = n_subs
            total_removed += n_subs

            log.debug(
                "fillers_stripped_from_turn",
                turn_id=turn.turn_id,
                fillers_removed=n_subs,
                original_len=len(turn.original_text),
                cleaned_len=len(cleaned),
            )

    log.info(
        "strip_fillers_complete",
        turns_processed=len(turns),
        total_fillers_removed=total_removed,
        turns_with_removals=sum(1 for t in turns if t.filler_words_removed > 0),
    )

    return turns
