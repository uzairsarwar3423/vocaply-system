"""
models/chunk_models.py
──────────────────────
Pydantic data contract for the shared chunker module.
"""

from __future__ import annotations

import uuid
from enum import Enum
from typing import Literal, Union

from pydantic import BaseModel, Field

from src.models.cleanup_models import CleanedTranscriptTurn


class ChunkingStrategy(str, Enum):
    SPEAKER_TURN_GROUPED = "SPEAKER_TURN_GROUPED"
    FIXED_SIZE_WITH_OVERLAP = "FIXED_SIZE_WITH_OVERLAP"
    SINGLE_UNIT = "SINGLE_UNIT"


# --- Content Types ---

class TranscriptContent(BaseModel):
    type: Literal["transcript"] = "transcript"
    turns: list[CleanedTranscriptTurn]


class PlainTextContent(BaseModel):
    type: Literal["plain_text"] = "plain_text"
    text: str
    source_id: str


ChunkableContent = Union[TranscriptContent, PlainTextContent]


# --- Output Types ---

class TextChunk(BaseModel):
    chunk_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str
    token_count: int = Field(..., description="Estimated token count from tokenization service")
    source_turn_ids: list[str] | None = None
    start_time: float | None = None
    end_time: float | None = None
    chunk_index: int


class ChunkMetadata(BaseModel):
    strategy_used: ChunkingStrategy
    total_chunks: int
    total_source_tokens_estimate: int
    overlap_applied: bool
    oversized_single_turn_chunks: list[str] = Field(default_factory=list)
