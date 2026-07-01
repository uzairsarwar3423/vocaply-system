# Vocaply — AI Pipeline: Day 49 Deep Build Plan
## Extraction Prompts + Schema Contract + Post-Processing Parsers + Golden Dataset Foundation
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Stack: Python 3.12 · FastAPI · Pydantic v2 · OpenRouter → Gemini 2.5 Flash-Lite · tiktoken
> Document: AI-PIPELINE-DAY49-DEEP | Version 1.0 | Planning Only — No Code

---

## 0. The OpenRouter-Specific Extraction Contract (Read Before Anything Else)

Three OpenRouter-specific constraints directly shape how today's structured-output extraction is designed — inherited from Day 46/47's established integration pattern but with extraction-specific implications that must be called out explicitly:

```
CONSTRAINT 1 — Structured output via response_format, not native Gemini
  binding
  All extraction responses use OpenRouter's OpenAI-compatible
  `response_format: {"type": "json_schema", "json_schema": {...}}` path.
  This means the response comes back as a string that OpenRouter guarantees
  is valid JSON matching the schema — but the actual Pydantic model
  instantiation happens application-side, not inside the SDK's response
  deserialization. Implication for today:

    GeminiClient.generate_structured(..., response_schema=ExtractionResponse)
    receives a JSON string → parses it → validates it against ExtractionResponse.

  This is already the established pattern from Day 46's client design.
  Today's job is ensuring ExtractionResponse's schema, when serialized to
  JSON Schema format for the OpenRouter call, is FULLY expressible in
  standard JSON Schema (Draft 7 / OpenAPI 3.1 subset that OpenRouter passes
  through) — Pydantic v2's `model_json_schema()` output is generally
  compliant, but a few Pydantic-v2-specific constructs (discriminated
  unions with certain annotation styles, recursive models) do not map
  cleanly to standard JSON Schema. Today's ExtractionResponse is designed
  to avoid those constructs entirely, keeping the schema as flat and
  standard as possible so OpenRouter's pass-through to Gemini's
  structured-output engine encounters zero friction.

CONSTRAINT 2 — Temperature and generation config pass via OpenRouter's
  OpenAI-compatible completions parameters
  The extraction prompt requires LOW temperature (near-deterministic,
  consistent structured output across retries) but NOT zero (see Day 47's
  reasoning — small positive temp avoids degenerate repetition). This is
  passed as `temperature=0.1` via the OpenAI-compatible `create()` call.
  Model-tier-specific temperature defaults live in `model_routing.py` as
  per-task overridable constants, established on Day 46. Today's
  extraction task DOES override the default — extraction at 0.1 vs. chat
  answers at a higher default temperature — and this override is specified
  in Day 46's `TaskType.EXTRACTION` routing config entry, not hardcoded
  inside today's extractor code.

CONSTRAINT 3 — OpenRouter model string and required headers, unchanged
  All extraction calls use `google/gemini-2.5-flash-lite` (for the bulk
  of extraction work) via the same GeminiClient wrapper, same
  `HTTP-Referer`/`X-Title` headers, same cost-tracking from `usage.cost`
  in OpenRouter's response. Nothing new here — Day 46's infrastructure
  is consumed as-is. Today's code never touches the HTTP transport layer.
```

---

## 1. Objective & Why It Matters (Reaffirmed at Depth)

Today is the prompt-engineering and schema-contract day. The claim made in the platform's HLD — that `extraction_system.txt` is "the most critical file in the entire project" — is not marketing language. It is an architectural statement about where the most consequential failure modes in this system live. Consider what breaks if extraction is wrong:

```
IF EXTRACTION IS WRONG:
  - Wrong commitment owner → the wrong person gets reminded, alerted,
    scored for something they never said
  - False-positive commitment ("we should") → phantom accountability entries
    that erode user trust immediately
  - Missed commitment (low recall) → the product's core value proposition
    ("we catch every promise") fails silently
  - Wrong confidence score → low-quality data surfaces at high prominence,
    high-quality data filtered out
  - Wrong priority on action items → critical work item assigned MEDIUM,
    missed integration into Jira/Linear at the right urgency level
  - Summary too long/wrong style → the first thing every user sees on
    a processed meeting is confusing

None of these failures produce a loud error. They produce subtly wrong data
that erodes trust gradually — the hardest class of production bug to detect
and the most damaging to a product in its early growth phase.
```

Today's work is therefore NOT just "write a prompt and test it a little." It is:
1. A formally defined schema contract (the Pydantic extraction models) that is the source of truth for what the system can extract — not the prompt, not the docs.
2. An engineered prompt designed with adversarial cases, confidence rubrics, and worked examples — tested empirically against golden fixtures before any code that calls it is shipped.
3. Post-processing parsers that implement business rules the schema cannot express declaratively, closing the gap between "model returned something structurally valid" and "we have data the rest of the system can trust."
4. The beginning of an eval dataset that will be the only objective measure of extraction quality through the remaining life of this service.

---

## 2. Architectural Decisions Made Today

