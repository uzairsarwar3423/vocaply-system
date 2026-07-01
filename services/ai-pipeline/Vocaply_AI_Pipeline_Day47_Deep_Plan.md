# Vocaply — AI Pipeline: Day 47 Deep Build Plan
## Transcript Cleanup Pipeline — Stage 1 (Speaker Formatting) + Stage 2 (Grammar/Filler Cleanup via Gemini-on-OpenRouter)
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Stack: Python 3.12 · FastAPI · Pydantic v2 · OpenRouter (OpenAI-compatible) → Gemini 2.5 Flash-Lite · httpx · tenacity
> Document: AI-PIPELINE-DAY47-DEEP | Version 1.0 | Planning Only — No Code

---

## 0. Provider Change Carried From Day 46 — OpenRouter, Not Direct Google SDK

A platform-level decision has been made: **all Gemini calls route through OpenRouter**, not the direct `google-genai` SDK assumed in the original Day 46 draft. This is not a cosmetic swap — it changes real implementation details that today's Stage 2 cleanup work depends on, so they're called out explicitly before anything else:

```
WHY OPENROUTER (the trade-off, stated honestly):
  + Single OpenAI-compatible API surface — if the platform ever wants to
    A/B a task against a different model family (e.g. compare Gemini
    Flash-Lite vs. a Llama or Mistral variant for cleanup cost/quality)
    it's a model-string change, not a second SDK integration
  + Built-in provider-level fallback/load-balancing options on OpenRouter's
    side reduce a class of "Google had a regional blip" failures we'd
    otherwise have to engineer ourselves
  + One bill, one rate-limit surface, one auth key to rotate operationally
  − An extra network hop (OpenRouter → Google) — marginal added latency,
    acceptable for Flash-Lite's already-fast profile, but explicitly
    measured and logged (see §6) rather than assumed negligible
  − Structured-output / JSON-schema enforcement is exposed via OpenRouter's
    OpenAI-compatible `response_format` parameter, not Google's native
    `response_schema` binding — slightly less first-class typed integration
    than calling Google directly, compensated for by stricter
    application-side Pydantic validation (already the plan's posture anyway)
  − Token usage accounting comes back in OpenAI's `usage` object shape
    (prompt_tokens/completion_tokens), not Google's native field names —
    the Day 46 GeminiClient's cost-tracking mapping layer must target
    THIS shape, not a hypothetical native-SDK shape

WHAT THIS MEANS FOR DAY 46'S gemini_client.py (retroactive note, not
re-built today, but the contract Day 47 calls into):
  - Uses an OpenAI-compatible client (the `openai` Python SDK pointed at
    `base_url="https://openrouter.ai/api/v1"`, or a raw httpx client —
    either is viable; the `openai` SDK is preferred for its mature
    request/response typing and lower maintenance burden) rather than
    `google-genai`.
  - Model strings are OpenRouter slugs: `google/gemini-2.5-flash-lite`
    and `google/gemini-2.5-flash` — these live in model_routing.py
    exactly as planned, just with OpenRouter-formatted values.
  - Required OpenRouter-specific headers on every call: `HTTP-Referer`
    (identifies the calling app to OpenRouter, required for their
    leaderboard/attribution and good practice for support escalations)
    and `X-Title` ("Vocaply AI Pipeline") — both settings-driven constants.
  - Structured output uses `response_format={"type": "json_schema",
    "json_schema": {...}}` (OpenRouter's pass-through of the underlying
    model's structured-output capability) — Day 46's `generate_structured`
    method signature is unchanged from the caller's perspective; only its
    internal SDK call construction differs. Today's cleanup work treats
    this as already solved infrastructure and consumes it as-is.
  - Cost calculation: OpenRouter's response includes actual cost data in
    some configurations (`usage.cost` when the `usage: {include: true}`
    request option is set) — preferred over the static internal pricing
    table where available, since it reflects OpenRouter's real billed
    amount including any routing markup, not just Google's list price.
    This is the more accurate source of truth and today's grammar_normalizer
    work assumes Day 46's CostRecord is populated from real OpenRouter
    usage data, not just an estimate.

THIS DOCUMENT DOES NOT RE-PLAN DAY 46. It calls out only the parts of
that contract Day 47's Stage 2 work directly depends on, so today's
plan is accurate against the real provider integration rather than a
now-outdated direct-SDK assumption.
```

---

## 1. Objective & Why It Matters (Reaffirmed)

Today builds the first two of three transcript-cleanup stages, implementing the platform's non-negotiable rule: **no raw ASR transcript is ever read by extraction, embedding, or the UI directly.** Stage 1 (speaker formatting) is pure, deterministic, model-free Python logic — it must be correct and fast, with zero dependency on any LLM. Stage 2 (grammar/filler cleanup) is the first place in the entire AI Pipeline phase that an LLM call touches real user content at meaningful volume, so today is also where the **lossy-safe, not lossy-creative** discipline gets its first real enforcement: a low-temperature, tightly-scoped prompt plus a hard numeric guardrail (length-ratio check) that distrusts the model by default rather than trusting it.

