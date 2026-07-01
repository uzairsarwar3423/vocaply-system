"""
models/cleanup_models.py
────────────────────────
Pydantic v2 data contract for the transcript cleanup pipeline (Day 47).

Field parity notes:
  - RawTranscriptTurn is field-for-field aligned with the MongoDB
    raw_transcript[] array shape documented in the platform LLD.
  - WordTiming is defined today (even though Stage 3 is Day 48) to
    avoid a breaking model change mid-week once Day 48 lands.
  - CleanedTranscriptTurn.turn_id is a stable UUID assigned at Stage 1
    merge time — this is the ID-based zip key that survives batching/
    re-ordering in Stage 2. Never rely on array index alone.
  - CleanupMetadata.gemini_cost is a CostRecord from common.py —
    aggregated across all successful Stage 2 batches, feeding Day 60's
    cost-eval report with zero additional plumbing.

Decision: speaker_email/speaker_name on RawTranscriptTurn are optional
  and pass-through — Recall.ai may partially resolve them already, and
  we preserve whatever they sent as a fallback for unresolved speakers.
"""

from __future__ import annotations

from typing import Optional, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from src.models.common import CostRecord


# ─── Raw Input (from Recall.ai / Node.js / MongoDB) ──────────────────────────


class TimestampInfo(BaseModel):
    relative: float = Field(..., ge=0.0)
    absolute: Optional[str] = None

