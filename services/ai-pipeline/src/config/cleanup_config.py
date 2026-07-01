"""
config/cleanup_config.py
────────────────────────
All tunable constants for the transcript cleanup pipeline.

PRINCIPAL NOTE — why this file exists (not inline constants):
  The plan identified that hardcoding these values inside service files
  is a maintainability risk. These are exactly the numbers a data-driven
  eval (Day 60's accuracy/cost report, or ongoing production monitoring)
  will want to tune WITHOUT a code review of business logic.

  By living here:
    1. A single, clearly named change site for any operational tuning.
    2. Tests can import and assert against the same constants the service uses.
    3. Mirrors the same discipline applied to model_routing.py on Day 46.

FILLER_WORDS is a frozenset for two reasons:
  - O(1) membership checks (vs. list O(n))
  - Immutability — prevents accidental runtime mutation of a shared
    module-level singleton (a subtle correctness bug class in Python)

CONTEXTUAL_FILLERS (informational, NOT in the unambiguous list):
  Words like "actually", "basically", "like", "you know" appear in
  the FILLER_WORDS list only where they are unambiguously filler.
  "Actually" in "this is actually wrong" is meaningful; "actually" as
  a sentence-opener filler is not — that contextual judgment is left
  to Stage 2 (Gemini), not this cheap rule-based pass. Design boundary
  is explicit: deterministic pass removes only the UNAMBIGUOUS ones.
"""

from __future__ import annotations

# ─── Stage 1: Speaker Merge ───────────────────────────────────────────────────

SPEAKER_MERGE_TIME_GAP_SECONDS: float = 1.5
"""Maximum gap (seconds) between two consecutive same-speaker turns
to trigger merge into one. Calibrated against typical ASR segmentation
at Vocaply's target meeting types (standups, interviews, all-hands).
Expected recalibration range: 0.8s–3.0s based on ASR tuning.
"""

# ─── Stage 1.5: Rule-Based Filler Removal ─────────────────────────────────────

FILLER_WORDS: frozenset[str] = frozenset(
    {
        # Unambiguous vocal fillers
        "um",
        "uh",
        "er",
        "ah",
        "hmm",
        "hm",
        # Short fixed-phrase fillers — unambiguous in context
        "you know",
        "i mean",
        "sort of",
        "kind of",
        # Repeated/stuttered affirmatives
        "yeah yeah",
        "right right",
        "ok ok",
        "okay okay",
        # Discourse markers often used as pure filler (not contextual!)
        # NOTE: "like" is NOT here — too context-dependent ("I'd like to...").
        #       Left to Stage 2 model judgment.
        # NOTE: "actually", "basically" — excluded (context-dependent).
        #       Left to Stage 2 model judgment.
        # NOTE: "so" as sentence-starter — excluded, too grammatically loaded.
    }
)
"""Unambiguous filler words/phrases stripped by the rule-based pass (Stage 1.5).

This is a living config value — expected to be refined based on real
production transcripts post-launch. It is NOT assumed final today.

Conservative by design: only includes words/phrases that are NEVER
meaningful in their standalone usage within meeting speech. Contextual
fillers (like, actually, basically) are excluded — that judgment belongs
to Stage 2 (Gemini), not this deterministic pass.
"""

# ─── Stage 2: Grammar Normalizer Batching ────────────────────────────────────

GRAMMAR_BATCH_MAX_TURNS: int = 18
"""Maximum number of merged turns per Gemini batch.
Whichever limit (turns or tokens) is hit first closes the current batch.
18 turns is empirically derived to stay safely under typical Flash-Lite
context window constraints while maximizing throughput per call.
"""

GRAMMAR_BATCH_MAX_TOKENS: int = 2000
"""Approximate max input tokens per Gemini batch.
Used together with GRAMMAR_BATCH_MAX_TURNS — whichever fires first wins.
Token estimation uses a conservative word-count heuristic (see grammar_normalizer.py).
Expected recalibration: based on real average-words-per-turn distributions post-launch.
"""

# ─── Stage 2: Guardrail ───────────────────────────────────────────────────────

LENGTH_RATIO_MIN: float = 0.5
"""Minimum acceptable ratio of cleaned_text length to original_text length.
Below this → model over-condensed or dropped content → revert + flag.
Calibration: 0.5x means \"cleaned text is at most 50% shorter than original\".
Expected recalibration once real usage data shows the true distribution
of legitimate-cleanup length deltas.
"""

LENGTH_RATIO_MAX: float = 1.1
"""Maximum acceptable ratio of cleaned_text length to original_text length.
Above this → model added content → revert + flag.
1.1x allows minor punctuation/capitalization additions (e.g. \"OK\" → \"Okay\").
"""

# ─── Stage 2: Concurrency ─────────────────────────────────────────────────────

CLEANUP_BATCH_CONCURRENCY: int = 4
"""Maximum concurrent Gemini batch calls from the cleanup stage.

This is the cleanup stage's LOCAL concurrency limit — it is nested inside
(and always ≤) Day 46's process-wide GeminiClient semaphore ceiling
(gemini_max_concurrent_calls in settings.py).

Set deliberately below the global ceiling to leave headroom for other
concurrent pipeline stages (e.g. Day 50's extraction running on a
different meeting at the same time on the same process).
"""

# ─── Prompt ───────────────────────────────────────────────────────────────────

CLEANUP_PROMPT_PATH: str = "src/prompts/cleanup_system.txt"
"""Relative path (from project root) to the system prompt file.
Resolved at runtime by grammar_normalizer.py using pathlib.
The prompt's first line is a machine-readable version marker parsed
into CleanupMetadata.prompt_version.
"""

# ─── Gemini Temperature ───────────────────────────────────────────────────────

GRAMMAR_NORMALIZER_TEMPERATURE: float = 0.15
"""Near-deterministic temperature for the grammar cleanup task.
0.0 is avoided — some models exhibit degenerate-repetition at strict zero.
0.15 provides near-deterministic output while avoiding that failure mode.
This is a consistency-first task; creativity/variation are anti-goals.
"""

# ─── Stage 3: Confidence & Tokenization ───────────────────────────────────────

CONFIDENCE_THRESHOLD: float = 0.6
"""Threshold below which a turn's average word confidence is flagged as uncertain."""

TOKEN_ESTIMATE_SAFETY_MARGIN: float = 1.15
"""Multiplier applied to local tiktoken counts to ensure we don't accidentally exceed Gemini's actual budget."""
