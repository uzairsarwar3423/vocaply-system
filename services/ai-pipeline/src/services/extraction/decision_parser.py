from src.models.extraction_models import ExtractedDecision
from pydantic import BaseModel

class ParsedDecision(ExtractedDecision):
    text_normalized: str

def parse_decision(raw: ExtractedDecision) -> ParsedDecision:
    text_normalized = raw.text.lower().strip()
    
    return ParsedDecision(
        **raw.model_dump(),
        text_normalized=text_normalized
    )
