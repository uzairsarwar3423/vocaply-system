from enum import Enum
from typing import List, Optional, Any
from pydantic import BaseModel, Field, model_validator, field_validator
import logging

logger = logging.getLogger(__name__)

class PriorityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"

class ExtractedCommitment(BaseModel):
    text: str = Field(..., min_length=5, max_length=1000)
    owner_name: str = Field(..., min_length=1)
    due_date_raw: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        if not self.owner_name.strip():
            raise ValueError("owner_name cannot be empty or just whitespace")
        if self.due_date_raw is not None and not self.due_date_raw.strip():
            raise ValueError("due_date_raw cannot be empty or just whitespace")
        return self

class ExtractedActionItem(BaseModel):
    text: str = Field(..., min_length=5, max_length=1000)
    assignee_name: str = Field(..., min_length=1)
    due_date_raw: Optional[str] = None
    priority: PriorityLevel
    confidence: float = Field(..., ge=0.0, le=1.0)

    @field_validator('priority', mode='before')
    @classmethod
    def normalize_priority(cls, v: Any) -> Any:
        if isinstance(v, str):
            v_norm = v.strip().upper()
            try:
                return PriorityLevel(v_norm)
            except ValueError:
                logger.warning(f"Unrecognized priority string '{v}', defaulting to MEDIUM")
                return PriorityLevel.MEDIUM
        return v

    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        if not self.assignee_name.strip():
            raise ValueError("assignee_name cannot be empty or just whitespace")
        if self.due_date_raw is not None and not self.due_date_raw.strip():
            raise ValueError("due_date_raw cannot be empty or just whitespace")
        return self

class ExtractedDecision(BaseModel):
    text: str = Field(..., min_length=1)
    made_by: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    
    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        if self.made_by is not None and not self.made_by.strip():
            raise ValueError("made_by cannot be empty or just whitespace")
        return self

class ExtractedBlocker(BaseModel):
    text: str = Field(..., min_length=1)
    affected_name: Optional[str] = None
    blocking_party: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        if self.affected_name is not None and not self.affected_name.strip():
            raise ValueError("affected_name cannot be empty or just whitespace")
        if self.blocking_party is not None and not self.blocking_party.strip():
            raise ValueError("blocking_party cannot be empty or just whitespace")
        return self

class ExtractionResponse(BaseModel):
    commitments: List[ExtractedCommitment] = Field(default_factory=list)
    action_items: List[ExtractedActionItem] = Field(default_factory=list)
    decisions: List[ExtractedDecision] = Field(default_factory=list)
    blockers: List[ExtractedBlocker] = Field(default_factory=list)
    summary: str = Field(..., min_length=20, max_length=1500)

    @field_validator("commitments")
    @classmethod
    def filter_low_confidence_commitments(cls, v: List[ExtractedCommitment]) -> List[ExtractedCommitment]:
        return [c for c in v if c.confidence >= 0.3]
