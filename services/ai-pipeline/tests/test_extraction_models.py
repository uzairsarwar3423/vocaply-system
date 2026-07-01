import pytest
from pydantic import ValidationError
from src.models.extraction_models import ExtractedCommitment, ExtractedActionItem, PriorityLevel, ExtractionResponse

def test_extracted_commitment_valid():
    c = ExtractedCommitment(text="valid text", owner_name="owner", confidence=0.8)
    assert c.text == "valid text"
    
def test_extracted_commitment_empty_text():
    with pytest.raises(ValidationError):
        ExtractedCommitment(text="   ", owner_name="owner", confidence=0.8)

def test_extracted_commitment_confidence_bounds():
    with pytest.raises(ValidationError):
        ExtractedCommitment(text="valid", owner_name="owner", confidence=-0.01)
    with pytest.raises(ValidationError):
        ExtractedCommitment(text="valid", owner_name="owner", confidence=1.01)

def test_action_item_priority():
    a = ExtractedActionItem(text="valid", assignee_name="assignee", priority="HIGH", confidence=0.8)
    assert a.priority == PriorityLevel.HIGH

def test_action_item_priority_fallback():
    a = ExtractedActionItem(text="valid", assignee_name="assignee", priority="CRITICAL", confidence=0.8)
    assert a.priority == PriorityLevel.MEDIUM

def test_extraction_response_filters_low_confidence():
    c1 = ExtractedCommitment(text="valid 1", owner_name="o1", confidence=0.8)
    c2 = ExtractedCommitment(text="valid 2", owner_name="o2", confidence=0.2)
    resp = ExtractionResponse(commitments=[c1, c2], summary="A very long summary " * 5)
    assert len(resp.commitments) == 1
    assert resp.commitments[0].owner_name == "o1"
