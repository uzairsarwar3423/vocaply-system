# Vocaply — AI Pipeline: Day 48 Deep Build Plan
## Transcript Cleanup Pipeline — Stage 3 (Confidence Flagging + Timestamp Integrity) + Shared Chunking Module
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Stack: Python 3.12 · FastAPI · Pydantic v2 · OpenRouter (OpenAI-compatible) → Gemini 2.5 Flash/Flash-Lite · tiktoken (approximation layer)
> Document: AI-PIPELINE-DAY48-DEEP | Version 1.0 | Planning Only — No Code

---

## 0. Provider-Routing Carry-Over That Changes Today's Plan

Day 46/47 established that all model calls route through **OpenRouter**, not the direct `google-genai` SDK. That decision has one direct, material consequence for today's work that the original Day 48 brief did not account for, and it must be resolved explicitly before the chunker is built:

```
THE PROBLEM:
  The original plan for chunker.py says: "uses Google's count_tokens API
  or a local tokenizer approximation consistent with Gemini's tokenization."
  Calling through OpenRouter means we do NOT have a direct authenticated
  channel to Google's native count_tokens endpoint — OpenRouter is an
  OpenAI-compatible proxy; it does not expose Google's proprietary
  tokenizer-counting endpoint as a pass-through API.

THE DECISION MADE TODAY:
  Token counting for chunk-sizing purposes is implemented as a LOCAL
  APPROXIMATION, not a remote API call — and this is the principal-level
  correct choice anyway, independent of the OpenRouter constraint:
  - A remote count_tokens call on every chunking decision would add a
    network round-trip to a function that needs to run synchronously,
    cheaply, and frequently (once per candidate chunk boundary, potentially
    dozens of times per long meeting) — that is a latency and cost anti-
    pattern for what should be a fast, local, deterministic operation.
  - The approximation uses `tiktoken` (OpenAI's open-source BPE tokenizer
    library, already a dependency of the `openai` SDK used for the
    OpenRouter integration) with the `cl100k_base` or `o200k_base`
    encoding as a stand-in for Gemini's actual tokenizer. This is NOT
    byte-identical to Gemini's real token count, but BPE tokenizers across
    modern model families produce counts within a tight, well-understood
    margin of each other for English prose — close enough for a SIZING
    decision (where the goal is "stay safely under the context window and
    batch budget," not "compute an exact billing figure").
  - A SAFETY MARGIN is applied on top of the raw tiktoken estimate (e.g.
    multiply by 1.10–1.15) specifically to compensate for the known
    tokenizer-family discrepancy, biasing toward UNDER-filling a chunk's
    token budget rather than risking a chunk that's actually larger than
    intended once it reaches Gemini's real tokenizer.
  - The REAL, authoritative token count and REAL cost figure still come
    from OpenRouter's response `usage` object (per Day 46/47's established
    pattern) — that remains the source of truth for billing/cost-tracking.
    Today's local estimate is used ONLY for the chunk-boundary decision,
    never represented anywhere as an actual billed token count.

WHY THIS MATTERS ENOUGH TO STATE UP FRONT: silently using a wrong
  assumption (calling a Google API that doesn't exist behind OpenRouter)
  would have been a bug discovered painfully at integration time. Stating
  and resolving it explicitly here, before chunker.py is built, is exactly
  the kind of cross-cutting technical-decision review a principal engineer
  is expected to catch before it becomes a runtime surprise.
```

---

## 1. Objective & Why It Matters (Reaffirmed)

Two pieces of work land today, deliberately scoped together because the first is small and closes out existing work, and the second needs to start as soon as cleanup work is winding down so it doesn't get rushed tomorrow.

**Stage 3 (confidence flagging + timestamp integrity)** is the final, non-negotiable integrity gate on the cleanup pipeline. It does not produce new content — it produces **trust metadata** about content already produced across Days 47-47.5, and it enforces a hard correctness invariant (timestamp validity) that, if silently broken, corrupts a user-facing feature (jump-to-moment playback) in a way that is nearly invisible from the frontend until a user actually clicks a broken timestamp in production.

**The shared `chunker.py` module** is today's bigger architectural bet. It is built generically — three distinct strategies, a clean `ChunkableContent` abstraction — specifically so that Day 49's extraction pipeline and Day 56+'s RAG embedding pipeline consume the *same* chunking logic rather than each engineer inventing their own. This is a deliberate, forward-investing decision: it costs slightly more design effort today to support strategies not yet used, in exchange for permanently avoiding chunking-logic divergence later.

---

