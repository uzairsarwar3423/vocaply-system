from src.models.extraction_models import ExtractedActionItem, PriorityLevel
from src.services.extraction.action_item_parser import parse_action_item, dedup_action_items

def test_parse_action_item():
    raw = ExtractedActionItem(text="do something", assignee_name=" User ", priority="HIGH", confidence=0.8)
    parsed = parse_action_item(raw)
    assert parsed.dedup_key == "user::do something"
    assert parsed.priority == PriorityLevel.HIGH

def test_dedup_action_items():
    raw1 = ExtractedActionItem(text="same text", assignee_name="User", priority="HIGH", confidence=0.8)
    raw2 = ExtractedActionItem(text="same text  ", assignee_name="user", priority="HIGH", confidence=0.9)
    raw3 = ExtractedActionItem(text="different text", assignee_name="User", priority="HIGH", confidence=0.8)
    
    p1 = parse_action_item(raw1)
    p2 = parse_action_item(raw2)
    p3 = parse_action_item(raw3)
    
    deduped = dedup_action_items([p1, p2, p3])
    assert len(deduped) == 2
    
    same_text_item = next(i for i in deduped if "same text" in i.dedup_key)
    assert same_text_item.confidence == 0.9
