"""
services/chunker.py
───────────────────
Shared chunking module for Transcript extraction and RAG embedding.
"""

from __future__ import annotations

import re

from src.models.chunk_models import (
    ChunkableContent,
    ChunkingStrategy,
    ChunkMetadata,
    PlainTextContent,
    TextChunk,
    TranscriptContent,
)
from src.services.tokenization import estimate_token_count


class IncompatibleChunkingStrategyError(Exception):
    """Raised when the requested strategy cannot be applied to the provided content shape."""


class ChunkSizeExceededError(Exception):
    """Raised when SINGLE_UNIT strategy is requested but content exceeds max_tokens."""


def chunk_content(
    content: ChunkableContent,
    strategy: ChunkingStrategy,
    max_tokens: int,
    overlap_units: int = 2,
) -> tuple[list[TextChunk], ChunkMetadata]:
    """Chunk the provided content according to the requested strategy.
    
    Args:
        content: TranscriptContent or PlainTextContent.
        strategy: The ChunkingStrategy to apply.
        max_tokens: The token budget per chunk.
        overlap_units: For Transcript strategy, this is turns. For PlainText, it's sentences/tokens.
        
    Returns:
        A tuple of (List of chunks, ChunkMetadata).
    """
    if strategy == ChunkingStrategy.SPEAKER_TURN_GROUPED:
        if not isinstance(content, TranscriptContent):
            raise IncompatibleChunkingStrategyError("SPEAKER_TURN_GROUPED requires TranscriptContent.")
        return _chunk_speaker_turn_grouped(content, max_tokens, overlap_units)
        
    elif strategy == ChunkingStrategy.FIXED_SIZE_WITH_OVERLAP:
        if not isinstance(content, PlainTextContent):
            raise IncompatibleChunkingStrategyError("FIXED_SIZE_WITH_OVERLAP requires PlainTextContent.")
        return _chunk_fixed_size_with_overlap(content, max_tokens, overlap_units)
        
    elif strategy == ChunkingStrategy.SINGLE_UNIT:
        return _chunk_single_unit(content, max_tokens)
        
    else:
        raise ValueError(f"Unknown strategy: {strategy}")


def _chunk_speaker_turn_grouped(
    content: TranscriptContent, max_tokens: int, overlap_turns: int
) -> tuple[list[TextChunk], ChunkMetadata]:
    chunks: list[TextChunk] = []
    oversized_turns: list[str] = []
    
    current_chunk_turns = []
    current_chunk_tokens = 0
    chunk_index = 0
    
    total_source_tokens = 0

    def close_chunk(turns_to_close, index) -> TextChunk:
        text = "\n".join(
            f"{t.speaker_name}: {t.cleaned_text}" for t in turns_to_close
        )
        t_count = estimate_token_count(text)
        return TextChunk(
            content=text,
            token_count=t_count,
            source_turn_ids=[t.turn_id for t in turns_to_close],
            start_time=turns_to_close[0].start_time if turns_to_close else None,
            end_time=turns_to_close[-1].end_time if turns_to_close else None,
            chunk_index=index,
        )

    for turn in content.turns:
        turn_text = f"{turn.speaker_name}: {turn.cleaned_text}"
        turn_tokens = estimate_token_count(turn_text)
        total_source_tokens += turn_tokens
        
        if turn_tokens > max_tokens:
            oversized_turns.append(turn.turn_id)
            
            # If we have accumulated turns, flush them first
            if current_chunk_turns:
                chunks.append(close_chunk(current_chunk_turns, chunk_index))
                chunk_index += 1
                
                # Apply overlap for the oversized turn
                overlap = current_chunk_turns[-overlap_turns:] if overlap_turns > 0 else []
                overlap_tokens = sum(estimate_token_count(f"{t.speaker_name}: {t.cleaned_text}") for t in overlap)
                current_chunk_turns = overlap
                current_chunk_tokens = overlap_tokens
            
            # Place the oversized turn alone in its own chunk, plus overlap if any
            current_chunk_turns.append(turn)
            chunks.append(close_chunk(current_chunk_turns, chunk_index))
            chunk_index += 1
            
            # Reset
            overlap = current_chunk_turns[-overlap_turns:] if overlap_turns > 0 else []
            overlap_tokens = sum(estimate_token_count(f"{t.speaker_name}: {t.cleaned_text}") for t in overlap)
            current_chunk_turns = overlap
            current_chunk_tokens = overlap_tokens
            continue

        if current_chunk_tokens + turn_tokens > max_tokens and current_chunk_turns:
            # Check if this boundary only contains overlap
            if len(current_chunk_turns) <= overlap_turns:
                 # This can only happen if overlap alone exceeds budget, we just append
                 pass
            else:
                 chunks.append(close_chunk(current_chunk_turns, chunk_index))
                 chunk_index += 1
                 
                 overlap = current_chunk_turns[-overlap_turns:] if overlap_turns > 0 else []
                 overlap_tokens = sum(estimate_token_count(f"{t.speaker_name}: {t.cleaned_text}") for t in overlap)
                 current_chunk_turns = overlap
                 current_chunk_tokens = overlap_tokens
                 
                 # If overlap alone exceeds max_tokens (rare), we must handle it gracefully by reducing overlap
                 while current_chunk_tokens + turn_tokens > max_tokens and current_chunk_turns:
                     popped = current_chunk_turns.pop(0)
                     current_chunk_tokens -= estimate_token_count(f"{popped.speaker_name}: {popped.cleaned_text}")

        current_chunk_turns.append(turn)
        current_chunk_tokens += turn_tokens
        
    if current_chunk_turns:
        chunks.append(close_chunk(current_chunk_turns, chunk_index))
        
    meta = ChunkMetadata(
        strategy_used=ChunkingStrategy.SPEAKER_TURN_GROUPED,
        total_chunks=len(chunks),
        total_source_tokens_estimate=total_source_tokens,
        overlap_applied=overlap_turns > 0 and len(chunks) > 1,
        oversized_single_turn_chunks=oversized_turns,
    )
    return chunks, meta