```
DECISION 1 — The Pydantic schema IS the contract; the prompt is its
  enforcement mechanism, not the other way around
  The Node.js commitment engine, the frontend, and the billing/analytics
  pipelines all depend on a documented extraction output shape. That shape
  is defined in ExtractionResponse and its children, version-controlled in
  extraction_models.py, and treated as a breaking-change surface (any
  field removal/type change requires a migration plan, same discipline
  as a database schema change). The prompt's job is to get Gemini to
  fill this schema correctly — not to define what the schema should be.
  This inversion of authority (schema → prompt, not prompt → schema) is
  a principal-level discipline that prevents "prompt drift" — the common
  failure mode where prompts evolve casually and the system gradually
  starts returning subtly different shapes that break downstream callers.

DECISION 2 — Normalized text is generated at extraction time, not deferred
  The commitment_parser generates normalized_text (stopword-stripped,
  stemmed, max-5-token key) immediately when a commitment is parsed —
  not as a separate downstream step in the resolver or storage layer.
  WHY: the cleaned commitment text is most accurate here, now, before any
  persistence, before any resolver processing. If normalization is deferred,
  it must run on data that may have already been stored with the original
  text, creating a risk of stale normalized text if the normalization
  algorithm is improved later. Normalizing at parse time keeps one clean,
  fresh normalization per extraction run, and makes the resolver algorithm's
  input always consistent with the latest normalization logic.

DECISION 3 — Two prompt files, not one mega-prompt
  extraction_system.txt is a system message (behavioral + rules +
  constraints + rubrics — NEVER changes per meeting). extraction_user.txt
  is a user-message template (injected with per-meeting data — title, date,
  participants, transcript content — changes every call). This split is
  not just organizational cleanliness; it maps exactly onto how OpenRouter
  structures the messages array in the OpenAI-compatible API call:
  `[{"role": "system", "content": extraction_system.txt},
   {"role": "user",   "content": extraction_user.txt.format(meeting_data)}]`
  Keeping them separate means the system prompt benefits from any caching
  infrastructure OpenRouter or the underlying model supports for repeated
  identical system messages — a real cost/latency optimization at Vocaply's
  meeting volume (the system prompt is identical for every meeting; the
  user prompt is unique every time).

DECISION 4 — Few-shot examples in dedicated .txt files, not inline in
  extraction_system.txt
  commitment_examples.txt and action_item_examples.txt are loaded by the
  extraction service and injected at a specific position in the system
  prompt at call construction time — they are NOT baked into
  extraction_system.txt's static text. WHY: example sets are the thing
  most likely to be tuned iteratively (add a new anti-pattern example,
  replace a weak positive example with a stronger one) without needing
  to re-engineer the surrounding prompt structure. Keeping examples in
  separate files means they can be versioned, A/B tested, and updated
  independently from the core rules — a real productionized prompt-
  engineering workflow, not just file organization for its own sake.
  (The version tag carried in commitment_examples.txt follows the same
  convention established for cleanup_system.txt on Day 47.)

DECISION 5 — Post-processing parsers are NOT for fixing model errors;
  they are for business rules the schema cannot express
  This distinction is crucial for keeping the layers honest. If the model
  systematically makes a certain kind of error, the fix is to improve the
  prompt — NOT to compensate in the parser. Parsers implement invariants
  like "normalized_text is always max 5 tokens" (a business rule, not a
  model-output quality issue), "confidence below 0.3 is excluded entirely"
  (a product policy, not a prompt rule), and "duplicate action items from
  chunk overlap are merged" (an artifact of the chunking architecture,
  not of the model's behavior). If a parser is seen "fixing" something
  the model should have gotten right (e.g. cleaning up owner names because
  the model frequently extracts email addresses instead of display names),
  that is a signal to fix the prompt, not to expand the parser. This
  discipline is enforced through code review on Day 49 and forward.

DECISION 6 — Golden dataset starts TODAY, not at Day 60's eval
  Hand-labeling meeting transcripts is slow, careful work that cannot be
  done well under time pressure. Starting the dataset today (with 3-4
  fixtures) and growing it incrementally across Days 50-59 means Day 60's
  formal eval runs against a genuine, representative sample rather than
  fixtures hastily assembled the day before the eval. The eval harness is
  a first-class product deliverable, not an afterthought.
```

---

## 3. Hour-by-Hour Execution Plan (8-Hour Day)

```
9:00 – 9:45    models/extraction_models.py — full schema contract,
               all Pydantic validators, PriorityLevel enum, verified
               against the Node.js commitment engine's expected shape
9:45 – 10:45   services/extraction/commitment_parser.py — normalized_text
               algorithm (exact parity with LLD), confidence sanity-check
               heuristics, dedup-key construction
10:45 – 11:30  services/extraction/action_item_parser.py — priority
               normalization, owner-name normalization, dedup logic for
               chunk-overlap artifacts
11:30 – 12:00  services/extraction/decision_parser.py +
               services/extraction/blocker_parser.py — lighter-weight,
               pass-through + text normalization
12:00 – 1:00   Lunch
1:00 – 2:30    prompts/extraction_system.txt — iterative prompt
               engineering session with live OpenRouter calls
               (see §5.3 for internal structure and section breakdown)
2:30 – 3:00    prompts/commitment_examples.txt +
               prompts/action_item_examples.txt — few-shot examples,
               including anti-pattern rejection examples
3:00 – 3:30    prompts/extraction_user.txt — per-meeting user message
               template design
3:30 – 4:30    eval/golden_dataset/ — author and hand-label first 3
               fixtures: standup_01, sprint_review_01, ambiguous_cases
4:30 – 5:15    tests/ — unit tests (no live Gemini calls): extraction
               models, commitment_parser, action_item_parser,
               decision/blocker parsers
5:15 – 5:45    Prompt validation tests (LIVE OpenRouter calls against
               golden fixtures) — anti-pattern rejection check,
               precision/recall informal spot-check, dual-extraction case
5:45 – 6:00    End-of-day checklist run-through (§8) + sign-off
```

---

## 4. Full File Structure (Day 49 Scope Only)

