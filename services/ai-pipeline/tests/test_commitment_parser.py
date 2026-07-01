from src.services.extraction.commitment_parser import normalize_text, check_confidence_calibration, build_dedup_key
from src.models.extraction_models import ExtractedCommitment

def test_normalize_text():
    assert normalize_text("I'll finish the login feature by Thursday") == "finish login feature thursday"
    assert normalize_text("I'm updating the documentation") == "updat documentation"
    assert normalize_text("Let me make sure I review the PRs") == "review prs"
    assert normalize_text("") == ""

def test_check_confidence_calibration():
    # high confidence no first person
    c1 = ExtractedCommitment(text="will do it", owner_name="Bob", confidence=0.85)
    f1 = check_confidence_calibration(c1)
    assert f1.is_suspicious == True
    
    # high confidence with first person
    c2 = ExtractedCommitment(text="I'll do it by tomorrow and push the code for review", owner_name="Bob", confidence=0.85)
    f2 = check_confidence_calibration(c2)
    assert f2.is_suspicious == False

def test_build_dedup_key():
    c = ExtractedCommitment(text="test text", owner_name=" Bob ", confidence=0.8)
    key = build_dedup_key(c, "test text")
    assert key == "bob::test text"
