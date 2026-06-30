"""
config/model_routing.py
───────────────────────
Task-type → model-tier routing table and pricing constants.

PRINCIPAL DESIGN DECISIONS:

1. Task-type-routed, not thin-wrapper: callers say "I'm doing EXTRACTION",
   never "use gemini-2.0-flash-lite". This is a Strategy/routing-table pattern
   that decouples *what the caller wants* from *which model does it best/cheapest*.
   Swapping to a new model = one-line edit here, not a nine-file grep.

2. MODEL_TIER_TO_NAME resolved from settings (not hardcoded): a model name
   change (Google retiring/renaming) is an env var change in deployment config,
   never a code deploy.

3. PRICING_TABLE is explicitly commented "verify before each deploy" — provider
   pricing changes are outside this codebase's control, and silent staleness
   would corrupt every cost report from Day 60 onward.

4. resolve_model() is the ONLY public surface other modules touch — callers
   never reach into the dicts directly, keeping routing logic swappable
   behind one function signature.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.config.settings import Settings, get_settings
from src.models.common import ModelTier, TaskType


# ─── Task → Tier Routing Table ────────────────────────────────────────────────
# RATIONALE PER TASK:
#   TRANSCRIPT_CLEANUP: Flash-Lite — simple cleanup, cost-sensitive, high volume
#   EXTRACTION:         Flash-Lite — structured extraction, cost-sensitive
#   RESOLUTION_CHECK:  Flash-Lite — lightweight binary/categorical check
#   SUMMARY:            Flash     — narrative prose requires higher capability
#   CHAT_ANSWER:        Flash     — interactive, quality-sensitive
#   EMBEDDING:          Embedding — entirely different SDK code path
#   RERANK:             Flash-Lite — lightweight pairwise comparison

TASK_MODEL_MAP: dict[TaskType, ModelTier] = {
    TaskType.TRANSCRIPT_CLEANUP: ModelTier.FLASH_LITE,
    TaskType.EXTRACTION: ModelTier.FLASH_LITE,
    TaskType.RESOLUTION_CHECK: ModelTier.FLASH_LITE,
    TaskType.SUMMARY: ModelTier.FLASH,
    TaskType.CHAT_ANSWER: ModelTier.FLASH,
    TaskType.EMBEDDING: ModelTier.EMBEDDING,
    TaskType.RERANK: ModelTier.FLASH_LITE,
}


# ─── Pricing Constants ────────────────────────────────────────────────────────
# IMPORTANT: Verify against current Google AI pricing before each deploy.
# https://ai.google.dev/pricing
# These are USD per 1,000,000 tokens as of mid-2025.
# Silent staleness here corrupts every cost record from Day 60 onward.


@dataclass(frozen=True)
class PricingRates:
    input_per_million_usd: float   # Cost per 1M input tokens
    output_per_million_usd: float  # Cost per 1M output tokens


PRICING_TABLE: dict[ModelTier, PricingRates] = {
    # gemini-2.0-flash-lite: cheapest text generation tier
    ModelTier.FLASH_LITE: PricingRates(
        input_per_million_usd=0.075,
        output_per_million_usd=0.30,
    ),
    # gemini-2.0-flash: standard quality text generation
    ModelTier.FLASH: PricingRates(
        input_per_million_usd=0.075,
        output_per_million_usd=0.30,
    ),
    # text-embedding-004: embedding generation
    # NOTE: Embedding API pricing differs significantly — confirm at implementation
    ModelTier.EMBEDDING: PricingRates(
        input_per_million_usd=0.001,
        output_per_million_usd=0.0,  # Embeddings have no "output tokens" cost
    ),
}


# ─── Public Interface ─────────────────────────────────────────────────────────


def resolve_model(
    task_type: TaskType,
    settings: Settings | None = None,
) -> tuple[str, ModelTier]:
    """Resolve a TaskType to (model_name, model_tier).

    This is the ONLY function other modules call — they never reach into
    TASK_MODEL_MAP or MODEL_TIER_TO_NAME directly. This keeps the routing
    logic swappable behind a single stable function signature.

    Args:
        task_type: The semantic task being performed.
        settings: Settings instance; defaults to the process singleton.

    Returns:
        (model_name, model_tier) — model_name is the actual Gemini model
        identifier string to pass to the SDK.
    """
    if settings is None:
        settings = get_settings()

    tier = TASK_MODEL_MAP[task_type]

    # Resolved from settings at call time — not at import time —
    # so a test can override settings without needing a module reload.
    tier_to_name: dict[ModelTier, str] = {
        ModelTier.FLASH_LITE: settings.gemini_flash_lite_model_name,
        ModelTier.FLASH: settings.gemini_flash_model_name,
        ModelTier.EMBEDDING: settings.gemini_embedding_model_name,
    }

    model_name = tier_to_name[tier]
    return model_name, tier


def compute_cost(
    input_tokens: int,
    output_tokens: int,
    model_tier: ModelTier,
) -> float:
    """Compute estimated USD cost for a single Gemini call.

    Pure function — no I/O, easily unit-testable with hand-calculated
    expected values (per §7 test criteria).
    """
    rates = PRICING_TABLE[model_tier]
    input_cost = (input_tokens / 1_000_000) * rates.input_per_million_usd
    output_cost = (output_tokens / 1_000_000) * rates.output_per_million_usd
    return input_cost + output_cost