```
services/ai-pipeline/src/
│
├── prompts/
│   ├── extraction_system.txt          ← THE master system prompt
│   ├── extraction_user.txt            ← Per-meeting user message template
│   ├── commitment_examples.txt        ← Few-shot commitment examples (positive + anti-pattern)
│   └── action_item_examples.txt       ← Few-shot action item examples
│
├── models/
│   └── extraction_models.py           ← Full schema contract: all Pydantic extraction types
│
├── services/extraction/
│   ├── __init__.py
│   ├── commitment_parser.py           ← normalized_text, confidence sanity-check, dedup key
│   ├── action_item_parser.py          ← priority normalization, owner cleanup, chunk-overlap dedup
│   ├── decision_parser.py             ← lightweight validation + text normalization
│   └── blocker_parser.py              ← affected_user normalization + dedup
│
└── eval/
    ├── __init__.py
    ├── golden_dataset/
    │   ├── standup_01_cleaned.json        ← Cleaned transcript (Day 46-48 pipeline output shape)
    │   ├── standup_01_expected.json       ← Hand-labeled ground truth
    │   ├── sprint_review_01_cleaned.json
    │   ├── sprint_review_01_expected.json
    │   └── ambiguous_cases_cleaned.json   ← ANTI-PATTERN fixture (must extract ZERO commitments)
    └── eval_schema.py                     ← Pydantic models for the golden dataset format
                                               (EvalCase, ExpectedExtraction, EvalMetrics) —
                                               scaffolded today so Day 60's run_extraction_eval.py
                                               can import types without a breaking change

services/ai-pipeline/tests/
├── test_extraction_models.py
├── test_commitment_parser.py
├── test_action_item_parser.py
├── test_decision_parser.py
├── test_blocker_parser.py
└── fixtures/
    ├── raw_commitment_cases.json       ← Commitment strings mapped to expected normalized forms
    └── raw_action_item_cases.json      ← Action item strings mapped to expected priority outputs
```

---

## 5. Detailed Implementation Logic — File by File

### 5.1 `models/extraction_models.py` — The Schema Contract

**Logic:**

**(a) `PriorityLevel(str, Enum)`:**
- Values: `LOW`, `MEDIUM`, `HIGH`, `URGENT`.
- Must use `str` mixin (not bare `Enum`) specifically so Pydantic v2 serializes it as a JSON string (`"HIGH"`), not an integer, when generating the JSON Schema for OpenRouter's `response_format` parameter — a known Pydantic/JSON Schema interop detail that produces silent breakage if overlooked (the model receives an integer-typed priority field and produces integer outputs that fail downstream string comparisons).