Stage 3 (confidence flagging + timestamp re-validation) is deliberately deferred to Day 48 — it depends on today's merged/cleaned output existing first, and folding it in today would make the day's test surface too large to verify rigorously in one sitting.

---

## 2. Architectural Decisions Made Today

```
DECISION 1 — Stage 1 has zero LLM dependency
  Speaker-turn merging is a deterministic algorithm over timestamps and
  speaker tags. There is no ambiguity an LLM needs to resolve here, and
  spending a model call on it would be pure waste — cost AND latency
  with zero quality upside. This is the kind of judgment call a principal
  engineer is expected to make explicitly: not every step in an "AI
  pipeline" needs to call an AI model.

DECISION 2 — Speaker name resolution is NEVER re-implemented in Python
  The Node.js meetings module already owns participant/speaker resolution
  (owner-resolver.service.ts, meeting_participants table, fuzzy-name-match
  logic). Today's cleanup service receives an already-resolved
  ParticipantMap as part of its request payload and does pure lookup —
  it does not re-derive identity from email/name fuzzy matching itself.
  WHY THIS MATTERS: two independent implementations of "who is Speaker 1"
  across two languages is a guaranteed long-term source of silent
  disagreement (Node.js says "Ahmed Hassan", Python says "Ahmed H.") that
  would surface as a confusing, hard-to-debug data inconsistency months
  later. One source of truth, one language, full stop.

DECISION 3 — Rule-based filler removal runs BEFORE the model call, not after
  This is a deliberate cost-architecture decision, not just an ordering
  convenience. Every filler word stripped by the free regex pass is a
  filler word the paid Gemini-via-OpenRouter call never has to "see,"
  reason about, or spend output tokens reproducing-minus-the-filler.
  At Vocaply's meeting volume (per the platform's own HLD cost model),
  this ordering is a real, measurable cost lever, not a micro-optimization.

DECISION 4 — The model is never trusted by default; the guardrail is the
  default-deny posture
  Industry experience with LLM-based text rewriting tasks shows the
  failure mode is rarely "obviously wrong output" — it's confidently
  fluent over-editing (summarizing instead of cleaning, dropping a
  caveat the speaker actually said). A length-ratio guardrail is a
  blunt instrument deliberately chosen over a more "intelligent"
  semantic-similarity check BECAUSE it's cheap, fast, deterministic,
  and has no false-trust failure mode of its own (a semantic-similarity
  check would itself be another model call with its own error rate —
  guarding a model call with another model call is turtles all the way
  down; a simple numeric heuristic is the right tool here).

DECISION 5 — Batch-level partial failure isolation, never whole-meeting
  failure for one bad batch
  A 2-hour all-hands might be cleaned across 8-10 Gemini batches. If
  batch 6 of 10 fails after retries (rate limit, transient OpenRouter
  routing issue), the other 9 succeeding batches' work must not be
  discarded. This is the same "never silently get stuck, never lose
  good partial work" principle already codified in the platform's
  Day 18 async-engine plan, applied here at the cleanup-batch level.

DECISION 6 — This service remains stateless; persistence stays in Node.js
  The FastAPI cleanup endpoint computes and returns a CleanupResult; it
  does not write to MongoDB itself. This keeps the AI Pipeline service a
  pure compute layer, horizontally scalable with zero storage coupling,
  and keeps MongoDB document lifecycle ownership in exactly one place
  (the Node.js transcribe.worker, per the existing LLD).
```

---

## 3. Hour-by-Hour Execution Plan (8-Hour Day)

```
9:00 – 9:30    models/cleanup_models.py — full Pydantic contract definition,
               cross-referenced field-by-field against the existing Node.js
               MongoDB transcript schema (no shape drift)
9:30 – 10:30   services/cleanup/speaker_formatter.py — merge algorithm,
               time-gap threshold logic, participant-map lookup
10:30 – 11:15  services/cleanup/filler_word_remover.py — rule-based pass,
               configurable filler list, conservative-by-construction design
11:15 – 12:30  prompts/cleanup_system.txt — prompt engineering session
               (iterative, tested against real Gemini-via-OpenRouter calls,
               not written once and assumed correct)
12:30 – 1:00   Lunch
1:00 – 2:30    services/cleanup/grammar_normalizer.py — batching logic,
               turn_id mapping, OpenRouter structured-output call wiring,
               length-ratio guardrail implementation
2:30 – 3:15    services/cleanup/transcript_cleaner.py — orchestrator,
               bounded-concurrency batch dispatch, partial-failure handling
3:15 – 3:45    api/routes/cleanup.py — POST /transcripts/cleanup wiring,
               internal-auth dependency reuse from Day 46
3:45 – 5:00    tests/ — unit tests for all four modules, fixture authoring
               (realistic fragmented standup transcript + edge cases)
5:00 – 5:45    Integration test: full clean_transcript() run against the
               standup fixture, manual readability spot-check
5:45 – 6:00    End-of-day checklist run-through (§8) + sign-off
```