## 2. Architectural Decisions Made Today

```
DECISION 1 — Confidence flagging and timestamp validation are ONE file,
  not two, despite being conceptually separable
  Both are "final gate" checks run at the same point in the pipeline,
  over the same data, immediately before a CleanupResult is finalized.
  Splitting them into separate files would force the orchestrator to
  call two functions in lockstep for no real separation-of-concerns
  benefit — they share the same lifecycle position and the same input
  shape. One file, two clearly-separated public functions, is the right
  granularity (not one giant function — internal separation is still
  enforced, just not at the file level).

DECISION 2 — Timestamp integrity is a HARD FAILURE (typed exception),
  confidence flagging is a SOFT ANNOTATION (a boolean field)
  These two checks look similar (both are "is this turn trustworthy")
  but they are NOT the same severity class, and conflating them would be
  a mistake. A low-confidence ASR segment is an expected, routine
  real-world condition — every meeting has some mumbled words, crosstalk,
  background noise. It must be surfaced, never hidden, but it is not a
  bug. A broken timestamp range, by contrast, is ALWAYS evidence of a
  defect in this pipeline's own merge/cleanup logic — there is no
  legitimate real-world reason a cleaned turn's end_time should precede
  its start_time. Treating the former as routine data and the latter as
  a stop-the-pipeline bug is the correct, principal-level severity
  triage, and it directly shapes the error-handling code: one path sets
  a field and continues, the other raises and aborts.

DECISION 3 — chunker.py is a standalone service module, not nested under
  services/cleanup/
  Even though it's being built "as cleanup work winds down," it is NOT
  a cleanup-pipeline component — Stage 3's confidence_flagger.py belongs
  under services/cleanup/ because it operates ONLY on cleanup output for
  cleanup purposes. chunker.py is a general-purpose utility consumed by
  multiple unrelated future features (extraction, RAG). Placing it at
  services/chunker.py (sibling to, not child of, the cleanup package)
  correctly communicates its broader scope and prevents an awkward
  future import path like services.cleanup.chunker being reached into
  by services/extraction/ and services/rag/ — a smell that would suggest
  cleanup "owns" chunking when it doesn't.

DECISION 4 — ChunkableContent is an explicit, narrow input abstraction,
  not "just pass in a list of CleanedTranscriptTurn"
  Building the chunker against a generic ChunkableContent protocol/union
  type (rather than hardcoding it to accept transcript turns specifically)
  is what makes the SINGLE_UNIT and FIXED_SIZE_WITH_OVERLAP strategies
  genuinely reusable for non-transcript content later (a commitment's
  text, a digest narrative) without the chunker module needing a
  transcript-shaped parameter even when chunking a plain string. This is
  a deliberate, slightly-more-effort-today abstraction investment,
  justified specifically because two known future consumers (Day 49,
  Day 56+) are already on the roadmap — this is not speculative
  generality for its own sake, it is generality scoped to concrete,
  already-planned future callers.

DECISION 5 — Overlap is expressed in TURNS for the transcript strategy,
  in TOKENS for the fixed-size strategy, and is a SEPARATE concept from
  the chunk's own size budget
  Overlap exists to preserve cross-boundary context, not to pad chunk
  size — the chunker must never silently let overlap content push a
  chunk over its max_tokens budget. This is enforced as an explicit
  accounting rule in the algorithm (overlap content is "free" relative
  to the new chunk's own budget only up to a point — see §5.2's detailed
  logic) rather than left as an ambiguous edge case discovered through
  a production token-overflow incident.
```

---

## 3. Hour-by-Hour Execution Plan (8-Hour Day)

```
9:00 – 9:30    models/cleanup_models.py extension — ConfidenceFlag,
               TimestampValidationResult Pydantic types added
9:30 – 10:30   services/cleanup/confidence_flagger.py — confidence
               threshold logic, cross-stage signal propagation from
               Day 47's guardrail flag
10:30 – 11:30  services/cleanup/confidence_flagger.py (continued) —
               timestamp integrity validation function + TimestampIntegrityError
11:30 – 12:00  Wire Stage 3 into transcript_cleaner.py orchestrator,
               extend the /transcripts/cleanup route's error handling
12:00 – 1:00   Lunch
1:00 – 1:30    Token-counting decision implementation (§0): tiktoken-based
               local estimator function, safety-margin constant, isolated
               in its own small module for reuse by both chunker.py and
               future RAG embedding code
1:30 – 2:00    models/chunk_models.py — TextChunk, ChunkingStrategy enum,
               ChunkMetadata, ChunkableContent abstraction
2:00 – 3:30    services/chunker.py — SPEAKER_TURN_GROUPED strategy
               (the one tomorrow actually needs — built first and most
               rigorously)
3:30 – 4:15    services/chunker.py (continued) — FIXED_SIZE_WITH_OVERLAP
               and SINGLE_UNIT strategies
4:15 – 5:15    tests/ — confidence_flagger unit tests, chunker unit tests
               across all three strategies, token-estimator tests
5:15 – 5:45    Integration test: full 3-stage /transcripts/cleanup run on
               a long fixture + chunker run on its output
5:45 – 6:00    End-of-day checklist run-through (§8) + sign-off
```