**(b) `ExtractedCommitment(BaseModel)`:**
- Fields:
  - `text: str` — the exact spoken words, verbatim from the cleaned transcript. Field-level constraints: `min_length=5` (a 2-word commitment is implausible; catches empty/near-empty model outputs), `max_length=1000` (guards against pathological outputs where the model dumps several sentences into a single commitment field).
  - `owner_name: str` — the display name of the person who made the commitment (the speaker, per the platform's documented rule: owner = speaker, not assignee). `min_length=1` constraint.
  - `due_date_raw: str | None` — the exact temporal expression as spoken ("by Thursday", "end of sprint", "EOD Friday"). `None` if no deadline was mentioned. This field is intentionally raw text, not a parsed date — Day 50/51 builds the date parser that converts this to ISO. This separation is a hard design rule: the extraction model is asked ONLY to identify and capture what was said, never to interpret dates (date parsing is a different competency, requiring different context — the meeting date — that the extraction model call does not reliably have access to when processing a chunk of a long meeting).
  - `confidence: float` — the model's self-assessed confidence this is genuinely a commitment. Pydantic `Field(ge=0.0, le=1.0)`.
- Model-level validators (Pydantic v2 `@model_validator(mode='after')`):
  - `text` must not be only whitespace after stripping.
  - `owner_name` must not be only whitespace after stripping.
  - If `confidence < 0.3`: the item is excluded entirely — this is a **schema-level filter**, not a prompt-level rule. Items below 0.3 never reach post-processing, never reach storage, never reach the Node.js side. This "schema as policy enforcer" pattern means the threshold can be adjusted without touching the prompt.
  - `due_date_raw`, when not None, must not be only whitespace.

**(c) `ExtractedActionItem(BaseModel)`:**
- `text: str` — same constraints as commitment text.
- `assignee_name: str` — the person assigned the task (may be the same as a commitment's owner for self-volunteered items, or a different person for third-party assignments). `min_length=1`.
- `due_date_raw: str | None` — same raw-text convention as commitments.
- `priority: PriorityLevel` — the key differentiator from a free-string field: the model MUST return one of the four defined enum values, enforced by OpenRouter's `json_schema` response_format constraint. No post-processing priority normalization is needed for well-formed model outputs; the parser (§5.4) only handles the edge case where schema enforcement weakens on an unusual model response.
- `confidence: float` — same range constraint; no minimum-threshold exclusion at schema level (action items are retained even at lower confidence, per product design — they're less consequential to mis-extract than commitments since they're not directly tied to a person's accountability score).

**(d) `ExtractedDecision(BaseModel)`:**
- `text: str` — the concluded decision, verbatim.
- `made_by: str | None` — who announced/stated the decision. Optional because decisions are frequently collective ("we decided") with no single identified speaker.
- `confidence: float` — same range constraint.

**(e) `ExtractedBlocker(BaseModel)`:**
- `text: str` — description of the blocking condition.
- `affected_name: str | None` — who is blocked (may be inferred or unstated). Optional.
- `blocking_party: str | None` — who or what is causing the block (a person, a dependency, an external system). Optional.
- `confidence: float` — same range constraint.

**(f) `ExtractionResponse(BaseModel)` — the top-level schema Gemini must fill:**
- `commitments: list[ExtractedCommitment]` — empty list if none, never null.
- `action_items: list[ExtractedActionItem]` — empty list if none.
- `decisions: list[ExtractedDecision]` — empty list if none.
- `blockers: list[ExtractedBlocker]` — empty list if none.
- `summary: str` — 3-5 sentence narrative summary of the meeting's key outcomes. `min_length=20` (guards against an empty or single-word summary), `max_length=1500` (a very long summary defeats the purpose; the prompt will additionally constrain this via instruction, but the schema enforces the ceiling hard).
- **JSON Schema compatibility audit**: after `ExtractionResponse.model_json_schema()` is called, the resulting schema is manually reviewed for any constructs that may not pass through OpenRouter's JSON Schema validation layer — specifically: no `$defs` circular references, no `anyOf` with discriminator fields that require OpenRouter-specific handling, all string fields have explicit `type: "string"` (Pydantic v2 occasionally emits just a `format` without an explicit `type` for some string subtypes). This audit happens during development, not at runtime — it is a one-time verification, documented in a comment block at the top of this file with the date and the reviewer's initials.

### 5.2 `prompts/extraction_system.txt` — Engineering the Prompt

**Architecture of the prompt (not the content — a plan, not a draft):**

The prompt is structured in **eight clearly labelled sections**, separated by visual dividers that the model can reliably parse as distinct instruction blocks. The order is deliberate — placement affects instruction-following reliability in ways that are empirically measurable and documented in prompt-engineering literature:

```
SECTION 1 — ROLE & SCOPE (primacy position — the model reads this first)
  Who the model is, what task it is doing, what it is NOT doing.
  Example framing: "You are a meeting intelligence extractor. You read
  cleaned meeting transcripts and identify specific types of content.
  You are NOT summarizing. You are NOT interpreting intent. You are
  extracting only what was explicitly stated."
  Why this matters at primacy: the model's "frame" — how it understands
  its own role — is established in the first few tokens it reads. A
  well-framed role reduces the model's tendency to "helpfully" expand
  scope beyond what was asked (summarizing a section when asked to
  extract commitments, adding inferred context to a stated action item,
  etc.).

SECTION 2 — WHAT YOU RECEIVE (input contract)
  Explicit description of the input format: a cleaned, speaker-attributed
  transcript, formatted as `[Speaker Name]: [text]` lines. This section
  exists because the model must know that speaker attribution is already
  resolved and reliable — it should use the speaker labels directly, not
  second-guess them based on content. Also establishes that the input has
  already been cleaned (no filler words, no ASR artifacts) so the model
  doesn't spend attention on surface-level noise.

SECTION 3 — EXTRACTION RULES PER ENTITY TYPE
  Sub-sectioned per type (commitments, action items, decisions, blockers),
  each with:
    a) Definition: what qualifies, what doesn't, at the semantic level
    b) Owner rule: who "owns" this entity (speaker vs. assignee distinction)
    c) Confidence guidance: which linguistic signals map to which bands
  The commitment rules are the most detailed here, following the platform's
  documented rubric exactly (first-person requirement, "we should" exclusion,
  confidence band mapping). Action item rules explicitly call out the
  dual-extraction case ("I'll take care of X" appears in both lists).
  Decision rules are simpler (concluded statement vs. discussion). Blocker
  rules are simplest (the language of waiting/blocking).

SECTION 4 — CONFIDENCE SCORING RUBRIC (explicit bands with examples)
  0.9–1.0: "I will finish the login feature by Thursday" — explicit,
           first-person, specific deliverable, clear deadline
  0.7–0.8: "I'll get to that this week" — explicit first-person,
           specific deliverable, vague deadline
  0.5–0.6: "I should be able to get that done" — hedged, probable
           but not definite first-person commitment
  0.3–0.4: "I'll try to look into it" — possible commitment,
           significant uncertainty
  < 0.3:   Do NOT extract — this threshold is explicitly stated in the
           prompt to match the schema-level filter, so the model
           self-calibrates rather than the schema silently discarding
           items the model thought were worth including.
  Every band has at least one verbatim spoken-word example, not just
  a description. The model cannot calibrate against abstract descriptions;
  it calibrates against examples.

SECTION 5 — ANTI-PATTERNS (mandatory section, non-negotiable)
  Listed explicitly with one input-line/expected-output-action pair each.
  The five documented anti-patterns from the HLD plus any additional ones
  discovered during today's iterative prompt testing:
    - "We should look into X" → no owner, NOT a commitment
    - "Can you look into X?" → still a question, NOT yet a commitment
    - "I was supposed to do X but didn't" → past miss, NOT a new commitment
    - "Someone should handle X" → passive voice, no specific owner
    - "Let's make sure X gets done" → collective, no specific owner
  Each anti-pattern gets an explicit REJECT instruction alongside the
  example, not just a classification. The model must be told what to DO
  with these cases (skip/reject) not just what they are.

SECTION 6 — EDGE CASE HANDLING
  Cases the model most commonly mishandles, based on domain knowledge of
  meeting transcripts and LLM extraction failure modes:
    - A speaker commits on behalf of someone else ("Ahmed said he'll do X")
      → this is NOT Ahmed's commitment unless Ahmed is the speaker making
      the statement about himself. Owner = the current speaker if first-
      person, not the person being discussed.
    - Conditional commitments ("If the API is ready, I'll integrate it by
      Friday") → extract with appropriate lower confidence (hedged); include
      the condition in the text field verbatim.
    - Retroactive commitments ("I committed to this last week and I'm still
      working on it") → this is a STATUS UPDATE on an existing commitment,
      NOT a new commitment. The resolver (Day 52-54) handles this; the
      extractor must NOT create a duplicate.
    - Commitments with multiple sub-deliverables ("I'll fix the bug, update
      the tests, and deploy by Friday") → extract as ONE commitment, not
      three. The deliverable is the entire set; splitting would misrepresent
      the scope and complicate the resolver's matching.

SECTION 7 — OUTPUT CONTRACT
  Explicit restatement of the JSON schema the model must produce (even
  though OpenRouter enforces this at the API level via response_format,
  re-stating the output structure in the prompt gives the model explicit
  confirmation of what it should emit, reducing the frequency of the
  model "trying to be helpful" by adding unrequested fields or restructuring
  the output): lists, always, even if empty. summary: a string, always,
  even if meeting content was minimal. All string fields: never null when
  not explicitly Optional in the schema.

SECTION 8 — CRITICAL REMINDERS (recency position — model reads this last)
  3-4 single-sentence reminders of the most important, most-frequently-
  violated constraints. In recency position (last) because the model's most
  recent context before generating a response has measurable influence on
  that response. Typical reminders: "Owner always = the SPEAKER making the
  statement, not the person mentioned." "When uncertain, LOWER confidence
  score — do not omit items that meet the 0.3 threshold, score them low
  and include them." "Anti-pattern cases must produce an EMPTY list, not
  a list with low-confidence items."
```

**Iterative testing process (the 2:30-3:00 block in §3's schedule):**
The prompt is NOT written once and submitted. The iterative process:
1. Draft Section 3-5 first (the most impactful sections).
2. Run against `ambiguous_cases_cleaned.json` (the anti-pattern fixture). Assess: are all documented anti-patterns producing empty commitment lists?
3. For every failure, add a more targeted example to Section 5 OR refine the relevant Section 3 rule — never fix a failure by adding a Section 8 reminder first (reminders are for the most critical constraints, not a patch layer for every failure case).
4. Once all anti-patterns pass, run against `standup_01_cleaned.json`. Compare to `standup_01_expected.json`. Assess precision and recall informally.
5. For every false negative (missed commitment), diagnose: is this a confidence-threshold issue (the model extracted it at 0.28, below the threshold), a recognition issue (the model didn't identify it as a commitment), or an owner-attribution issue? Each diagnosis maps to a different fix location.
6. Repeat until all anti-patterns pass (zero tolerance on anti-patterns) and golden-fixture recall reaches ≥85% on the informal spot-check (the formal ≥87% bar is Day 60).

### 5.3 `prompts/extraction_user.txt` — Per-Meeting Template

**Logic:**
- A template string with clearly-marked injection placeholders. The structure:
  1. **Meeting context block**: `Meeting: {meeting_title}`, `Date: {meeting_date_iso}` (ISO format, as anchor for the date parser's relative-date resolution), `Participants: {participant_list_formatted}` (one per line: "- Name: {name}"). This block is injected first so the model knows the identity context before reading the transcript.
  2. **Transcript block**: labeled clearly (`--- TRANSCRIPT START ---` / `--- TRANSCRIPT END ---`) with the cleaned transcript content. The dividers are explicit character sequences rather than semantic labels specifically so OpenRouter's pass-through of the content to Gemini doesn't interpret them as prompt structure — they are clearly transcript-vs-instruction boundary markers.
  3. **Extraction instruction**: a single closing line — "Extract all commitments, action items, decisions, and blockers from this transcript. Return only the JSON structure defined in your instructions." Short, directive, no repetition of the rules (those live in the system prompt).
- The participant list injection (step 1) deserves emphasis: **including participant names in the user prompt** gives the model the resolved-identity context it needs to attribute commitments correctly to the right person when a speaker refers to themselves informally (first name only, nickname) — and cross-references the speaker labels already present in the transcript. This is a meaningful extraction quality improvement over sending the transcript alone, not a nicety.
- Template placeholders are named with double-braces: `{{meeting_title}}`, `{{meeting_date_iso}}`, `{{participants}}`, `{{transcript_content}}` — double-braces specifically to not conflict with Python's `str.format()` syntax in any context where this template file might be loaded and processed by Python string formatting, following the same convention used in the cleanup prompt template established Day 47.

### 5.4 `services/extraction/commitment_parser.py`

**Logic — the three responsibilities, in execution order:**

**(a) `normalize_text(text: str) -> str` — generates `normalized_text`:**
- Implements the documented `normalize_text()` algorithm from the platform's LLD exactly — this is not a new design, it is a faithful Python implementation of the specified algorithm. Any deviation is a bug, not a decision.
- Steps (per LLD specification):
  1. Lowercase the text.
  2. Remove punctuation (regex `[^\w\s]`, preserving word characters and spaces only).
  3. Tokenize on whitespace.
  4. Remove stopwords: the same hardcoded set documented in the LLD (`"i"`, `"will"`, `"have"`, `"the"`, `"a"`, `"an"`, `"by"`, `"to"`, `"it"`, `"my"`, `"is"`, `"am"`, `"are"`, `"be"`, `"was"`, `"were"`, `"been"`, `"do"`, `"did"`, `"does"`, `"for"`, `"with"`, `"this"`, `"that"`, `"all"`, `"in"`, `"on"`, `"at"`, `"up"`, `"we"`, `"our"`, `"i'll"`, `"i'm"`, `"let"`, `"me"`, `"make"`, `"sure"`). This specific list is stored in a constant in `config/cleanup_config.py` (the centralized config established Day 47) or a new `config/extraction_config.py` if extraction-specific config grows enough to warrant separation — to be decided at implementation time based on overall config file size.
  5. Apply simple suffix stemming (not Porter Stemmer — the LLD explicitly uses a lighter approach): strip trailing `"ing"` if length > 5 (e.g. "finishing" → "finish"), strip trailing `"ed"` if length > 4, strip trailing `"s"` if length > 3.
  6. Take first 5 tokens of the result (the max-5-token cap from the LLD).
  7. Join with spaces.
- This normalized form is stored on the parsed commitment as `normalized_text` and is the input to the similarity engine (Day 51-52). **The algorithm must be byte-identical to the documented spec** — any divergence silently corrupts the resolver's similarity scores.
- Unit-tested against a table of known input/output pairs derived directly from the LLD's documented examples (§8, unit test table).

**(b) `check_confidence_calibration(commitment: ExtractedCommitment) -> ConfidenceCalibrationFlag`:**
- A lightweight heuristic cross-check of the model's stated confidence against simple textual signals in the commitment's text.
- `ConfidenceCalibrationFlag(BaseModel)`: `is_suspicious: bool`, `reason: str | None`, `model_stated: float`, `heuristic_estimate_range: tuple[float, float]`.
- Heuristics (deliberate, minimal set — not an elaborate feature-engineering exercise; these are cheap, high-signal checks only):
  - **First-person pronoun check**: if confidence > 0.6 but the commitment text contains no first-person pronoun (`"i"`, `"i'll"`, `"i'm"`, `"i've"`, `"i'd"` — case-insensitive) → flag suspicious. A commitment without first-person language should logically score lower (it may not actually be a commitment per the platform's own definition — it may have slipped through the schema filter at 0.3-0.6 but with inflated confidence).
  - **Hedge word detection**: if confidence > 0.7 but the text contains hedge markers (`"try"`, `"maybe"`, `"hopefully"`, `"perhaps"`, `"might"`, `"should be able"`) → flag suspicious. A heavily hedged statement with high model confidence is a calibration mismatch worth noting.
  - **Deliverable clarity check**: if confidence > 0.8 but the text is shorter than 8 words → flag suspicious. A very short text rarely contains enough specificity to justify high confidence that it's a real, trackable commitment.
- `is_suspicious = True` does **not** cause exclusion or modification of the commitment. It sets a field on the parsed output that the eval harness reads for calibration-quality measurement on Day 60, and that the Node.js side may optionally surface in an admin/debug view. The model's stated confidence is still used for scoring and filtering — the flag is an observability instrument, not an override.

**(c) `build_dedup_key(commitment: ExtractedCommitment) -> str`:**
- Constructs the exact key format used by the resolver's in-meeting dedup and the cross-meeting similarity engine: `f"{commitment.owner_name.lower().strip()}::{commitment.normalized_text}"`.
- This key is stored on the parsed commitment alongside `normalized_text` — it is the literal string a `set` or `dict` membership check compares against when merging results from multiple overlapping chunks (Day 50's extractor.py, which calls this parser).
- `owner_name.lower().strip()` (not a more elaborate normalization) — deliberately minimal, matching the resolver's documented matching logic exactly. The resolver already handles minor name variations through its own fuzzy-match step; the dedup key just needs to be consistent within a single extraction run.

**(d) Final output: `parse_commitment(raw: ExtractedCommitment) -> ParsedCommitment`:**
- `ParsedCommitment(BaseModel)` extends `ExtractedCommitment` with: `normalized_text: str`, `dedup_key: str`, `calibration_flag: ConfidenceCalibrationFlag`.
- This is the type that `extractor.py` (Day 50) stores and passes to the resolver, never the raw `ExtractedCommitment`.

### 5.5 `services/extraction/action_item_parser.py`

**Logic:**

**(a) Priority normalization (defensive post-processing):**
- In theory, OpenRouter's `response_format: json_schema` with an enum constraint prevents any non-`PriorityLevel` value from appearing in the model's response. In practice, at low frequency, structured-output enforcement produces near-miss values (`"URGENT "` with a trailing space, `"high"` in lowercase, `"Critical"` as a non-enum synonym) that pass JSON validation if the schema's enum enforcement is imperfect on the model's end.
- Normalization: `strip()` + `upper()` + map to `PriorityLevel`. If after normalization the value still doesn't match any enum member, it defaults to `PriorityLevel.MEDIUM` (not a crash, not a silent discard — a safe default logged as a structured warning event, so the frequency of this fallback is observable and can trigger a prompt fix if it grows beyond a negligible rate).
- This logic belongs here, in the parser, as a defensive layer — but any systematic occurrence should be treated as a signal to fix the response_format schema configuration or the prompt's output-contract section, not to expand this normalization logic indefinitely.

**(b) Owner-name normalization:**
- `assignee_name.strip()` — trailing whitespace normalization. Nothing more aggressive, because display names are identity-sensitive (normalizing "Dr. Ahmed Hassan" to "Ahmed Hassan" might silently misidentify this person in the participant map lookup later).

**(c) In-meeting dedup (chunk-overlap artifact removal):**
- Day 48's chunker produces overlapping chunks (a few turns repeated at the boundary of consecutive chunks). When both chunks produce an extraction result, the same action item may appear twice in the merged results.
- Dedup key for action items: `f"{item.assignee_name.lower().strip()}::{item.text.lower().strip()[:80]}"` — text truncated to 80 characters to avoid exact-string-match failures on trivially punctuation-different duplicates; the first 80 chars of an action item text are overwhelmingly sufficient to identify the same item across two extractions of the same turn.
- Merge rule: when a duplicate key is detected, keep the instance with higher confidence (or if confidence is equal, keep the one with a non-None `due_date_raw` — a deadline-carrying instance is always more informative than a no-deadline one).

### 5.6 `services/extraction/decision_parser.py`

**Logic:**
- Lighter than commitment/action-item parsers — decisions have no confidence-tiering complexity, no owner-attribution rules, no dedup-key cross-meeting matching requirement.
- `parse_decision(raw: ExtractedDecision) -> ParsedDecision`: strips whitespace from `text` and `made_by`, validates `text` is non-empty after stripping (catches the rare case where schema enforcement allowed an empty decision through), appends `text_normalized: str` (simple lowercase + strip — not the full 5-token normalization of commitments, since decisions are not cross-meeting matched by the resolver), returns `ParsedDecision`.

### 5.7 `services/extraction/blocker_parser.py`

**Logic:**
- `parse_blocker(raw: ExtractedBlocker) -> ParsedBlocker`: strips whitespace from all string fields, validates `text` non-empty, normalizes `affected_name` and `blocking_party` (strip + title-case — a mild normalization since these are display names used only for the frontend's blocker view, not for any algorithmic matching).
- Simple dedup key (for chunk-overlap artifacts): `f"{blocker.text.lower().strip()[:80]}"` — same first-80-chars approach as action items; blockers have no owner field making the key more specific, so text alone is the dedup basis.

### 5.8 `eval/eval_schema.py` — Golden Dataset Format

**Logic:**
- `EvalExpectedCommitment(BaseModel)`: `text_contains: str | None` (a substring that MUST appear in the matched extracted commitment's text — more robust than exact-text match for expected vs. actual comparison, since the model may extract the same commitment in slightly different verbatim wording across runs), `owner_name_contains: str`, `confidence_min: float | None`, `due_date_raw_contains: str | None`.
- `EvalExpectedActionItem(BaseModel)`: `text_contains: str`, `assignee_name_contains: str`, `priority: PriorityLevel | None`.
- `EvalCase(BaseModel)`: `meeting_id: str`, `description: str` (human-readable label: "Monday standup May 6 2026"), `expected_commitments: list[EvalExpectedCommitment]`, `expected_action_items: list[EvalExpectedActionItem]`, `expected_decisions: list[EvalExpectedDecision]`, `expected_blockers: list[EvalExpectedBlocker]`, `expected_commitment_count: int`, `expected_zero_commitments: bool` (set `True` for the ambiguous_cases fixture — a direct assertion that the extractor must produce an empty commitment list).
- These models are scaffolded today specifically so Day 60's `run_extraction_eval.py` can `from eval.eval_schema import EvalCase` without any schema changes needed later. Building the schema today, when the golden dataset is being authored, ensures the labeling format and the evaluation format agree from the start — not retrofitted after labeling is done.

### 5.9 `eval/golden_dataset/` — Fixture Design

**Fixture 1: `standup_01_cleaned.json` + `standup_01_expected.json`**
- A realistic 5-person, 25-minute Monday engineering standup in cleaned-transcript format (output shape of Day 46-48 pipeline). Content includes: 3 clear commitments with various confidence levels, 2 action items (one self-volunteered, one third-party assigned), 1 decision ("we're shipping Friday"), 1 blocker ("waiting on design assets").
- `standup_01_expected.json` hand-labels all 3 expected commitments with `text_contains`, `owner_name_contains`, and `confidence_min` values, plus the 2 action items, 1 decision, 1 blocker.
- **Why a standup?** The most common meeting type for the target market (engineering teams, 5-15 minutes). Must pass first.

**Fixture 2: `sprint_review_01_cleaned.json` + `sprint_review_01_expected.json`**
- A 45-minute sprint review. Higher complexity: 6-8 commitments (some conditional, some dual-extracted), 4-6 action items across 5 participants, 2-3 decisions, 1-2 blockers.
- Tests the multi-commitment-per-person and conditional-commitment edge cases.

**Fixture 3: `ambiguous_cases_cleaned.json`**
- A curated, adversarial fixture containing ONLY the documented anti-patterns: "We should look into X", "Can you look at Y?", "I was supposed to finish Z but I didn't get to it", "Someone needs to handle A", "Let's make sure B gets done". No genuine first-person commitments.
- `expected_commitment_count: 0`, `expected_zero_commitments: true`.
- **This is the day's single most important test fixture.** Any false positive (the model extracting a commitment from this file) is a P0 prompt bug with immediate fix required before sign-off.

---

## 6. Performance Considerations Specific to Today

```
- The prompt itself is the performance-critical artifact today, not
  algorithmic code. A longer, more example-rich system prompt costs more
  input tokens on every extraction call. The trade-off is explicitly
  managed: every example added to commitment_examples.txt is assessed
  for whether the accuracy improvement it produces justifies the per-call
  token cost at Vocaply's projected meeting volume. A rule of thumb used
  here: an example that addresses an anti-pattern case costs tokens on
  EVERY call to prevent a failure that occurs on some calls — this is
  almost always worth it. An example that addresses a very rare positive
  edge case may not be.

- The system prompt is STATIC across all calls (per Decision 3's caching
  rationale). Token cost of the system prompt is paid once per meeting's
  extraction call, not per chunk — because multiple chunks from the same
  meeting all share the same system prompt, and OpenRouter/Gemini's prompt
  caching (if available for the chosen model) can amortize repeated system
  prompt processing across calls within a session. This is another reason
  to invest in making the system prompt as high-quality and stable as
  possible rather than dynamically varying it.

- Post-processing parsers (§5.4-5.7) are pure Python, synchronous, O(n)
  over the number of extracted items — they add negligible latency to the
  extraction pipeline. normalize_text() is the most computationally
  meaningful step, still sub-millisecond for a commitment text of
  realistic length.
```

---

## 7. Security Considerations Specific to Today

```
- extraction_system.txt contains no user data — it is a static,
  version-controlled prompt template with no meeting content embedded.
  There is no PII risk in this file.
- extraction_user.txt injection points (meeting title, participant names,
  transcript content) carry real user data. The same no-full-text-at-INFO-
  level logging discipline established Day 47 applies unchanged here: the
  user-message content is never logged at INFO or above; only metadata
  (meeting_id, team_id, token counts) is logged at INFO.
- Prompt injection remains a live concern for the extraction service for
  the same reasons flagged on Day 47: meeting transcript content is user-
  generated. The extraction system prompt's explicit ROLE and SCOPE section
  (§5.2 SECTION 1) contains the primary mitigation: framing the model's
  task as data-extraction-from-a-labeled-source, not instruction-following
  from the transcript content itself. Additionally, the transcript is
  injected inside explicit delimiters (--- TRANSCRIPT START/END ---)
  that make the content-vs-instruction boundary maximally clear.
- normalized_text generation (§5.4a) touches user-generated content but
  outputs only a short, stopword-stripped key with no PII-bearing
  information (names are excluded from normalization scope — normalization
  operates only on the commitment's action text, not the owner_name field).
  The output is safe to log at INFO level (it's a 5-token key like
  "finish login feature"), unlike the raw commitment text.
```

---

## 8. End-of-Day Testing & Definition of Done

```
UNIT TESTS (no live Gemini calls — pure Python):

  extraction_models.py:
  [ ] ExtractedCommitment rejects empty text (after stripping) via
      model_validator
  [ ] ExtractedCommitment rejects empty owner_name (after stripping)
  [ ] ExtractedCommitment rejects confidence = -0.01 and confidence = 1.01
      via Field constraint
  [ ] ExtractedCommitment confidence < 0.3 → model_validator EXCLUDES the
      item (raises ValidationError or strips it, consistent with chosen
      implementation strategy, explicitly verified)
  [ ] ExtractedActionItem priority = "MEDIUM" → valid; priority = "CRITICAL"
      → ValidationError (not in PriorityLevel enum); priority = "HIGH" →
      valid
  [ ] ExtractionResponse empty-list fields default to [] not null when
      model_json_schema() is called (verifying JSON Schema output for
      OpenRouter compatibility)

  commitment_parser.py:
  [ ] normalize_text("I'll finish the login feature by Thursday")
      → "finish login feature" (exact match against LLD-documented example)
  [ ] normalize_text("I'm going to update the documentation")
      → "updat document" (stemming applied correctly: "updating"→"updat",
      "documentation"→"document" — verify against LLD algorithm exactly)
  [ ] normalize_text("Let me make sure I review the PRs")
      → "review pr" (stopwords removed: let, me, make, sure, i, the)
  [ ] normalize_text result is ALWAYS ≤ 5 space-separated tokens regardless
      of input length
  [ ] Empty string input → returns "" without exception
  [ ] check_confidence_calibration: high confidence (0.85) + no first-person
      pronoun → is_suspicious=True, reason references "first_person"
  [ ] check_confidence_calibration: high confidence (0.85) + clear first-
      person pronoun → is_suspicious=False
  [ ] check_confidence_calibration: confidence 0.4 + hedge words → not
      suspicious (hedge at low confidence is expected/consistent)
  [ ] build_dedup_key: consistent output format verified;
      two logically-identical commitments (same owner, same normalized text,
      minor surface variation) produce the same dedup key

  action_item_parser.py:
  [ ] Priority normalization: "HIGH" → PriorityLevel.HIGH
  [ ] Priority normalization: "high" (lowercase) → PriorityLevel.HIGH
  [ ] Priority normalization: "URGENT " (trailing space) → PriorityLevel.URGENT
  [ ] Priority normalization: "CRITICAL" (non-enum synonym) →
      PriorityLevel.MEDIUM (safe default) + warning logged
  [ ] Dedup: two near-identical action items with same assignee and same
      first-80-char text → merged to one, higher-confidence retained
  [ ] Dedup: two items with same text but different assignees →
      NOT merged (different dedup keys)

  decision_parser.py:
  [ ] Empty text after stripping → ValidationError, not silent pass-through
  [ ] text and made_by whitespace stripped correctly

  blocker_parser.py:
  [ ] text_normalized is lowercase + stripped; affected_name is title-cased
  [ ] Dedup: same blocker text from two overlapping chunks → merged to one

PROMPT VALIDATION TESTS (live OpenRouter / Gemini Flash-Lite calls):

  Anti-pattern fixture (ZERO TOLERANCE):
  [ ] ambiguous_cases_cleaned.json → ExtractionResponse.commitments is
      EXACTLY an empty list [] — no items, regardless of confidence level
      (any extraction from this fixture is a P0 prompt bug, not a "low
      confidence but acceptable" case)
  [ ] The following specific lines from the fixture are individually
      verified to produce NO commitment extraction:
        "We should look into improving our deployment pipeline"
        "Can you take a look at the failing tests?"
        "I was supposed to finish the API docs last week but I ran out of time"
        "Someone really needs to handle the customer escalation"
        "Let's make sure the performance tests get run before release"

  Golden dataset precision/recall (informal, pre-Day-60 formal eval):
  [ ] standup_01_cleaned.json → every expected commitment in
      standup_01_expected.json matched by at least one extracted commitment
      (recall check: expected count found)
  [ ] standup_01 → no unexpected commitments beyond the labeled set by
      more than 1 (precision check: generous tolerance on first run)
  [ ] Dual-extraction case: "I'll take care of the load testing myself"
      appears in BOTH commitments list AND action_items list in the
      same ExtractionResponse (verifying the prompt's dual-extraction
      instruction is working)
  [ ] sprint_review_01_cleaned.json informal check: ≥3 of the 6-8 expected
      commitments found (a passing bar on first run, before prompt tuning)

  Prompt versioning:
  [ ] extraction_system.txt first-line version marker is present and
      parseable as a version string (confirming the version-tag convention
      from Day 47 is consistently applied)

DEFINITION OF DONE:
  The anti-pattern fixture must produce zero commitment extractions —
  this is a binary, non-negotiable gate, not a "we'll improve it later."
  The golden-dataset informal recall check must pass ≥85% on standup_01.
  Both gates must be verified with live OpenRouter calls (not mocked) before
  sign-off, because the prompt's effectiveness is only knowable against the
  real model, not against a test stub.
```

---

## 9. Explicit Risks & Open Decisions Carried Forward

```
RISK / DECISION                              RESOLUTION TODAY / DEFERRED TO
─────────────────────────────────────────────────────────────────────────
Gemini Flash-Lite via OpenRouter hitting     If observed in today's live
the documented ≥91%/≥87% precision/recall   prompt tests, the primary
targets at Flash-Lite tier quality           lever is more/better few-shot
                                              examples in commitment_examples.txt,
                                              not a model-tier upgrade — try
                                              prompt improvements first (at
                                              zero additional cost vs. a
                                              tier upgrade); escalate to
                                              Flash tier only if precision/
                                              recall cannot reach target
                                              through prompt engineering alone

extraction_system.txt token count vs.       After today's prompt-engineering
cost-per-call trade-off                      session, measure the prompt's
                                              total token count and project
                                              the per-meeting extraction cost
                                              using Day 46's cost-tracking
                                              infrastructure. If cost materially
                                              exceeds HLD's target, audit the
                                              prompt for verbose rules that
                                              can be expressed more concisely
                                              without sacrificing clarity.

PriorityLevel.MEDIUM as safe default for    Accepted as a product decision
unrecognizable priority strings from         today (medium is the least-
structured output                            harmful wrong answer vs. HIGH or
                                              URGENT which could trigger
                                              incorrect Jira ticket priority);
                                              revisit if systematic priority
                                              misclassification is observed
                                              in Day 60 eval

Golden dataset sample size (3 fixtures)     Explicitly acknowledged as a
is small for Day 60 eval                     starting point; 3-4 more fixtures
                                              will be added during Days 50-59
                                              as a consistent background task
                                              (~30 min/day) rather than rushed
                                              all at once before Day 60
```

---

*Document: AI-PIPELINE-DAY49-DEEP | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*Extraction Prompts + Schema Contract + Post-Processing Parsers + Golden Dataset*
*OpenRouter → Gemini 2.5 Flash-Lite | Planning Document Only — No Implementation Code*