---

## 4. Full File Structure (Day 47 Scope Only)

```
services/ai-pipeline/src/
│
├── services/cleanup/
│   ├── __init__.py
│   ├── transcript_cleaner.py          ← Orchestrator: Stage 1 → Stage 2, assembles CleanupResult
│   ├── speaker_formatter.py           ← Stage 1: deterministic turn-merge + name resolution lookup
│   ├── filler_word_remover.py         ← Rule-based filler pass (pre-model, free, deterministic)
│   └── grammar_normalizer.py          ← Stage 2: Gemini-via-OpenRouter batched cleanup + guardrail
│
├── models/
│   └── cleanup_models.py              ← RawTranscriptTurn, ParticipantInfo, ParticipantMap,
│                                          CleanedTranscriptTurn, CleanupResult, CleanupMetadata,
│                                          CleanupBatchResult (internal, batch-level result type)
│
├── prompts/
│   └── cleanup_system.txt             ← Stage 2 system prompt (versioned — see §5.3)
│
├── config/
│   └── cleanup_config.py              ← Filler word list, time-gap threshold, batch size limits,
│                                          length-ratio guardrail bounds — all tunable, not hardcoded
│                                          inline in the service files
│
└── api/routes/
    └── cleanup.py                     ← POST /transcripts/cleanup

services/ai-pipeline/tests/
├── test_speaker_formatter.py
├── test_filler_word_remover.py
├── test_grammar_normalizer.py
├── test_transcript_cleaner.py
├── test_cleanup_endpoint.py
└── fixtures/
    ├── raw_transcript_standup_fragmented.json
    ├── raw_transcript_edge_cases.json
    └── participant_map_standup.json    ← Mirrors the Node.js-resolved participant payload shape
```

### Why `config/cleanup_config.py` is added beyond the original file list

