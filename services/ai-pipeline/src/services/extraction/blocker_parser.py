from typing import List, Dict
from src.models.extraction_models import ExtractedBlocker
from pydantic import BaseModel

class ParsedBlocker(ExtractedBlocker):
    text_normalized: str
    dedup_key: str

def parse_blocker(raw: ExtractedBlocker) -> ParsedBlocker:
    text_normalized = raw.text.lower().strip()
    dedup_key = text_normalized[:80]
    
    affected_name = raw.affected_name.title() if raw.affected_name else None
    blocking_party = raw.blocking_party.title() if raw.blocking_party else None
    
    dump = raw.model_dump()
    dump['affected_name'] = affected_name
    dump['blocking_party'] = blocking_party
    
    return ParsedBlocker(
        **dump,
        text_normalized=text_normalized,
        dedup_key=dedup_key
    )

def dedup_blockers(blockers: List[ParsedBlocker]) -> List[ParsedBlocker]:
    deduped: Dict[str, ParsedBlocker] = {}
    for blocker in blockers:
        if blocker.dedup_key not in deduped:
            deduped[blocker.dedup_key] = blocker
        else:
            existing = deduped[blocker.dedup_key]
            if blocker.confidence > existing.confidence:
                deduped[blocker.dedup_key] = blocker
    return list(deduped.values())