def _chunk_fixed_size_with_overlap(
    content: PlainTextContent, max_tokens: int, overlap_tokens: int
) -> tuple[list[TextChunk], ChunkMetadata]:
    # A simple sentence boundary regex
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+(?=[A-Z])', content.text) if s.strip()]
    if not sentences:
        sentences = [content.text]
        
    chunks: list[TextChunk] = []
    current_sentences = []
    current_tokens = 0
    chunk_index = 0
    
    total_source_tokens = estimate_token_count(content.text)
    
    def close_chunk(sents, index) -> TextChunk:
        text = " ".join(sents)
        return TextChunk(
            content=text,
            token_count=estimate_token_count(text),
            chunk_index=index,
            source_turn_ids=None,
            start_time=None,
            end_time=None
        )

    for sentence in sentences:
        sentence_tokens = estimate_token_count(sentence)
        
        if sentence_tokens > max_tokens:
            # Oversized sentence.
            if current_sentences:
                chunks.append(close_chunk(current_sentences, chunk_index))
                chunk_index += 1
                current_sentences = []
                current_tokens = 0
            chunks.append(close_chunk([sentence], chunk_index))
            chunk_index += 1
            continue
            
        if current_tokens + sentence_tokens > max_tokens and current_sentences:
            chunks.append(close_chunk(current_sentences, chunk_index))
            chunk_index += 1
            
            # Apply overlap based on tokens
            overlap = []
            o_tokens = 0
            for s in reversed(current_sentences):
                s_toks = estimate_token_count(s)
                if o_tokens + s_toks <= overlap_tokens:
                    overlap.insert(0, s)
                    o_tokens += s_toks
                else:
                    break
            
            current_sentences = overlap
            current_tokens = o_tokens
            
        current_sentences.append(sentence)
        current_tokens += sentence_tokens
        
    if current_sentences:
        chunks.append(close_chunk(current_sentences, chunk_index))
        
    meta = ChunkMetadata(
        strategy_used=ChunkingStrategy.FIXED_SIZE_WITH_OVERLAP,
        total_chunks=len(chunks),
        total_source_tokens_estimate=total_source_tokens,
        overlap_applied=overlap_tokens > 0 and len(chunks) > 1,
    )
    return chunks, meta


def _chunk_single_unit(
    content: ChunkableContent, max_tokens: int
) -> tuple[list[TextChunk], ChunkMetadata]:
    
    if isinstance(content, TranscriptContent):
        text = "\n".join(f"{t.speaker_name}: {t.cleaned_text}" for t in content.turns)
        source_ids = [t.turn_id for t in content.turns]
        start_time = content.turns[0].start_time if content.turns else None
        end_time = content.turns[-1].end_time if content.turns else None
    else:
        text = content.text
        source_ids = None
        start_time = None
        end_time = None
        
    token_count = estimate_token_count(text)
    
    if token_count > max_tokens:
        raise ChunkSizeExceededError(f"SINGLE_UNIT requested but token count {token_count} exceeds budget {max_tokens}.")
        
    chunk = TextChunk(
        content=text,
        token_count=token_count,
        source_turn_ids=source_ids,
        start_time=start_time,
        end_time=end_time,
        chunk_index=0,
    )
    
    meta = ChunkMetadata(
        strategy_used=ChunkingStrategy.SINGLE_UNIT,
        total_chunks=1,
        total_source_tokens_estimate=token_count,
        overlap_applied=False,
    )
    
    return [chunk], meta
