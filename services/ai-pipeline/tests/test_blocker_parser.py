from src.models.extraction_models import ExtractedBlocker
from src.services.extraction.blocker_parser import parse_blocker, dedup_blockers

def test_parse_blocker():
    raw = ExtractedBlocker(text="  Waiting on API  ", affected_name="alice", blocking_party="backend team", confidence=0.8)
    parsed = parse_blocker(raw)
    assert parsed.text_normalized == "waiting on api"
    assert parsed.affected_name == "Alice"
    assert parsed.blocking_party == "Backend Team"

def test_dedup_blockers():
    raw1 = ExtractedBlocker(text="same text", confidence=0.8)
    raw2 = ExtractedBlocker(text="same text  ", confidence=0.9)
    p1 = parse_blocker(raw1)
    p2 = parse_blocker(raw2)
    
    deduped = dedup_blockers([p1, p2])
    assert len(deduped) == 1
    assert deduped[0].confidence == 0.9
