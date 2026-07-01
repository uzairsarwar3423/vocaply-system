"""
api/routes/cleanup.py
─────────────────────
POST /api/v1/transcripts/cleanup — internal endpoint, authenticated.

DESIGN PRINCIPLE (from plan §5.8):
  This file contains ZERO business logic.
  The handler is a thin wire: inject gemini_client → call orchestrator →
  return result. All validation is Pydantic. All errors flow through the
  global error handler middleware from Day 46.

  UnsortedTranscriptError from speaker_formatter.py is caught by the global
  AIPipelineError handler — no local try/except needed here.

  response_model=CleanupResult on the decorator:
    1. FastAPI auto-serializes the Pydantic model to JSON.
    2. OpenAPI docs show the correct response schema.
    3. FastAPI validates the response shape in development mode.

AUTH: X-Internal-Service-Key header, verified by Day 46's
  verify_internal_service_key dependency (constant-time comparison).
  This endpoint is NEVER internet-facing — Node.js API → Python only.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from src.api.deps import GeminiDep, InternalAuthDep
from src.models.cleanup_models import CleanupRequest, CleanupResult
from src.services.cleanup.transcript_cleaner import clean_transcript

router = APIRouter(tags=["cleanup"])


@router.post(
    "/api/v1/transcripts/cleanup",
    response_model=CleanupResult,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(lambda: None)],  # Auth dependency declared below via InternalAuthDep
    summary="Clean a raw transcript",
    description=(
        "Internal endpoint: receives a raw ASR transcript and a pre-resolved participant map "
        "from the Node.js transcribe.worker. Returns a cleaned transcript with Stage 1 speaker "
        "merge + Stage 2 grammar normalization applied. No DB writes — pure compute."
    ),
)
async def cleanup_transcript(
    request: CleanupRequest,
    _auth: InternalAuthDep,
    gemini_client: GeminiDep,
) -> CleanupResult:
    """POST /api/v1/transcripts/cleanup

    Protected by X-Internal-Service-Key (Day 46's shared-secret auth).
    All business logic lives in transcript_cleaner.clean_transcript().
    """
    return await clean_transcript(
        raw_turns=request.raw_transcript,
        participant_map=request.participants,
        team_id=request.team_id,
        meeting_id=request.meeting_id,
        gemini_client=gemini_client,
    )
