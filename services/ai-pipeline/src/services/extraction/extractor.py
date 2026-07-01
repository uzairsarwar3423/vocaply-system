from __future__ import annotations
import asyncio
from pathlib import Path
from typing import List

from pydantic import BaseModel
import structlog

from src.models.common import TaskType
from src.models.cleanup_models import CleanedTranscriptTurn
from src.models.chunk_models import TranscriptContent, ChunkingStrategy
from src.models.extraction_models import (
    ExtractionResponse,
    ExtractedCommitment,
    ExtractedActionItem,
    ExtractedDecision,
    ExtractedBlocker
)
from src.services.gemini_client import GeminiClient
from src.services.chunker import chunk_content
from src.services.extraction.commitment_parser import parse_commitment, ParsedCommitment
from src.services.extraction.action_item_parser import parse_action_item, dedup_action_items, ParsedActionItem
from src.services.extraction.decision_parser import parse_decision, ParsedDecision
from src.services.extraction.blocker_parser import parse_blocker, dedup_blockers, ParsedBlocker

log = structlog.get_logger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"

_SYSTEM_PROMPT_TPL = (PROMPTS_DIR / "extraction_system.txt").read_text(encoding="utf-8")
_USER_PROMPT_TPL = (PROMPTS_DIR / "extraction_user.txt").read_text(encoding="utf-8")
_COMMITMENT_EXAMPLES = (PROMPTS_DIR / "commitment_examples.txt").read_text(encoding="utf-8")
_ACTION_ITEM_EXAMPLES = (PROMPTS_DIR / "action_item_examples.txt").read_text(encoding="utf-8")

_FULL_SYSTEM_PROMPT = (
    _SYSTEM_PROMPT_TPL +
    "\n\n--------------------------------------------------------------------------------\n"
    "COMMITMENT EXAMPLES\n"
    "--------------------------------------------------------------------------------\n" +
    _COMMITMENT_EXAMPLES +
    "\n\n--------------------------------------------------------------------------------\n"
    "ACTION ITEM EXAMPLES\n"
    "--------------------------------------------------------------------------------\n" +
    _ACTION_ITEM_EXAMPLES
)

class MergedExtractionResult(BaseModel):
    commitments: List[ParsedCommitment]
    action_items: List[ParsedActionItem]
    decisions: List[ParsedDecision]
    blockers: List[ParsedBlocker]
    summary: str

class ExtractionService:
    def __init__(self, gemini_client: GeminiClient):
        self._gemini = gemini_client
        self._user_prompt_tpl = _USER_PROMPT_TPL
        self._full_system_prompt = _FULL_SYSTEM_PROMPT

    async def extract_meeting(
        self,
        meeting_id: str,
        meeting_title: str,
        meeting_date_iso: str,
        participants: List[str],
        turns: List[CleanedTranscriptTurn],
        max_tokens_per_chunk: int = 4000,
        overlap_turns: int = 3
    ) -> MergedExtractionResult:
        
        content = TranscriptContent(turns=turns)
        chunks, meta = chunk_content(
            content=content,
            strategy=ChunkingStrategy.SPEAKER_TURN_GROUPED,
            max_tokens=max_tokens_per_chunk,
            overlap_units=overlap_turns
        )
        
        log.info("extraction_chunking_complete", meeting_id=meeting_id, chunks=len(chunks))

        tasks = []
        for chunk in chunks:
            tasks.append(self._process_chunk(meeting_title, meeting_date_iso, participants, chunk.content))
            
        chunk_results = await asyncio.gather(*tasks)
        
        return self._merge_results(chunk_results)

    async def _process_chunk(
        self, meeting_title: str, meeting_date_iso: str, participants: List[str], transcript_content: str
    ) -> ExtractionResponse:
        
        participants_fmt = "\n".join(f"- Name: {p}" for p in participants)
        
        user_prompt = self._user_prompt_tpl.replace("{{meeting_title}}", meeting_title)
        user_prompt = user_prompt.replace("{{meeting_date_iso}}", meeting_date_iso)
        user_prompt = user_prompt.replace("{{participants}}", participants_fmt)
        user_prompt = user_prompt.replace("{{transcript_content}}", transcript_content)
        
        result = await self._gemini.generate_structured(
            task_type=TaskType.EXTRACTION,
            system_prompt=self._full_system_prompt,
            user_prompt=user_prompt,
            response_schema=ExtractionResponse
        )
        
        return result.data
        
    def _merge_results(self, chunk_results: List[ExtractionResponse]) -> MergedExtractionResult:
        all_commitments = []
        all_action_items = []
        all_decisions = []
        all_blockers = []
        summaries = []
        
        for res in chunk_results:
            all_commitments.extend(res.commitments)
            all_action_items.extend(res.action_items)
            all_decisions.extend(res.decisions)
            all_blockers.extend(res.blockers)
            if res.summary.strip():
                summaries.append(res.summary.strip())
                
        # Parse and Dedup
        parsed_commitments = [parse_commitment(c) for c in all_commitments]
        
        deduped_commitments_dict = {}
        for c in parsed_commitments:
            if c.dedup_key not in deduped_commitments_dict:
                deduped_commitments_dict[c.dedup_key] = c
            else:
                existing = deduped_commitments_dict[c.dedup_key]
                if c.confidence > existing.confidence:
                    deduped_commitments_dict[c.dedup_key] = c
        
        deduped_action_items = dedup_action_items([parse_action_item(a) for a in all_action_items])
        
        parsed_decisions = [parse_decision(d) for d in all_decisions]
        # Very simple decision dedup
        deduped_decisions_dict = {}
        for d in parsed_decisions:
            key = d.text_normalized[:80]
            if key not in deduped_decisions_dict or d.confidence > deduped_decisions_dict[key].confidence:
                deduped_decisions_dict[key] = d
        
        deduped_blockers = dedup_blockers([parse_blocker(b) for b in all_blockers])
        
        final_summary = " ".join(summaries)
        
        return MergedExtractionResult(
            commitments=list(deduped_commitments_dict.values()),
            action_items=deduped_action_items,
            decisions=list(deduped_decisions_dict.values()),
            blockers=deduped_blockers,
            summary=final_summary
        )
