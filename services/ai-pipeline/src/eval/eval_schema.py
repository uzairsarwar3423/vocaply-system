from typing import List, Optional
from pydantic import BaseModel
from src.models.extraction_models import PriorityLevel

class EvalExpectedCommitment(BaseModel):
    text_contains: Optional[str] = None
    owner_name_contains: str
    confidence_min: Optional[float] = None
    due_date_raw_contains: Optional[str] = None

class EvalExpectedActionItem(BaseModel):
    text_contains: str
    assignee_name_contains: str
    priority: Optional[PriorityLevel] = None

class EvalExpectedDecision(BaseModel):
    text_contains: str

class EvalExpectedBlocker(BaseModel):
    text_contains: str

class EvalCase(BaseModel):
    meeting_id: str
    description: str
    expected_commitments: List[EvalExpectedCommitment]
    expected_action_items: List[EvalExpectedActionItem]
    expected_decisions: List[EvalExpectedDecision]
    expected_blockers: List[EvalExpectedBlocker]
    expected_commitment_count: int
    expected_zero_commitments: bool