---

## 4. Full File Structure (Day 48 Scope Only)

```
services/ai-pipeline/src/
│
├── services/cleanup/
│   └── confidence_flagger.py          ← Stage 3: confidence flagging + timestamp integrity
│
├── services/
│   ├── chunker.py                     ← SHARED chunking module (standalone, not under cleanup/)
│   └── tokenization.py                ← NEW today: local token-count estimator (tiktoken +
│                                          safety margin), used by chunker.py AND reusable later
│                                          by anything needing a cheap pre-call size estimate
│
├── models/
│   ├── cleanup_models.py              ← (extended) ConfidenceFlag, TimestampValidationResult
│   └── chunk_models.py                ← TextChunk, ChunkingStrategy, ChunkMetadata,
│                                          ChunkableContent (Protocol/union type)
│
└── api/routes/
    └── cleanup.py                     ← (extended) full 3-stage pipeline wired end-to-end,
                                           TimestampIntegrityError → 500 mapping

services/ai-pipeline/tests/
├── test_confidence_flagger.py
├── test_chunker.py
├── test_tokenization.py
├── test_cleanup_endpoint.py           ← (extended) full 3-stage integration assertions
└── fixtures/
    ├── raw_transcript_low_confidence_segments.json
    ├── cleaned_transcript_for_chunking.json
    └── known_token_count_strings.json  ← Strings with externally-verified token counts
                                            (e.g. via OpenAI's public tokenizer tool) used to
                                            validate the local estimator's accuracy bound
```

### Why `services/tokenization.py` is added beyond the original file list

The original brief embeds token-counting directly inside `chunker.py`. A principal-level review separates it out for two concrete reasons: (1) per §0, this is now a meaningfully nontrivial piece of logic (encoding choice, safety margin, possibly per-model-tier calibration later) that deserves its own unit-test file and its own single-responsibility module rather than being buried as a private helper inside a 200+ line chunker; (2) **this exact estimator will be needed again outside chunking** — e.g. a future pre-flight check before calling `generate_structured` to warn/reject an oversized prompt before spending a network round-trip on a call that would fail anyway. Putting it in its own module means that future use imports `tokenization.py`, not `chunker.py` (which would be a confusing, scope-violating import for a non-chunking caller).

---

## 5. Detailed Implementation Logic — File by File

### 5.1 `models/cleanup_models.py` (extension)

**Logic:**
- `ConfidenceFlag(BaseModel)`: not just a bare boolean — a small structured record: `uncertain: bool`, `reason: Literal["low_asr_confidence", "guardrail_reverted", "unresolved_speaker", "none"]`, `average_word_confidence: float | None`. Capturing *why* a turn is flagged (not just *that* it is) is what makes this genuinely useful for both the eventual UI treatment (different visual indicator for "we couldn't hear this clearly" vs. "our cleanup model declined to touch this") and for Day 60's eval harness, which will want to distinguish these cases when measuring cleanup quality.
- `CleanedTranscriptTurn` (already defined Day 47) gains its `uncertain: bool` field populated meaningfully today, plus a new `confidence_detail: ConfidenceFlag` field carrying the full structured reasoning — the simple boolean stays for cheap filtering/display logic, the structured detail is available for anything that needs the "why."
- `TimestampValidationResult(BaseModel)`: `valid: bool`, `violations: list[TimestampViolation]` where `TimestampViolation` carries `turn_id`, `violation_type: Literal["overlap","inverted_range","exceeds_meeting_duration"]`, `detail: str` — this structured result type is what the validation function builds internally before deciding whether to raise; even though the *happy path* never surfaces this object externally (a clean validation just lets the pipeline continue), having it as a real typed object (not a bare bool) means the eventual `TimestampIntegrityError` exception can carry this exact structured payload, giving on-call engineers actionable detail in logs rather than a bare "timestamps are broken somewhere" message.

