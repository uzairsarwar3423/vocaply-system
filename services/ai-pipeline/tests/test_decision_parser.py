from src.models.extraction_models import ExtractedDecision
from src.services.extraction.decision_parser import parse_decision

def test_parse_decision():
    raw = ExtractedDecision(text="  We decided to launch  ", confidence=0.8)
    parsed = parse_decision(raw)
    assert parsed.text_normalized == "we decided to launch"
