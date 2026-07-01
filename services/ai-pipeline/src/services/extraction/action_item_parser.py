import logging
from typing import List, Dict
from pydantic import BaseModel
from src.models.extraction_models import ExtractedActionItem

logger = logging.getLogger(__name__)

class ParsedActionItem(ExtractedActionItem):
    dedup_key: str

def parse_action_item(raw: ExtractedActionItem) -> ParsedActionItem:
    assignee_name = raw.assignee_name.strip()
    
    dedup_text = raw.text.lower().strip()[:80]
    dedup_key = f"{assignee_name.lower()}::{dedup_text}"
    
    return ParsedActionItem(
        **raw.model_dump(),
        dedup_key=dedup_key
    )

def dedup_action_items(items: List[ParsedActionItem]) -> List[ParsedActionItem]:
    deduped: Dict[str, ParsedActionItem] = {}
    for item in items:
        if item.dedup_key not in deduped:
            deduped[item.dedup_key] = item
        else:
            existing = deduped[item.dedup_key]
            if item.confidence > existing.confidence:
                deduped[item.dedup_key] = item
            elif item.confidence == existing.confidence:
                if item.due_date_raw is not None and existing.due_date_raw is None:
                    deduped[item.dedup_key] = item
    return list(deduped.values())
