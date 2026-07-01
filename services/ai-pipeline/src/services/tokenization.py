"""
services/tokenization.py
────────────────────────
Token counting and estimation using tiktoken.
"""

from __future__ import annotations

import math
import tiktoken

from src.config.cleanup_config import TOKEN_ESTIMATE_SAFETY_MARGIN

# Load the encoder once at module level for performance
# o200k_base or cl100k_base are standard for OpenAI/OpenRouter approximation
_encoder = tiktoken.get_encoding("o200k_base")


def estimate_token_count(text: str) -> int:
    """Estimate the token count for a given text with a safety margin.
    
    Args:
        text: The text to estimate.
        
    Returns:
        The estimated token count, rounded up.
    """
    if not text:
        return 0
        
    raw_count = len(_encoder.encode(text))
    return math.ceil(raw_count * TOKEN_ESTIMATE_SAFETY_MARGIN)


def estimate_token_count_batch(texts: list[str]) -> list[int]:
    """Estimate token counts for a batch of texts efficiently.
    
    Args:
        texts: List of texts to estimate.
        
    Returns:
        List of estimated token counts.
    """
    if not texts:
        return []
        
    # encode_batch is faster for multiple strings
    raw_counts = [len(enc) for enc in _encoder.encode_batch(texts)]
    return [math.ceil(count * TOKEN_ESTIMATE_SAFETY_MARGIN) for count in raw_counts]
