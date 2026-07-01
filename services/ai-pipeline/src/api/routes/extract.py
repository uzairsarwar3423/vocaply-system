from typing import List
from fastapi import APIRouter, Request, Depends
from pydantic import BaseModel
from src.models.cleanup_models import CleanedTranscriptTurn
from src.services.extraction.extractor import ExtractionService, MergedExtractionResult

router = APIRouter(tags=["extraction"])

class ExtractionRequest(BaseModel):
    meeting_id: str
    meeting_title: str
    meeting_date_iso: str
    participants: List[str]
    turns: List[CleanedTranscriptTurn]

def get_extraction_service(request: Request) -> ExtractionService:
    return ExtractionService(gemini_client=request.app.state.gemini_client)

@router.post("/extract", response_model=MergedExtractionResult)
async def extract_meeting(
    payload: ExtractionRequest,
    service: ExtractionService = Depends(get_extraction_service)
) -> MergedExtractionResult:
    """Run extraction pipeline on a cleaned transcript."""
    return await service.extract_meeting(
        meeting_id=payload.meeting_id,
        meeting_title=payload.meeting_title,
        meeting_date_iso=payload.meeting_date_iso,
        participants=payload.participants,
        turns=payload.turns
    )
