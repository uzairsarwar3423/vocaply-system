import re
from typing import Tuple, Optional
from pydantic import BaseModel
from src.models.extraction_models import ExtractedCommitment

class ConfidenceCalibrationFlag(BaseModel):
    is_suspicious: bool
    reason: Optional[str] = None
    model_stated: float
    heuristic_estimate_range: Tuple[float, float]

class ParsedCommitment(ExtractedCommitment):
    normalized_text: str
    dedup_key: str
    calibration_flag: ConfidenceCalibrationFlag

STOPWORDS = {
    "i", "will", "have", "the", "a", "an", "by", "to", "it", "my", "is", "am",
    "are", "be", "was", "were", "been", "do", "did", "does", "for", "with",
    "this", "that", "all", "in", "on", "at", "up", "we", "our", "ill", "im",
    "let", "me", "make", "sure"
}

def normalize_text(text: str) -> str:
    # 1. Lowercase
    t = text.lower()
    # 2. Remove punctuation (preserve word chars and spaces)
    t = re.sub(r'[^\w\s]', '', t)
    # 3. Tokenize on whitespace
    tokens = t.split()
    # 4. Remove stopwords
    tokens = [tok for tok in tokens if tok not in STOPWORDS]
    # 5. Simple suffix stemming
    stemmed = []
    for tok in tokens:
        if len(tok) > 5 and tok.endswith("ing"):
            tok = tok[:-3]
        elif len(tok) > 4 and tok.endswith("ed"):
            tok = tok[:-2]
        elif len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
            tok = tok[:-1]
        stemmed.append(tok)
    # 6. Take first 5 tokens
    stemmed = stemmed[:5]
    # 7. Join with spaces
    return " ".join(stemmed)

def check_confidence_calibration(commitment: ExtractedCommitment) -> ConfidenceCalibrationFlag:
    text_lower = commitment.text.lower()
    conf = commitment.confidence
    
    first_person_pronouns = ["i", "i'll", "i'm", "i've", "i'd"]
    has_first_person = any(re.search(rf'\b{re.escape(p)}\b', text_lower) for p in first_person_pronouns)
    
    hedge_words = ["try", "maybe", "hopefully", "perhaps", "might", "should be able"]
    has_hedge = any(word in text_lower for word in hedge_words)
    
    word_count = len(text_lower.split())
    
    if conf > 0.6 and not has_first_person:
        return ConfidenceCalibrationFlag(
            is_suspicious=True,
            reason="High confidence but no first-person pronoun (first_person)",
            model_stated=conf,
            heuristic_estimate_range=(0.3, 0.6)
        )
        
    if conf > 0.7 and has_hedge:
        return ConfidenceCalibrationFlag(
            is_suspicious=True,
            reason="High confidence but contains hedge words",
            model_stated=conf,
            heuristic_estimate_range=(0.3, 0.6)
        )
        
    if conf > 0.8 and word_count < 8:
        return ConfidenceCalibrationFlag(
            is_suspicious=True,
            reason="High confidence but text is very short",
            model_stated=conf,
            heuristic_estimate_range=(0.3, 0.7)
        )
        
    return ConfidenceCalibrationFlag(
        is_suspicious=False,
        reason=None,
        model_stated=conf,
        heuristic_estimate_range=(conf, conf)
    )

def build_dedup_key(commitment: ExtractedCommitment, normalized_text: str) -> str:
    return f"{commitment.owner_name.lower().strip()}::{normalized_text}"

def parse_commitment(raw: ExtractedCommitment) -> ParsedCommitment:
    normalized_text = normalize_text(raw.text)
    dedup_key = build_dedup_key(raw, normalized_text)
    calibration_flag = check_confidence_calibration(raw)
    
    return ParsedCommitment(
        **raw.model_dump(),
        normalized_text=normalized_text,
        dedup_key=dedup_key,
        calibration_flag=calibration_flag
    )