class WordTiming(BaseModel):
    """Per-word timing record from Recall.ai's ASR output.

    Included today so Day 48's confidence_flagger (Stage 3) can compute
    per-turn average confidence from word-level data without a breaking
    model change.
    """

    text: str = Field(..., min_length=1)
    start_timestamp: Optional[TimestampInfo] = None
    end_timestamp: Optional[TimestampInfo] = None
    # For backwards compatibility with test fixtures
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class RawTranscriptTurn(BaseModel):
    """One ASR segment as it arrives from the Node.js caller.

    Field parity with MongoDB raw_transcript[] array shape.
    speaker_email and speaker_name are optional — Recall.ai may or may
    not have resolved them. Stage 1 overwrites with the resolved
    ParticipantMap values where available.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Local ID for provenance tracking")
    speaker_tag: str = Field(default="Unknown Speaker", min_length=1, description="Diarization-assigned speaker ID, e.g. 'speaker_0'")
    speaker_email: Optional[str] = Field(None, description="Partially resolved email from Recall.ai, if present")
    speaker_name: Optional[str] = Field(None, description="Partially resolved name from Recall.ai, if present")
    text: str = Field(..., min_length=1)
    start_time: float = Field(..., ge=0.0)
    end_time: float = Field(..., ge=0.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    words: list[WordTiming] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: dict) -> dict:
        """Normalize the messy speaker fields and missing text/times from Recall.ai."""
        if isinstance(data, dict):
            if not data.get("speaker_tag"):
                # Extract from nested participant object if available
                participant = data.get("participant")
                participant_name = participant.get("name") if isinstance(participant, dict) else None
                
                # Mimic the Node.js fallback logic
                tag = (
                    data.get("speaker_name") or 
                    participant_name or
                    data.get("speaker") or 
                    (f"speaker_{data['speaker_id']}" if "speaker_id" in data else None) or
                    "Unknown Speaker"
                )
                data["speaker_tag"] = str(tag)
            
            # Derive text from words if missing
            if not data.get("text") and data.get("words"):
                data["text"] = " ".join(w.get("text", "") for w in data["words"] if isinstance(w, dict) and "text" in w)
                
            # Derive start_time from first word if missing
            if data.get("start_time") is None and data.get("words") and len(data["words"]) > 0:
                first_word = data["words"][0]
                if isinstance(first_word, dict):
                    if "start_timestamp" in first_word and isinstance(first_word["start_timestamp"], dict):
                        data["start_time"] = first_word["start_timestamp"].get("relative", 0.0)
                    elif "start_time" in first_word:
                        data["start_time"] = first_word["start_time"]

            # Derive end_time from last word if missing
            if data.get("end_time") is None and data.get("words") and len(data["words"]) > 0:
                last_word = data["words"][-1]
                if isinstance(last_word, dict):
                    if "end_timestamp" in last_word and isinstance(last_word["end_timestamp"], dict):
                        data["end_time"] = last_word["end_timestamp"].get("relative", 0.0)
                    elif "end_time" in last_word:
                        data["end_time"] = last_word["end_time"]
                        
        return data


# ─── Participant Resolution Map (from Node.js owner-resolver.service.ts) ─────


class ParticipantInfo(BaseModel):
    """Resolved participant identity, handed in by the Node.js caller.

    The Node.js meetings module owns participant/speaker resolution
    (owner-resolver.service.ts, meeting_participants table, fuzzy-name-match).
    Python receives an already-resolved map and does pure lookup — it does
    NOT re-derive identity from email/name fuzzy matching (Decision 2 in the plan).
    """

    user_id: Optional[str] = Field(None, description="Platform user ID, None if external/unregistered participant")
    name: str = Field(..., min_length=1, description="Display name as resolved by Node.js")
    email: Optional[str] = Field(None)
    speaker_tag: str = Field(..., min_length=1, description="Diarization speaker tag this record resolves")


# ParticipantMap is keyed by speaker_tag — the exact lookup structure
# speaker_formatter.py consumes. Never re-resolve identity from scratch in Python.
ParticipantMap = dict[str, ParticipantInfo]


# ─── Stage 3 Metadata Types ───────────────────────────────────────────────────

class ConfidenceFlag(BaseModel):
    uncertain: bool
    reason: Literal["low_asr_confidence", "guardrail_reverted", "unresolved_speaker", "none"]
    average_word_confidence: Optional[float] = None

class TimestampViolation(BaseModel):
    turn_id: str
    violation_type: Literal["overlap", "inverted_range", "exceeds_meeting_duration"]
    detail: str

class TimestampValidationResult(BaseModel):
    valid: bool
    violations: list[TimestampViolation]


# ─── Cleaned Output Turn ──────────────────────────────────────────────────────


class CleanedTranscriptTurn(BaseModel):
    """One merged, cleaned transcript turn — the output of Stage 1 + Stage 2.

    turn_id: Stable UUID assigned at Stage 1 merge time. This is the
      field that survives batching/reordering in Stage 2 and lets the
      model's JSON array response be zipped back by ID, not array position
      (array-position zip silently breaks if the model omits or reorders items).

    was_modified_suspiciously: Set True by the Stage 2 length-ratio guardrail
      when the model's cleaned_text falls outside the [0.5x, 1.1x] band.
      When True, cleaned_text is reverted to the filler-stripped-only version
      — the model output is discarded, never surfaces to the UI.

    uncertain: Defaults False here. Day 48's confidence_flagger (Stage 3)
      is the stage that actually sets this meaningfully. Defined today so
      Stage 3 doesn't need a breaking model change tomorrow.
    """

    turn_id: str = Field(..., description="Stable UUID string assigned at Stage 1 merge time")
    cleaned_text: str = Field(..., min_length=0, description="Text after Stage 1 + Stage 2; reverted if guardrail tripped")
    original_text: str = Field(..., min_length=1, description="Raw ASR text before any cleaning — never mutated by any stage")
    speaker_name: str = Field(..., min_length=1)
    speaker_user_id: Optional[str] = Field(None)
    start_time: float = Field(..., ge=0.0)
    end_time: float = Field(..., ge=0.0)
    filler_words_removed: int = Field(default=0, ge=0, description="Count from rule-based Stage 1.5 pass")
    was_modified: bool = Field(default=False, description="True if Stage 2 changed the text at all")
    was_modified_suspiciously: bool = Field(
        default=False,
        description="True if Stage 2's output tripped the length-ratio guardrail and was reverted",
    )
    uncertain: bool = Field(default=False, description="Set by Stage 3 (Day 48) confidence_flagger")
    confidence_detail: Optional[ConfidenceFlag] = Field(default=None, description="Detailed reasoning for uncertainty")
    raw_turn_ids: list[str] = Field(default_factory=list, description="IDs of raw turns that fed this merged turn")


# ─── Internal Batch-Level Result (not in public API response) ─────────────────


class CleanupBatchResult(BaseModel):
    """Internal type for partial-failure isolation in grammar_normalizer.py.

    transcript_cleaner.py's aggregation logic operates over these.
    Not part of the CleanupResult public API response — purely internal.

    When succeeded=False, cleaned_turns is None and error carries the
    exception message. The orchestrator falls back to the filler-stripped-only
    turns for that batch, ensuring full turn coverage regardless of failures.
    """

    batch_id: str = Field(..., description="Unique ID for this batch (for log correlation)")
    turn_ids: list[str] = Field(..., description="Ordered list of turn_ids in this batch")
    succeeded: bool
    cleaned_turns: Optional[list[CleanedTranscriptTurn]] = None
    error: Optional[str] = Field(None, description="Exception string if succeeded=False")


# ─── Cleanup Metadata ─────────────────────────────────────────────────────────


class CleanupMetadata(BaseModel):
    """Per-run audit record attached to every CleanupResult.

    model_version: OpenRouter model slug used (from config/model_routing.py).
    prompt_version: Parsed from cleanup_system.txt's first-line version marker,
      so every historical CleanupResult is attributable to the exact prompt
      that produced it — essential for regression debugging and A/B comparison.
    gemini_cost: Aggregated CostRecord across all successful Stage 2 batches,
      the primary feed for Day 60's cost-eval script.
    """

    model_version: str = Field(..., min_length=1)
    prompt_version: str = Field(..., min_length=1, description="Parsed from cleanup_system.txt header line")
    total_fillers_removed: int = Field(..., ge=0)
    turns_before_merge: int = Field(..., ge=0, description="Raw ASR turn count before Stage 1")
    turns_after_merge: int = Field(..., ge=0, description="Merged turn count after Stage 1")
    batches_total: int = Field(..., ge=0)
    batches_failed: int = Field(..., ge=0)
    processing_time_ms: float = Field(..., ge=0.0)
    gemini_cost: CostRecord


# ─── Public API Response ──────────────────────────────────────────────────────


class CleanupResult(BaseModel):
    """The public response body for POST /transcripts/cleanup.

    Stateless compute result — the Node.js caller owns MongoDB persistence
    (Decision 6: Python is a pure compute layer, no storage coupling).
    """

    meeting_id: str = Field(..., min_length=1)
    team_id: str = Field(..., min_length=1)
    cleaned_transcript: list[CleanedTranscriptTurn]
    metadata: CleanupMetadata


# ─── API Request Body ─────────────────────────────────────────────────────────


class CleanupRequest(BaseModel):
    """Request body for POST /transcripts/cleanup.

    raw_transcript: The full raw_transcript[] array from MongoDB,
      already in chronological order (asserted by speaker_formatter.py).
    participants: Pre-resolved participant map from Node.js —
      Python never re-resolves identity itself (Decision 2).
    """

    meeting_id: str = Field(..., min_length=1)
    team_id: str = Field(..., min_length=1)
    raw_transcript: list[RawTranscriptTurn] = Field(..., min_length=0)
    participants: ParticipantMap = Field(default_factory=dict)