### 5.2 `services/cleanup/confidence_flagger.py`

**Logic, split into its two responsibilities:**

**(a) `flag_confidence(turns: list[CleanedTranscriptTurn], raw_turns_by_id: dict[str, RawTranscriptTurn], threshold: float) -> list[CleanedTranscriptTurn]`**
- For each cleaned turn, looks up its originating raw turn(s) — note the **many-to-one** relationship here: a single merged `CleanedTranscriptTurn` from Day 47's Stage 1 may have been assembled from *multiple* raw ASR fragments, so this function must average word-confidence across **all** contributing raw turns' `words[]`, not just one — this is a detail easy to get subtly wrong if the merge provenance (which raw turns fed which cleaned turn) isn't carried forward explicitly. (This is exactly why `speaker_formatter.py` from Day 47 must track and expose which raw turn IDs contributed to each merged turn — flagged here as a dependency-correctness check to verify against yesterday's actual implementation before writing today's code, not assumed to already exist cleanly.)
- Computes `average_word_confidence = mean(all contributing words' confidence scores)`. If below `threshold` (a `cleanup_config.py` constant from Day 47, e.g. `0.6`, reused not reinvented): sets `confidence_detail = ConfidenceFlag(uncertain=True, reason="low_asr_confidence", average_word_confidence=...)`.
- **Cross-stage signal propagation** (the second flagging condition): if the turn's `was_modified_suspiciously` flag is already `True` from Day 47's grammar-normalizer guardrail, this is *also* sufficient grounds to mark `uncertain=True`, with `reason="guardrail_reverted"` — even if the raw ASR confidence was high. This is a deliberate OR-condition, not an AND: either signal independently is enough to warrant surfacing uncertainty to the user, and the two reasons are mutually informative for debugging (a turn flagged for both reasons simultaneously is a strong signal of a genuinely garbled original utterance, useful for prioritizing future prompt/threshold tuning).
- A third, lower-priority condition: a turn whose speaker could not be resolved against the participant map (Day 47's `speaker_formatter.py` fallback-to-"Unknown Speaker" path) is flagged `reason="unresolved_speaker"` **only if no higher-priority reason already applies** — speaker-resolution uncertainty is real but categorically different from "we're not sure what was said," and the reason field's priority ordering (low_asr_confidence / guardrail_reverted > unresolved_speaker > none) is an explicit, documented design choice, not an arbitrary enum ordering.

**(b) `validate_timestamps(turns: list[CleanedTranscriptTurn], meeting_duration_seconds: float) -> TimestampValidationResult`**
- Single linear pass over the **already-chronologically-ordered** turn list (an invariant this function asserts, not assumes — re-verifying ordering here independently of Day 47's own internal ordering guarantee is deliberate defense-in-depth, since Stage 3 is the LAST checkpoint before this data is considered trustworthy and shipped to the caller).
- For each turn: `start_time <= end_time` (else `inverted_range` violation); for each consecutive pair: `turn[i].end_time <= turn[i+1].start_time` (else `overlap` violation — explicitly allowing exact equality, since a zero-gap boundary between two genuinely consecutive turns is valid, not an error); finally, the last turn's `end_time <= meeting_duration_seconds` (else `exceeds_meeting_duration` violation, using a small configurable epsilon tolerance for floating-point rounding, not a strict `>` comparison that could false-positive on a sub-millisecond rounding artifact).
- Returns a fully-populated `TimestampValidationResult` regardless of outcome (the function itself never raises — it reports). The **caller** (the orchestrator, §5.4) is the layer that decides to convert an invalid result into a raised `TimestampIntegrityError` — this separation (pure validation function vs. the decision to fail loudly) keeps `validate_timestamps` itself trivially unit-testable without needing to assert on exception-raising behavior, and keeps the "this is a hard failure" policy decision visible at the orchestration layer where it belongs.

### 5.3 `services/tokenization.py`

**Logic:**
- Public function: `estimate_token_count(text: str) -> int`.
- Loads a `tiktoken` encoding once at module level (e.g. `tiktoken.get_encoding("o200k_base")` — the specific encoding choice is flagged as "verify against current best-available approximation for Gemini-family tokenization; revisit if a more accurate open-source Gemini-compatible tokenizer becomes available" rather than asserted as definitively correct, an honest acknowledgment of the approximation's inherent limitation).
- Computes `raw_count = len(encoding.encode(text))`, applies the safety margin constant (`TOKEN_ESTIMATE_SAFETY_MARGIN = 1.12`, living in `cleanup_config.py` or a new shared `tokenization_config.py` — co-located with the other tunables from Day 47's config-centralization decision), returns `ceil(raw_count * safety_margin)`.
- A second function, `estimate_token_count_batch(texts: list[str]) -> list[int]`, exists purely as a performance convenience (encoding multiple short strings via repeated single calls has avoidable per-call overhead; batching through the same loaded encoder instance is meaningfully faster for chunker.py's turn-by-turn accumulation loop) — not a new algorithm, just an efficient iteration over the same underlying encoder.
- **Explicitly does not call any network API** — this is a pure, fast, local, synchronous function, safe to call in tight loops without async/await ceremony or rate-limit concern, which is precisely the property §0's architectural decision was optimizing for.

### 5.4 `models/chunk_models.py`

**Logic:**
- `ChunkingStrategy(str, Enum)`: `SPEAKER_TURN_GROUPED`, `FIXED_SIZE_WITH_OVERLAP`, `SINGLE_UNIT`.
- `ChunkableContent`: modeled as a small discriminated union (Pydantic's tagged-union support, or a `Protocol` if a looser structural-typing approach is preferred at implementation time) covering the two concrete shapes the chunker must accept: `TranscriptContent(turns: list[CleanedTranscriptTurn])` and `PlainTextContent(text: str, source_id: str)` — this is the concrete realization of Decision 4: the chunker's public function signature accepts this union, and internally dispatches its algorithm based on both the requested `ChunkingStrategy` AND the actual content shape provided, with an explicit, typed `IncompatibleChunkingStrategyError` raised if an incompatible combination is requested (e.g. `SPEAKER_TURN_GROUPED` requested against `PlainTextContent` — a programmer error that should fail loudly at the call site, not silently coerce or guess).
- `TextChunk(BaseModel)`: `chunk_id: str` (UUID, assigned at chunk-creation time), `content: str` (the assembled, ready-to-embed-or-prompt text), `token_count: int` (from `tokenization.py`'s estimate — explicitly documented in the field's docstring/description as an estimate, not an authoritative billed count, so no future caller mistakes this field for real cost data), `source_turn_ids: list[str] | None` (populated for transcript-strategy chunks, `None` for plain-text/single-unit chunks where there's no turn provenance to track), `start_time: float | None`, `end_time: float | None` (same conditional-population logic), `chunk_index: int` (this chunk's position among its siblings, needed for stable ordering when chunks are processed concurrently and results need reassembly in order — directly anticipates Day 49's multi-chunk extraction merge logic).
- `ChunkMetadata(BaseModel)`: `strategy_used: ChunkingStrategy`, `total_chunks: int`, `total_source_tokens_estimate: int`, `overlap_applied: bool`.

### 5.5 `services/chunker.py` — The Three Strategies

**Logic, per strategy:**

**(a) `SPEAKER_TURN_GROUPED` (built first, most rigorously — this is the one Day 49 actually depends on):**
- Iterates `turns` in order, greedily accumulating turns into the current chunk's content buffer. Before adding the next turn, estimates `current_chunk_tokens + next_turn_tokens` via `tokenization.py` — if this would exceed `max_tokens`, the current chunk is closed (assigned a `chunk_id`, `chunk_index`, `source_turn_ids` list, `start_time`/`end_time` spanning its first-to-last contributing turn) and a new chunk is opened.
- **Never splits a single turn across two chunks** — this is an explicit invariant, not an emergent property: if a single turn's own token count alone exceeds `max_tokens` (a genuinely pathological edge case — an extremely long uninterrupted monologue), the function does **not** silently violate the budget by force-fitting it, nor does it silently truncate the turn's content (which would corrupt extraction/RAG input) — it places that turn alone in its own chunk, flags it via a `ChunkMetadata`-level note (`oversized_single_turn_chunks: list[str]`, a field added specifically to surface this rare case for visibility), and proceeds. This is the correct, honest behavior: respecting "never split mid-turn" sometimes means tolerating one larger-than-budget chunk rather than violating a more important content-integrity invariant.
- **Overlap implementation** (Decision 5's accounting rule made concrete): when opening a new chunk (chunk N+1) after closing chunk N, the function prepends the **last `overlap_turn_count` turns of chunk N** to chunk N+1's initial buffer — and these overlap turns' token cost **does** count against chunk N+1's own `max_tokens` budget (this is the explicit resolution of the "is overlap free or not" ambiguity flagged in Decision 5: overlap is not free, it is accounted for like any other content, which is what actually prevents silent budget overruns). `overlap_turn_count` defaults to a small constant (e.g. 2-3 turns) from `cleanup_config.py`, not hardcoded inline.
- Returns `list[TextChunk]` plus the accompanying `ChunkMetadata`.

**(b) `FIXED_SIZE_WITH_OVERLAP`:**
- Accepts `PlainTextContent`. Splits on sentence or paragraph boundaries where possible (a lightweight sentence-boundary heuristic, e.g. via a regex on `. ! ?` followed by whitespace+capital — explicitly **not** a full NLP sentence segmenter, since this is a fallback strategy for non-transcript content where turn-level structure doesn't exist, and "good enough, never mid-word" is the bar, not perfect linguistic accuracy).
- Same token-budget-with-overlap accounting discipline as the transcript strategy, just operating over sentence units instead of turn units, with `overlap_tokens` (not `overlap_turn_count`) as the configured parameter, matching the unit-difference called out in Decision 5.

**(c) `SINGLE_UNIT`:**
- The simplest strategy: wraps the entire input content as exactly one `TextChunk`, `chunk_index=0`, `total_chunks=1` in metadata — but still runs the content through `tokenization.py` to populate an accurate `token_count` (never skipped, even though "no actual chunking decision" is being made — the token count is still useful downstream, e.g. for the RAG embedder to know if a single commitment's text is, unexpectedly, too large for its embedding model's input limit, which would otherwise fail silently/confusingly at the embedding-call layer instead of being caught here).
- Does **not** silently accept arbitrarily large input under this strategy — if `token_count` exceeds `max_tokens` even though `SINGLE_UNIT` was explicitly requested (a caller mistake — this strategy implies "I know this is small"), it raises a typed `ChunkSizeExceededError` rather than returning an oversized single chunk that would later fail unexpectedly at a model-call layer. This is a deliberate "fail at the point of clearest causality" choice — better to fail here, in the chunker, with full context about *why* (the actual input was larger than the caller believed) than downstream inside a generic Gemini API error.

### 5.6 `services/cleanup/transcript_cleaner.py` (orchestrator, extended)

**Logic (additions on top of Day 47's existing sequence):**
- After Stage 2's `grammar_normalizer.normalize_batches(...)` result is reassembled (Day 47's step 4), today adds:
  5. `flagged = confidence_flagger.flag_confidence(reassembled_turns, raw_turns_by_id, threshold=CONFIDENCE_THRESHOLD)`.
  6. `validation_result = confidence_flagger.validate_timestamps(flagged, meeting_duration_seconds)`.
  7. If `not validation_result.valid`: raise `TimestampIntegrityError(violations=validation_result.violations)` — **this propagates up and out of `clean_transcript()` entirely**, deliberately not caught or downgraded anywhere in the orchestrator (per Decision 2 — this is a hard-failure class, the orchestrator must not soften it).
  8. If valid: proceed to assemble the final `CleanupResult` (as in Day 47's step 5-6), now with every turn carrying a meaningful `confidence_detail`.
- `raw_turns_by_id` (the lookup structure §5.2(a) depends on) is built once, early, by the orchestrator from the original input `raw_turns` list, and threaded through — confirming/establishing today that Day 47's `speaker_formatter.merge_turns` either already returns or can be made to return the raw-turn-ID provenance per merged turn (flagged explicitly in §5.2 above as a dependency to verify, resolved concretely here in the orchestrator's wiring).

### 5.7 `api/routes/cleanup.py` (extended)

**Logic:**
- No new endpoint — the existing `POST /transcripts/cleanup` route now exercises the full 3-stage pipeline transparently (the route handler code itself is unchanged from Day 47, since all new logic lives in the orchestrator and Stage 3 module — this is the payoff of yesterday's clean layering: extending pipeline depth required zero route-layer changes).
- The **error-handling extension** happens at Day 46's global `error_handler` middleware level, not in this route file: a new handler mapping is registered for `TimestampIntegrityError` specifically — mapped to HTTP `500`, with the response `ErrorEnvelope.details` populated from the exception's carried `violations` list (structured, actionable detail in the response for the calling Node.js worker's own logging, even though the Node.js side's immediate action is simply "mark this job failed and alert" per the platform's existing job-failure conventions — the detail is there for debugging, not for the caller to programmatically recover from in this case, since a timestamp-integrity bug is not something a retry can fix).

---

## 6. Performance Considerations Specific to Today

```
- Local token estimation (§5.3) is O(text length) per call with no network
  I/O — this keeps chunk-boundary decisions cheap enough to make per-turn
  inside a tight accumulation loop without meaningfully impacting overall
  cleanup/chunking latency, which would not be true if every boundary
  check required a remote tokenizer call.
- The encoder object in tokenization.py is loaded ONCE at module import
  (tiktoken's encoder construction has nontrivial one-time cost — loading
  it per-call inside a loop would be a real, avoidable performance bug).
- Stage 3's confidence/timestamp checks are both single linear passes over
  the turn list (O(n)) — no nested loops, no re-sorting, deliberately kept
  cheap since this runs on every single cleanup request as a mandatory
  final gate, not an optional/sampled check.
- Chunker's greedy accumulation strategy is also O(n) over input turns/
  sentences — no backtracking or re-chunking attempts, favoring a fast,
  simple, slightly-less-than-perfectly-optimal packing over an expensive
  bin-packing-optimal algorithm, a deliberate engineering trade-off
  appropriate for this use case (chunk boundaries don't need to be
  globally optimal, they need to be fast, correct, and respect the
  never-split-a-turn/never-split-mid-word invariants).
```

---

## 7. Security Considerations Specific to Today

```
- Stage 3 introduces no new external I/O (no new model calls, no new
  network dependency beyond what Days 46-47 already established) — its
  attack surface is purely internal data-integrity logic, which narrows
  today's security review primarily to "can malformed/adversarial input
  data cause this validation logic itself to crash or misbehave."
- The timestamp validation function is explicitly tested (§8) against
  deliberately corrupted/adversarial turn-ordering input — not just
  well-formed test data — treating "what if upstream data is wrong" as
  a real input-validation concern for an internal service boundary, not
  just an external-facing-API concern. An internal service is still a
  trust boundary worth defending, especially one that will eventually
  also be a target for the RAG-content-injection risk class flagged on
  Day 47 — establishing the discipline of "validate even internal inputs
  rigorously" early pays off as the service surface grows.
- chunker.py's content handling involves no new sensitive-data exposure
  risk beyond what cleanup already established (Day 47's no-full-text-
  at-INFO-level logging discipline applies unchanged to any chunk-content
  logging here — chunk content is logged only at DEBUG level, counts and
  metadata at INFO).
```

---

## 8. End-of-Day Testing & Definition of Done

```
UNIT TESTS — confidence_flagger (flag_confidence):
  [ ] A turn whose contributing raw words average below threshold →
      uncertain=True, reason="low_asr_confidence"
  [ ] A turn with high average confidence → uncertain=False, reason="none"
  [ ] Configurable threshold is actually respected (test at two different
      threshold values against the same fixture, confirm different outcomes)
  [ ] A turn flagged was_modified_suspiciously=True by Day 47's guardrail
      is correctly marked uncertain=True with reason="guardrail_reverted",
      even when its raw ASR confidence was high (proves OR-condition, not AND)
  [ ] A turn with BOTH low confidence AND guardrail-reverted → reason
      priority ordering resolves deterministically per the documented order
  [ ] An unresolved-speaker turn with otherwise-high confidence →
      reason="unresolved_speaker" (lowest-priority condition correctly applied)
  [ ] Many-to-one provenance: a single merged turn built from 3 raw
      fragments correctly averages confidence across all 3, not just one

UNIT TESTS — confidence_flagger (validate_timestamps):
  [ ] Valid, non-overlapping, in-order turn list → valid=True, empty violations
  [ ] Overlapping consecutive turns → valid=False, one overlap violation
      with correct turn_id reference
  [ ] Inverted range (start_time > end_time) on one turn → inverted_range violation
  [ ] Final turn's end_time exceeding meeting_duration_seconds →
      exceeds_meeting_duration violation
  [ ] Exact-equality boundary (turn[i].end_time == turn[i+1].start_time)
      → correctly treated as VALID, not a false-positive overlap
  [ ] Floating-point rounding at the meeting-duration boundary (end_time
      exceeds duration by a sub-millisecond epsilon) → correctly tolerated,
      not a false-positive violation
  [ ] Multiple simultaneous violations across different turns → all
      captured in the violations list, not just the first one found

UNIT TESTS — tokenization:
  [ ] estimate_token_count against known_token_count_strings.json fixture
      (externally-verified counts) → estimate falls within the documented
      acceptable margin of the true count, safety margin applied correctly
      in the conservative (over-estimate, never under-estimate) direction
  [ ] Empty string → returns 0, no exception
  [ ] estimate_token_count_batch produces identical results to repeated
      single calls (consistency check), while being measurably faster
      for a large batch (basic performance sanity, not a strict benchmark gate)

UNIT TESTS — chunker (all three strategies):
  [ ] SPEAKER_TURN_GROUPED: never splits a single turn across two chunks
  [ ] SPEAKER_TURN_GROUPED: respects max_tokens budget per chunk
      (accounting for overlap content correctly counted against budget)
  [ ] SPEAKER_TURN_GROUPED: overlap turns from chunk N correctly appear
      at the start of chunk N+1's source_turn_ids
  [ ] SPEAKER_TURN_GROUPED: a pathologically oversized single turn is
      placed alone in its own chunk, flagged in metadata, never truncated
  [ ] FIXED_SIZE_WITH_OVERLAP: chunks respect token budget, sentence
      boundaries respected (no mid-sentence splits in the common case),
      overlap_tokens correctly applied
  [ ] SINGLE_UNIT: always returns exactly one chunk regardless of input
      size within budget; raises ChunkSizeExceededError when input
      genuinely exceeds max_tokens under this strategy
  [ ] IncompatibleChunkingStrategyError raised when SPEAKER_TURN_GROUPED
      is requested against PlainTextContent (or vice versa for a
      turn-requiring strategy against plain text)
  [ ] chunk_index values are sequential and stable across all returned
      chunks for a given chunking call

INTEGRATION TESTS:
  [ ] Full /transcripts/cleanup run (live or recorded-cassette) on a long
      fixture transcript: all 3 stages execute, zero exceptions, every
      output turn has a populated confidence_detail, timestamp validation
      passes silently
  [ ] raw_transcript_low_confidence_segments.json → correctly produces
      uncertain=True turns at the expected positions, verified against
      the fixture's known deliberately-low-confidence segments
  [ ] A deliberately corrupted variant of a valid fixture (test-injected
      overlapping timestamps) run through the FULL pipeline → the
      /transcripts/cleanup endpoint surfaces a 500 with TimestampIntegrityError
      detail, not a silently-returned broken result
  [ ] cleaned_transcript_for_chunking.json run through chunker with
      SPEAKER_TURN_GROUPED at a deliberately small max_tokens (forcing
      multiple chunks) → chunk boundaries align exactly with turn
      boundaries; reconstructing all chunks' content (de-duplicating
      overlap turns) reproduces the original full transcript content exactly

DEFINITION OF DONE: the cleanup pipeline, handed a worst-case fixture
  (long meeting, low-confidence segments, edge-case turn structures),
  produces a fully valid, confidence-annotated result every time on
  legitimate input, and FAILS LOUDLY AND CORRECTLY on deliberately
  corrupted input rather than silently shipping broken data — and the
  chunker is proven correct independently, with at least one test
  demonstrating exact content-reconstruction fidelity after chunking
  with overlap, not just "chunks exist and look roughly right."
```

---

## 9. Explicit Risks & Open Decisions Carried Forward

```
RISK / DECISION                              RESOLUTION TODAY / DEFERRED TO
─────────────────────────────────────────────────────────────────────────
tiktoken-based estimate's true accuracy       Accepted as a documented
margin against Gemini's actual tokenizer      approximation today (§0);
                                               revisit if Day 60's real
                                               cost-eval data shows the
                                               estimate diverging from
                                               actual OpenRouter-reported
                                               token usage by more than
                                               the assumed safety margin
                                               — if so, recalibrate the
                                               margin constant, not the
                                               architecture
Day 47's speaker_formatter.merge_turns must   Flagged explicitly in §5.2
already expose raw-turn-ID provenance per     as a dependency to verify
merged turn for today's many-to-one           against yesterday's actual
confidence averaging to work correctly        shipped implementation
                                               before writing today's code
                                               — if the provenance isn't
                                               already exposed, today's
                                               work includes a small,
                                               explicitly-scoped retrofit
                                               to Day 47's model/function,
                                               not a silent workaround
Sentence-boundary heuristic in                Accepted as "good enough,
FIXED_SIZE_WITH_OVERLAP is regex-based,        never mid-word" today;
not a full NLP sentence segmenter              if RAG content quality at
                                               Day 56+ proves this
                                               insufficient for digest/
                                               summary chunking specifically,
                                               revisit with a proper
                                               sentence-segmentation library
                                               at that time, not preemptively
                                               over-engineered today for a
                                               strategy not yet in active use
```

---

*Document: AI-PIPELINE-DAY48-DEEP | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*Transcript Cleanup Stage 3 + Shared Chunking Module, OpenRouter-Aware Token Estimation — Full Depth*
*Planning Document Only — No Implementation Code*