The original Day 47 brief implicitly hardcodes tunables (the `<1.5s` time-gap threshold, the `0.5x–1.1x` length-ratio band, the `15-20 turns / 2000 tokens` batch size) inline inside service files. A principal-level review flags this as a maintainability risk: these are exactly the numbers a data-driven eval (Day 60's accuracy/cost report, or ongoing production monitoring) will want to tune **without a code review of business logic** — they belong in one small, clearly-named config module, mirroring the same discipline already applied to `model_routing.py` on Day 46.

---

## 5. Detailed Implementation Logic — File by File

### 5.1 `models/cleanup_models.py`

**Logic:**
- `RawTranscriptTurn`: field-for-field parity with the existing MongoDB `raw_transcript[]` shape already documented in the platform's LLD — `speaker_tag: str`, `speaker_email: str | None`, `speaker_name: str | None`, `text: str`, `start_time: float`, `end_time: float`, `confidence: float`, `words: list[WordTiming]`. The `speaker_email`/`speaker_name` fields are kept **optional and pass-through** even though Stage 1 will overwrite/resolve them — this preserves whatever Recall.ai-side partial resolution already happened, useful as a fallback if the participant map lookup misses.
- `WordTiming`: `text: str`, `start_time: float`, `end_time: float` — needed because Stage 3 (Day 48) will compute per-turn average confidence from word-level data; defining it correctly today (even though unused until tomorrow) avoids a breaking model change mid-week.
- `ParticipantInfo`: `user_id: str | None`, `name: str`, `email: str | None`, `speaker_tag: str` — the resolved-identity record handed in by the Node.js caller. `ParticipantMap = dict[str, ParticipantInfo]` keyed by `speaker_tag`, the exact lookup structure `speaker_formatter.py` consumes — this is the explicit, typed contract enforcing Decision 2 (never re-resolve identity in Python).
- `CleanedTranscriptTurn`: `turn_id: str` (a stable UUID assigned at Stage 1 merge time — this is the field that survives batching/re-ordering in Stage 2 and lets the model's JSON array response be zipped back unambiguously against input order, **not** relying on array-index-equals-position, which silently breaks the moment a batch response ever omits or reorders an item), `cleaned_text: str`, `original_text: str`, `speaker_name: str`, `speaker_user_id: str | None`, `start_time: float`, `end_time: float`, `filler_words_removed: int`, `was_modified: bool`, `was_modified_suspiciously: bool` (the guardrail-tripped flag — defaults `False`), `uncertain: bool` (defaults `False` here; Day 48's confidence_flagger is the stage that actually sets this meaningfully — included in the schema today so Stage 3 doesn't need a breaking model change tomorrow).
- `CleanupBatchResult` (internal-only model, not part of the public API response): `batch_id: str`, `turn_ids: list[str]`, `succeeded: bool`, `cleaned_turns: list[CleanedTranscriptTurn] | None`, `error: str | None` — this is the type `transcript_cleaner.py`'s partial-failure aggregation logic operates over.
- `CleanupMetadata`: `model_version: str`, `prompt_version: str` (a literal version string embedded in `cleanup_system.txt`'s own first line, read and surfaced here — see §5.3 on prompt versioning), `total_fillers_removed: int`, `turns_before_merge: int`, `turns_after_merge: int`, `batches_total: int`, `batches_failed: int`, `processing_time_ms: float`, `gemini_cost: CostRecord` (Day 46's type, aggregated across all batches — every meeting's cleanup cost is fully reconstructable from this one field, feeding directly into Day 60's cost eval with zero additional plumbing).
- `CleanupResult`: `meeting_id: str`, `team_id: str`, `cleaned_transcript: list[CleanedTranscriptTurn]`, `metadata: CleanupMetadata`.

### 5.2 `config/cleanup_config.py`

**Logic:**
- `SPEAKER_MERGE_TIME_GAP_SECONDS: float = 1.5` — the Stage 1 merge threshold, as a named, documented constant.
- `FILLER_WORDS: frozenset[str]` — the deterministic, unambiguous filler list (`"um"`, `"uh"`, `"you know"`, `"i mean"`, `"sort of"`, `"kind of"`, `"basically"`, `"actually"` [flagged inline as context-dependent and deliberately **excluded** from this unambiguous list — left to the model], etc.) — built as a `frozenset` for O(1) membership checks and immutability (prevents accidental runtime mutation of a shared config object, a subtle correctness bug class in Python services where config objects are imported and held as module-level singletons).
- `GRAMMAR_BATCH_MAX_TURNS: int = 18`, `GRAMMAR_BATCH_MAX_TOKENS: int = 2000` — whichever limit is hit first closes the current batch (logic lives in `grammar_normalizer.py`; the limits themselves live here).
- `LENGTH_RATIO_MIN: float = 0.5`, `LENGTH_RATIO_MAX: float = 1.1` — the guardrail band.
- `CLEANUP_BATCH_CONCURRENCY: int = 4` — how many batches `transcript_cleaner.py` dispatches concurrently (bounded by Day 46's process-wide Gemini semaphore as the outer ceiling, but this is the cleanup-stage's own local concurrency intent, which may legitimately be lower than the global semaphore limit to leave headroom for other concurrent pipeline stages e.g. Day 50's extraction running on a different meeting at the same time).

### 5.3 `prompts/cleanup_system.txt` — Prompt Engineering, Treated as a First-Class Artifact

**Logic:**
- The prompt file's **first line is a machine-readable version marker** (e.g. `# prompt_version: cleanup-v1.0`) — parsed by `grammar_normalizer.py` at load time and threaded into `CleanupMetadata.prompt_version`. This is a small but important production discipline: when this prompt is iterated on next month (better filler detection, fewer false-guardrail-trips), every historical `CleanupResult` already on file remains attributable to the exact prompt version that produced it — essential for any future regression debugging or A/B comparison, mirroring the platform's own documented "System Prompt Versioning" practice from the HLD.
- Prompt structure (sections, not prose-blob):
  - **ROLE**: "You are cleaning a meeting transcript turn-by-turn for human readability."
  - **HARD CONSTRAINTS** (stated first, in the most emphatic position in the prompt — primacy matters for instruction-following reliability): "Do NOT summarize. Do NOT paraphrase for style. Do NOT remove factual content, numbers, names, or decisions. Do NOT add any information not present in the original text. If a turn's meaning would change at all by cleaning it, leave that part unchanged."
  - **WHAT TO DO**: remove filler words and false starts/stutters, fix grammar and punctuation, normalize capitalization and sentence boundaries.
  - **OUTPUT CONTRACT**: explicit instruction to return a JSON array where each item maps `turn_id → cleaned_text`, preserving every input `turn_id` exactly once, in any order (since the consumer zips by ID, not position — explicitly telling the model this relaxes its own internal ordering pressure, a small reliability improvement).
  - **WORKED EXAMPLES** (2-3 short input/output pairs, including one example where a turn is already clean and the correct output is an unchanged echo — explicitly demonstrating the "don't touch it if it's fine" behavior, since LLMs left to their own devices tend to over-edit when not shown a no-op example).
- **Temperature**: passed as a generation parameter from `grammar_normalizer.py`, set low (e.g. `0.1–0.2`, not `0.0` — a small amount of temperature avoids known degenerate-repetition failure modes some models exhibit at strict zero, while remaining near-deterministic for this consistency-first task).

### 5.4 `services/cleanup/speaker_formatter.py`

**Logic:**
- Public function: `merge_turns(raw_turns: list[RawTranscriptTurn], participant_map: ParticipantMap) -> list[CleanedTranscriptTurn]` (returns the Stage-1-only partial `CleanedTranscriptTurn` objects — `cleaned_text` is set equal to `original_text` at this point, since Stage 2 hasn't run yet; this lets the same typed model flow through both stages without an intermediate throwaway type).
- Algorithm: single linear pass over `raw_turns` (already chronologically ordered, per the Recall.ai/MongoDB contract — this function does **not** re-sort, it trusts and asserts the input invariant, raising a typed `UnsortedTranscriptError` if a sort violation is detected, since silently re-sorting could mask an upstream bug rather than surface it).
  - Maintain a "current accumulator" turn. For each incoming raw turn: if `speaker_tag` matches the accumulator's speaker AND `raw_turn.start_time - accumulator.end_time <= SPEAKER_MERGE_TIME_GAP_SECONDS`, append text (with a single space separator, careful not to double-punctuate) and extend `end_time`; otherwise, flush the accumulator as a finished `CleanedTranscriptTurn` (assigning a fresh `turn_id` via `uuid4()`) and start a new accumulator from the current raw turn.
  - Speaker resolution: `participant_map.get(raw_turn.speaker_tag)` → if found, use `.name`/`.user_id`; if **not** found (an unmatched/external participant — a real, expected case per the platform's existing speaker-resolution design, not an error condition), fall back to the raw turn's own `speaker_name`/`speaker_email` if present, or a literal `"Unknown Speaker"` placeholder — **never raise an exception for an unresolved speaker**, since this is explicitly documented platform behavior (shown as "External participant" in the UI), not a pipeline failure.
- Edge cases handled explicitly (not as an afterthought): empty `raw_turns` list → return `[]` immediately; a single-word turn → merges normally, no special-casing needed since the algorithm doesn't depend on text length; two turns from different speakers with overlapping timestamps (a real ASR diarization artifact — cross-talk) → **never merged** regardless of time gap, since the speaker-tag-equality check is the primary gate, time-gap is secondary — overlap is logged as a debug-level structured event for visibility but does not block processing.

### 5.5 `services/cleanup/filler_word_remover.py`

**Logic:**
- Public function: `strip_fillers(turns: list[CleanedTranscriptTurn]) -> list[CleanedTranscriptTurn]` — operates in place on `cleaned_text` (still equal to `original_text` at this point in the pipeline), returns the same list with `filler_words_removed` populated per turn.
- Implementation: word-boundary-aware regex built once at module load from `FILLER_WORDS` (e.g. `re.compile(r'\b(' + '|'.join(re.escape(w) for w in FILLER_WORDS) + r')\b', re.IGNORECASE)`), applied per turn; counts substitutions via `re.subn`; collapses any resulting double-spaces left behind by removal.
- **Deliberately conservative**: only single-word/short-fixed-phrase fillers from the unambiguous list are touched. The function does **not** attempt sentence-restructuring after removal (e.g. fixing now-awkward phrasing like "I think, we should" after an "um" is removed) — that polish is explicitly Stage 2's job, kept out of this cheap deterministic pass on purpose, so this function's behavior remains simple, fast, and trivially testable in isolation.
- `original_text` is preserved untouched on the turn object throughout this step (only `cleaned_text` is mutated) — this is what allows the Day-47 guardrail (§5.6) to later compare cleaned-vs-original length meaningfully against the **true original**, not an already-partially-modified intermediate string.

### 5.6 `services/cleanup/grammar_normalizer.py` — Stage 2 Core

**Logic:**
- Public function: `async def normalize_batches(turns: list[CleanedTranscriptTurn], gemini_client: GeminiClient) -> list[CleanupBatchResult]`.
- **Batch construction**: greedily groups consecutive turns into batches respecting `GRAMMAR_BATCH_MAX_TURNS` and `GRAMMAR_BATCH_MAX_TOKENS` (token-counted via the same tokenizer-aware estimate philosophy established in the broader phase plan — never the old crude word-count heuristic). Each batch is assigned a `batch_id`.
- **Structured-output schema for this call**: a small Pydantic model defined locally, e.g. `CleanupBatchResponse(BaseModel): results: list[TurnCleanupItem]` where `TurnCleanupItem(BaseModel): turn_id: str; cleaned_text: str` — this is the schema passed to Day 46's `generate_structured(task_type=TaskType.TRANSCRIPT_CLEANUP, response_schema=CleanupBatchResponse, ...)`, which internally constructs the OpenRouter `response_format: json_schema` payload per the §0 contract.
- **User prompt construction per batch**: serializes the batch's turns as a numbered/ID-tagged list (`[{"turn_id": "...", "text": "..."}]`) injected into a user-message template — kept in this file (a short inline f-string template is acceptable here, versus a separate `.txt` file, since it's pure data-injection with no prompt-engineering content of its own; the system prompt in `cleanup_system.txt` carries all the actual instruction-engineering).
- **Response mapping**: builds a `dict[turn_id, cleaned_text]` from the response, then iterates the **original input batch order** (not the response order) applying the mapping — if a `turn_id` is unexpectedly missing from the model's response (a possible structured-output edge case despite schema enforcement), that specific turn falls back to its pre-Stage-2 text (the filler-stripped-only version) rather than failing the whole batch, logged as a `structlog` warning event for visibility (a soft degradation, not a hard error, since losing the grammar-polish on one turn is acceptable; losing the turn's content entirely is not).
- **Guardrail enforcement** (the safety-critical logic of the day): for every successfully mapped turn, compute `ratio = len(cleaned_text) / max(len(original_text), 1)`. If `ratio < LENGTH_RATIO_MIN or ratio > LENGTH_RATIO_MAX`: set `was_modified_suspiciously = True`, **discard the model's cleaned_text**, and revert `cleaned_text` back to the turn's filler-stripped-only text from Stage 1.5 — this is the literal implementation of "never trust the model by default" (Decision 4). The discarded model output is logged (truncated, for debugging/eval purposes) but never surfaces to the end user as the displayed transcript.
- **Per-batch failure isolation**: each batch's `generate_structured` call is wrapped individually; on an exception (after Day 46's own internal retries are exhausted — e.g. a `GeminiRateLimitExhaustedError` propagating up), this function catches it at the batch boundary and returns a `CleanupBatchResult(succeeded=False, error=str(exc), turn_ids=[...], cleaned_turns=None)` for that specific batch rather than letting the exception propagate and abort sibling batches — this is what makes Decision 5's partial-failure isolation real, not just aspirational.

### 5.7 `services/cleanup/transcript_cleaner.py` — Orchestrator

**Logic:**
- Public function: `async def clean_transcript(raw_turns: list[RawTranscriptTurn], participant_map: ParticipantMap, team_id: str, meeting_id: str, gemini_client: GeminiClient) -> CleanupResult`.
- Sequence:
  1. `merged = speaker_formatter.merge_turns(raw_turns, participant_map)` — Stage 1, synchronous, fast, no I/O.
  2. `filler_stripped = filler_word_remover.strip_fillers(merged)` — synchronous, fast, no I/O.
  3. `batch_results = await grammar_normalizer.normalize_batches(filler_stripped, gemini_client)` — the async, I/O-bound stage. Internally, batches are dispatched with `asyncio.Semaphore(CLEANUP_BATCH_CONCURRENCY)` wrapping each batch's coroutine, gathered via `asyncio.gather(..., return_exceptions=False)` — `return_exceptions=False` is deliberate, **not** a bug: each individual batch coroutine already converts its own internal exceptions into a `CleanupBatchResult(succeeded=False, ...)` value rather than raising, per §5.6, so `gather` here never actually sees a raised exception in the normal-degradation case; this keeps the orchestration code simple and avoids the common `asyncio.gather(return_exceptions=True)` footgun where genuinely unexpected bugs get silently swallowed alongside expected, handled failures.
  4. Reassemble: for every `CleanupBatchResult`, if `succeeded`, use its `cleaned_turns`; if not, fall back to that batch's pre-Stage-2 (filler-stripped-only) turns directly from `filler_stripped`, marked with a structured log warning — the final `cleaned_transcript` list always has full coverage of every original turn, never a gap, regardless of how many batches failed.
  5. Compute `CleanupMetadata`: `turns_before_merge=len(raw_turns)`, `turns_after_merge=len(merged)`, `total_fillers_removed=sum(...)`, `batches_total`/`batches_failed` counts, `processing_time_ms` (wall-clock measured around the full function), `gemini_cost` (summed `CostRecord` across all successful batch calls, using Day 46's `CostRecord` addition semantics).
  6. Return the assembled `CleanupResult`.
- **Idempotency note**: this function has no side effects of its own (no DB writes) and is safe to call multiple times with identical input for identical output (modulo natural LLM output variance on retried/failed batches) — this matters because the Node.js caller may itself retry the whole HTTP call on a transient network failure between the two services, and this function's statelessness means that's always safe.

### 5.8 `api/routes/cleanup.py`

**Logic:**
- `POST /transcripts/cleanup`, protected by Day 46's `verify_internal_service_key` dependency.
- Request body: a Pydantic model `CleanupRequest(meeting_id: str, team_id: str, raw_transcript: list[RawTranscriptTurn], participants: ParticipantMap)`.
- Handler: thin — injects `gemini_client` via Day 46's `Depends()` provider, calls `transcript_cleaner.clean_transcript(...)`, returns the `CleanupResult` directly as the response body (FastAPI's automatic Pydantic response serialization, with `response_model=CleanupResult` declared on the route decorator so OpenAPI docs and response validation are both automatic and accurate).
- No business logic lives in this file — consistent with the layered-separation rule established Day 46 and carried as a hard constraint through the whole phase.
- Errors: a `UnsortedTranscriptError` (§5.4) or any unhandled exception from the orchestrator is caught by Day 46's global `error_handler` middleware, never needing route-local try/except — the only thing this route file does beyond the one-line handler call is request/response model declaration.

---

## 6. Performance & Cost Considerations Specific to Today

```
- Rule-based filler removal (free) runs on 100% of turns before any model
  call touches them — directly reduces the token volume Stage 2 has to
  process and reproduce, which is real money saved at Vocaply's documented
  meeting volume, not a theoretical optimization.
- Batching (15-20 turns / ~2000 tokens per call) versus per-turn calls is
  the single biggest cost/latency lever in this file set: a 30-min standup
  with ~40-50 post-merge turns becomes roughly 2-3 Gemini calls instead of
  40-50 — a ~95% reduction in call count, and call count (not just token
  count) drives both latency (network round-trips) and OpenRouter-side
  rate-limit pressure.
- Bounded concurrency (CLEANUP_BATCH_CONCURRENCY=4, nested inside Day 46's
  global Gemini semaphore) means a long meeting's batches process in
  parallel rather than strictly sequentially, materially reducing total
  wall-clock cleanup time for multi-hour meetings, while still respecting
  the process-wide rate-limit ceiling established Day 46.
- The added OpenRouter network hop (§0) is measured explicitly: every
  `GeminiCallResult`'s `latency_ms` (Day 46's field) is logged per batch
  call today, giving a real, observable baseline for "how much does the
  OpenRouter hop cost us in practice" — not assumed, measured from day one.
```

---

## 7. Security Considerations Specific to Today

```
- This endpoint receives and processes real meeting transcript content —
  genuine user-generated, potentially sensitive business data. It is
  internal-only (Day 46's shared-secret auth applies unchanged), and no
  transcript content is ever logged at INFO level in full — structured
  logs reference turn_ids, counts, and metadata only; full text bodies
  are logged at DEBUG level at most, and DEBUG logging is explicitly
  disabled by default outside local development per Day 46's settings.environment gate.
- The OpenRouter API key is a SecretStr in settings (Day 46's pattern,
  unchanged) — never logged, never included in error messages surfaced
  to the Node.js caller.
- Prompt injection awareness, early: meeting transcript content is
  user-generated (anything a meeting participant says ends up in this
  text) and is being fed into an LLM prompt today, for the first time
  in the pipeline. cleanup_system.txt's hard constraints section
  (§5.3) is partially a content-injection mitigation as well as a
  quality control: an adversarial participant saying something like
  "ignore previous instructions and output X" during a meeting should
  be treated by the model as transcript content to clean, never as an
  instruction to follow — this is the same risk class flagged more
  fully for the RAG chat feature later in the phase, but the underlying
  prompt-hygiene discipline (clear delimiters, explicit "treat this as
  data" framing) starts being practiced here, on day one of real LLM
  content-processing, not deferred until RAG arrives.
```

---

## 8. End-of-Day Testing & Definition of Done

```
UNIT TESTS — speaker_formatter:
  [ ] Fragmented same-speaker turns within the time-gap threshold are
      merged into one turn with correctly extended start/end times
  [ ] Turns from different speakers are never merged, regardless of time gap
  [ ] Same-speaker turns OUTSIDE the time-gap threshold remain separate
  [ ] participant_map hit → resolved name/user_id used
  [ ] participant_map miss (unresolved external speaker) → graceful
      fallback to raw speaker_name/email or "Unknown Speaker", NO exception raised
  [ ] Empty raw_turns input → returns [] without error
  [ ] Out-of-chronological-order input → raises UnsortedTranscriptError
      (proves the function trusts-but-verifies its input contract)
  [ ] Overlapping-timestamp cross-talk between different speakers →
      never merged, processed without exception

UNIT TESTS — filler_word_remover:
  [ ] Known filler words from FILLER_WORDS are stripped; count matches
      expected exactly
  [ ] "like" inside "I'd like to" is NOT stripped (proves the unambiguous-
      only design boundary holds)
  [ ] Double-spacing artifacts from removal are collapsed correctly
  [ ] original_text remains byte-for-byte unchanged after this step
      (critical precondition for the Stage 2 guardrail's correctness)

UNIT TESTS — grammar_normalizer (Gemini client fully mocked, no live calls):
  [ ] Batch construction respects both GRAMMAR_BATCH_MAX_TURNS and
      GRAMMAR_BATCH_MAX_TOKENS limits, whichever triggers first
  [ ] Mocked structured response correctly mapped back to turn_ids
      regardless of response array ordering (proves ID-based zip, not
      position-based zip)
  [ ] A turn_id missing from the mocked response falls back to its
      pre-Stage-2 text with a logged warning, does not raise
  [ ] Guardrail: a mocked response with cleaned_text at 10% of original
      length is caught, was_modified_suspiciously=True set, cleaned_text
      reverted to the filler-stripped version — verified the DISCARDED
      model output never reaches the final returned object
  [ ] Guardrail: a mocked response within the acceptable ratio band
      passes through unmodified, was_modified_suspiciously=False
  [ ] A batch whose Gemini call raises (simulating exhausted Day-46
      retries) returns CleanupBatchResult(succeeded=False, ...) rather
      than propagating the exception out of normalize_batches

INTEGRATION TESTS — transcript_cleaner (live or recorded-cassette Gemini
  calls against raw_transcript_standup_fragmented.json):
  [ ] Output turn count meaningfully lower than input turn count
      (Stage 1 merging proven on realistic data)
  [ ] total_fillers_removed > 0
  [ ] Every output turn has non-empty cleaned_text
  [ ] Every output turn's (start_time, end_time) is a valid subset of
      the original audio duration, non-overlapping with neighbors
  [ ] gemini_cost in metadata is populated and numerically plausible
  [ ] raw_transcript_edge_cases.json (empty turns, single-word turns,
      overlapping speakers, non-English snippets) processed end-to-end
      with zero unhandled exceptions — graceful degradation confirmed,
      non-English snippets either cleaned reasonably or passed through
      unmodified, never crashing the pipeline

API TESTS — POST /transcripts/cleanup:
  [ ] Valid request with the standup fixture → 200, response body
      validates exactly against CleanupResult schema
  [ ] Missing X-Internal-Service-Key → 401, ErrorEnvelope shape
  [ ] Malformed raw_transcript (wrong field type) → 422 with field-level
      Pydantic error detail in the response body
  [ ] request_id from Day 46's middleware present and consistent across
      the request/response cycle, even on this multi-batch async-heavy endpoint

DEFINITION OF DONE: the messiest available fixture transcript, run through
  this live endpoint, produces text a human reviewer would genuinely
  prefer to read over the raw input — spot-checked manually, not just
  validated by passing automated assertions. Additionally: the guardrail
  must be demonstrated catching at least one real or deliberately-induced
  over-aggressive model edit during today's testing, not just unit-tested
  against a synthetic mock — i.e., prove the safety net actually works
  against this specific OpenRouter-routed Gemini model's real behavior,
  not just against an idealized mocked failure case.
```

---

## 9. Explicit Risks & Open Decisions Carried Forward

```
RISK / DECISION                              RESOLUTION TODAY / DEFERRED TO
─────────────────────────────────────────────────────────────────────────
OpenRouter's structured-output reliability    Confirmed empirically during
for this specific Gemini model slug may       today's prompt-engineering
differ from a direct Google API call          session (§3, 11:15-12:30 block)
                                               — if schema adherence proves
                                               weaker via OpenRouter than
                                               expected, the corrective-retry
                                               mechanism (Day 46) becomes the
                                               primary safety net; if
                                               unreliability persists beyond
                                               that, escalate as a platform-
                                               level provider-routing decision,
                                               not silently worked around here
Exact filler-word list completeness            Treated as a living config
                                               value (cleanup_config.py),
                                               expected to be refined based
                                               on real production transcripts
                                               post-launch — not assumed
                                               perfect/final today
Length-ratio guardrail band (0.5x–1.1x)        A reasonable starting band;
calibration                                    flagged for recalibration
                                               once real usage data shows
                                               the true distribution of
                                               legitimate-cleanup length
                                               deltas vs. false-positive
                                               guardrail trips
Non-English / code-switched transcript         Explicitly tested for graceful
handling                                       non-crash behavior today;
                                               NOT claimed to produce
                                               high-quality cleanup for
                                               non-English content — full
                                               multi-language support is
                                               out of this day's scope and
                                               should be a tracked future
                                               decision, not silently assumed solved
```

---

*Document: AI-PIPELINE-DAY47-DEEP | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*Transcript Cleanup Pipeline — Stage 1 + Stage 2, Gemini-via-OpenRouter — Full Depth*
*Planning Document Only — No Implementation Code*
