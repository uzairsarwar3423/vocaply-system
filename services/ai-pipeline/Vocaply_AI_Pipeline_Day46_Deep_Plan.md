# Vocaply — AI Pipeline: Day 46 Deep Build Plan
## FastAPI Foundation + Gemini Client + Health Endpoint
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Stack: Python 3.12 · FastAPI · Pydantic v2 · google-genai SDK · Motor (MongoDB) · redis.asyncio · structlog · tenacity
> Document: AI-PIPELINE-DAY46-DEEP | Version 1.0 | Planning Only — No Code

---

## 0. Why Day 46 Deserves This Much Depth

Every later day in this phase — cleanup, extraction, resolution, embeddings, chat — is a *consumer* of what gets built today. If the `GeminiClient` abstraction is wrong, every prompt written over the next two weeks inherits that mistake. If the settings/config layer isn't fail-fast, a missing API key surfaces as a confusing 500 in production instead of a clear boot-time crash in CI. If cost-tracking isn't wired in from call #1, there is no way to retroactively reconstruct what extraction actually cost per meeting once the service has been running for a month.

The engineering posture for today is **"build the foundation once, build it right, build it boring."** Nothing shipped today should need to be re-architected when Day 47's cleanup pipeline or Day 56's RAG embedder starts calling into it. This document treats Day 46 as its own micro-project with its own architecture review, not just a checklist.

---

## 1. Architectural Decisions Made Today (and Why)

```
DECISION 1 — Task-type-routed model client, not a thin SDK wrapper
  Callers never say "use gemini-2.5-flash". They say "I'm doing EXTRACTION".
  The client owns the mapping to a model name. This is a classic Strategy /
  routing-table pattern — it decouples "what the caller wants done" from
  "which model/config combination currently does it best/cheapest."
  WHY IT MATTERS AT SCALE: six months from now, Google ships a
  gemini-2.5-flash-lite-002 with better price/performance. Swapping it in
  is a one-line edit to model_routing.py, not a nine-file grep-and-replace
  across every service file that happens to call Gemini.

DECISION 2 — Structured output is schema-first, not prompt-first
  We rely on the Gemini API's native controlled-generation / response-schema
  mode (response_mime_type="application/json" + response_schema bound to a
  Pydantic model), not prompt instructions like "respond only in JSON."
  WHY: prompt-only JSON enforcement is a known source of production
  incidents — markdown code fences, trailing commentary, truncated JSON.
  API-level schema constraints push that failure mode down dramatically,
  and what remains is handled by an explicit, observable retry contract
  (see Decision 5) rather than silent regex-stripping of stray text.

DECISION 3 — Settings validated at import time, not first-request time
  A Pydantic BaseSettings singleton is constructed at module import. This
  means `python -c "from src.config.settings import settings"` either
  succeeds or fails loudly. CI can run this as a standalone pre-flight
  check before deploy. This mirrors the platform's existing Node.js
  env.ts fail-fast convention by design — operational consistency across
  the two backend services lowers on-call cognitive load.

DECISION 4 — Two async client singletons (Mongo, Redis), lifecycle owned
  by FastAPI's `lifespan`, never instantiated ad hoc inside a request
  WHY: connection-per-request is a classic scaling foot-gun. A single
  pooled client, created once at process boot and shared across all
  requests/coroutines, is the only pattern that scales horizontally
  (N processes × pool size, not N processes × N requests × new connection).

DECISION 5 — Every Gemini call returns a typed result envelope, success or
  failure, that ALWAYS carries token/cost/latency metadata
  WHY: cost observability is not a "nice to have" bolted on later — Gemini
  spend is a direct, variable line item against gross margin (per the
  platform's own HLD cost modeling). If this isn't built into the lowest
  layer on day one, every later feature either re-implements it
  inconsistently or — more likely — never gets it at all.

DECISION 6 — Internal-only service, authenticated by shared secret, never
  internet-facing
  WHY: this FastAPI service has no concept of an end-user JWT, no concept
  of a browser session. Its only caller is the Node.js API (server-to-
  server). Treating it as "internal" from day one (network placement +
  auth model) avoids ever having to retrofit authz onto routes that were
  built assuming an open/public threat model.
```

---

## 2. Hour-by-Hour Execution Plan (8-Hour Day)

```
9:00 – 9:30    Repo scaffold: pyproject.toml, requirements files, folder
               skeleton, pre-commit hooks (ruff/black/mypy), Dockerfile stubs
9:30 – 10:15   config/settings.py — full Settings model, env var inventory,
               fail-fast import-time validation, lru_cache singleton
10:15 – 10:45  config/logging.py — structlog setup, JSON renderer, request_id
               context var wiring (consumed by middleware later)
10:45 – 11:00  models/common.py — TaskType, ModelTier enums; CostRecord,
               GeminiCallResult Pydantic models
11:00 – 12:30  services/gemini_client.py — the core wrapper: structured
               output path, retry/backoff via tenacity, timeout handling,
               cost computation, typed exception hierarchy
12:30 – 1:00   config/model_routing.py — task→tier table, pricing constants
1:00 – 2:00    Lunch
2:00 – 2:30    db/mongo_client.py + db/redis_client.py — singleton clients,
               lifespan-managed, ping/health helper methods
2:30 – 3:15    middleware/ (request_id, error_handler, request_logger) +
               api/deps.py (Depends() providers, internal-auth dependency)
3:15 – 3:45    api/main.py — app factory, lifespan wiring, middleware
               registration order, CORS lockdown
3:45 – 4:15    api/routes/health.py — /health (liveness) + /ready (readiness)
4:15 – 5:15    tests/ — conftest.py fixtures (mocked Gemini SDK, fakeredis,
               mongomock-motor or testcontainers), test_settings.py,
               test_gemini_client.py, test_health.py
5:15 – 5:45    Dockerfile + Dockerfile.dev finalization, docker build smoke test
5:45 – 6:00    End-of-day manual checklist run-through (§7) + sign-off
```

---

## 3. Full File Structure (Day 46 Scope Only)

```
services/ai-pipeline/
│
├── src/
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── main.py                    ← App factory + lifespan + middleware wiring
│   │   ├── deps.py                    ← Depends() providers + internal-auth dependency
│   │   └── routes/
│   │       ├── __init__.py
│   │       └── health.py              ← GET /health, GET /ready
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   └── gemini_client.py           ← GeminiClient class (core of the day)
│   │
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings.py                ← Settings(BaseSettings), singleton accessor
│   │   ├── logging.py                 ← structlog configuration
│   │   └── model_routing.py           ← TaskType→ModelTier table + pricing table
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── common.py                  ← TaskType, ModelTier enums; CostRecord,
│   │   │                                  GeminiCallResult, ErrorEnvelope
│   │   └── exceptions.py              ← Typed exception hierarchy (see §5.3)
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── mongo_client.py            ← Motor async singleton + ping()
│   │   └── redis_client.py            ← redis.asyncio singleton + ping()
│   │
│   └── middleware/
│       ├── __init__.py
│       ├── request_id.py              ← X-Request-ID injection/propagation
│       ├── request_logger.py          ← Structured access-log middleware
│       └── error_handler.py           ← Global exception → ErrorEnvelope mapping
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py                    ← Shared fixtures (app, client, mocks)
│   ├── test_settings.py
│   ├── test_gemini_client.py
│   ├── test_health.py
│   └── test_middleware.py
│
├── requirements.txt
├── requirements-dev.txt
├── pyproject.toml                     ← ruff, mypy, pytest config sections
├── Dockerfile                         ← production multi-stage build
├── Dockerfile.dev                     ← dev image with reload + dev deps
├── .dockerignore
├── .env.example
└── README.md                          ← "second engineer can run this" doc
```

---

## 4. Detailed Implementation Logic — File by File

### 4.1 `pyproject.toml` / `requirements.txt` / `requirements-dev.txt`

**Logic:**
- `requirements.txt` pins production deps with explicit version ranges, never bare `latest`: `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `pydantic-settings`, `google-genai` (the current official Google GenAI SDK, not the deprecated `google-generativeai` package — principal-level diligence: confirm which SDK is current at implementation time, since Google has churned SDK names), `motor`, `redis`, `structlog`, `tenacity`, `python-json-logger` (fallback if structlog's own JSON renderer isn't used).
- `requirements-dev.txt` adds `pytest`, `pytest-asyncio`, `pytest-mock`, `httpx` (FastAPI's recommended test client transport), `mongomock-motor` or `testcontainers[mongodb]`, `fakeredis`, `ruff`, `mypy`, `black` (or ruff-format, consolidating tooling).
- `pyproject.toml` centralizes tool config (`[tool.ruff]`, `[tool.mypy]` strict mode enabled, `[tool.pytest.ini_options]` with `asyncio_mode = "auto"`) so CI and local dev run identical checks — no "works on my machine" linting drift.
- **Why pin versions deliberately**: an AI SDK is one of the fastest-moving dependency categories in the current ecosystem; an unpinned `google-genai` could introduce a breaking API change silently on a routine `pip install`. Lockfile discipline here is not optional.

### 4.2 `config/settings.py`

**Logic:**
- `Settings(BaseSettings)` declares every required and optional environment variable with explicit types and, where sensible, Pydantic `Field` constraints:
  - `gemini_api_key: SecretStr` (never a plain `str` — Pydantic's `SecretStr` prevents accidental leakage into logs/repr output, a real production incident class)
  - `mongodb_url: str`, `redis_url: str`
  - `environment: Literal["development", "staging", "production"]`
  - `log_level: Literal["DEBUG","INFO","WARNING","ERROR"] = "INFO"`
  - `gemini_flash_model_name: str`, `gemini_flash_lite_model_name: str`, `gemini_embedding_model_name: str` — kept as **settings**, not hardcoded constants, specifically so a model-name change (Google renaming/retiring a model) is an env var change in deployment config, not a code deploy.
  - `max_gemini_retries: int = 3`, `gemini_timeout_seconds: float = 30.0`, `gemini_max_concurrent_calls: int` (a semaphore bound, used later by extraction's bounded-concurrency chunk processing — defined here so it's centrally configurable from day one even though it's not consumed until Day 50).
  - `api_shared_secret: SecretStr` — the Node.js↔FastAPI internal auth secret.
  - `mongo_pool_min_size`, `mongo_pool_max_size`, `redis_pool_max_connections` — explicit, not left to library defaults, because default pool sizes are rarely correctly tuned for a specific deployment's concurrency profile.
- A **custom validator** asserts `gemini_flash_model_name != gemini_flash_lite_model_name` (a trivial but real misconfiguration class — copy-pasted env vars in a `.env` file) and that `gemini_timeout_seconds > 0`.
- Settings instantiation happens through a `@lru_cache` factory function `get_settings() -> Settings`, not a bare module-level `settings = Settings()` — this is the FastAPI-idiomatic pattern that allows `app.dependency_overrides` in tests to substitute a different settings instance cleanly (e.g. pointing at a test Mongo URL) without monkeypatching the module.
- **Import-time fail-fast** is achieved by calling `get_settings()` once at module import (not just defining the function) — so importing `config.settings` anywhere in the codebase, including in a CI "import smoke test" step, triggers full validation immediately.

### 4.3 `config/logging.py`

**Logic:**
- Configures `structlog` with a processor chain: timestamper → log-level adder → `request_id` context-var merger → JSON renderer (in production) or a human-readable console renderer (in development, gated by `settings.environment`).
- A `request_id` `contextvars.ContextVar` is declared here (or in `middleware/request_id.py`, cross-referenced) so any log call anywhere in the call stack — deep inside `gemini_client.py`, with zero explicit parameter-passing — automatically includes the current request's ID. This is the mechanism that makes a single meeting's full processing journey traceable end-to-end in logs, the same observability bar already set by the Node.js side in Day 18's plan.
- Every log entry's base shape: `{"timestamp": ..., "level": ..., "service": "ai-pipeline", "request_id": ..., "event": <message>, ...extra structured fields}`. The `service` field is hardcoded here, distinguishing AI-pipeline logs from Node.js API logs in a shared log aggregation pipeline (Axiom/Datadog, per the platform's existing observability stack).
- **No `print()` rule enforcement**: a `ruff` lint rule (`T201`) is enabled in `pyproject.toml` specifically to fail CI on any stray `print()` call — this is a cheap, durable guardrail against the single most common way structured logging discipline erodes over time in a growing codebase.

### 4.4 `models/common.py`

**Logic:**
- `TaskType(str, Enum)`: an exhaustive, intentionally-named enum — `TRANSCRIPT_CLEANUP`, `EXTRACTION`, `RESOLUTION_CHECK`, `SUMMARY`, `CHAT_ANSWER`, `EMBEDDING`, `RERANK` — every task type the *entire* Phase 4 plan will eventually need is enumerated today, even though only `TRANSCRIPT_CLEANUP`-adjacent groundwork is exercised this week. Defining the full enum now (rather than incrementally adding values day by day) prevents `model_routing.py` from needing repeated structural edits and gives Day 47+ implementers a single source of truth to reference.
- `ModelTier(str, Enum)`: `FLASH_LITE`, `FLASH`, `EMBEDDING` (embedding calls are conceptually a third "tier" — different SDK call shape entirely, not a text-generation call, so it deserves its own enum value rather than being shoehorned into FLASH/FLASH_LITE).
- `CostRecord(BaseModel)`: `input_tokens: int`, `output_tokens: int`, `total_tokens: int` (computed/validated as the sum), `estimated_cost_usd: float`, `model_tier: ModelTier`, `model_name: str`.
- `GeminiCallResult(BaseModel, Generic[T])`: a generic envelope — `data: T` (the validated, typed structured-output payload), `cost: CostRecord`, `latency_ms: float`, `retry_count: int`, `task_type: TaskType`. Using Python generics here means `gemini_client.generate_structured(..., response_schema=ExtractionResponse)` returns a `GeminiCallResult[ExtractionResponse]` with full static type-checking downstream — mypy will catch a caller trying to access a field that doesn't exist on `ExtractionResponse`, at lint time, not at runtime.
- `ErrorEnvelope(BaseModel)`: the FastAPI-wide error response shape — `error_code: str`, `message: str`, `request_id: str`, `details: dict | None` — deliberately structurally similar to the Node.js API's existing `{success: false, error: {code, message, details}}` envelope (not byte-identical, since this is an internal service, but conceptually consistent so any engineer who has debugged one service can read the other's error responses without relearning a convention).

### 4.5 `models/exceptions.py`

**Logic:**
- A small, explicit exception hierarchy rooted at `AIPipelineError(Exception)`:
  - `GeminiSchemaValidationError` — raised when structured output fails Pydantic validation even after the one allowed retry.
  - `GeminiTimeoutError` — raised when a call exceeds `gemini_timeout_seconds` even after retries.
  - `GeminiNonRetryableError` — wraps a 401/400-class upstream error; carries the original status code/message for logging, but is explicitly never retried.
  - `GeminiRateLimitExhaustedError` — raised when retries are exhausted specifically on 429s (kept distinct from a generic timeout/5xx exhaustion so callers/metrics can distinguish "Google throttled us" from "Google was slow/down" — these have different operational responses: the former may warrant backing off *new* call issuance platform-wide, the latter is more likely transient).
  - `InternalAuthError` — raised by the auth dependency when the shared-secret header is missing/invalid.
- Each exception carries enough structured context (`task_type`, `model_tier`, attempt count where relevant) to be logged richly by the global error handler without the handler needing to introspect string messages — **typed exceptions, not string-matched exceptions**, is the principal-level discipline being enforced here.

### 4.6 `config/model_routing.py`

**Logic:**
- A frozen, importable mapping: `TASK_MODEL_MAP: dict[TaskType, ModelTier]` — e.g. `TRANSCRIPT_CLEANUP→FLASH_LITE`, `EXTRACTION→FLASH_LITE`, `RESOLUTION_CHECK→FLASH_LITE`, `SUMMARY→FLASH`, `CHAT_ANSWER→FLASH`, `EMBEDDING→EMBEDDING`, `RERANK→FLASH_LITE`.
- A second mapping, `MODEL_TIER_TO_NAME: dict[ModelTier, str]`, resolved **from settings** (`settings.gemini_flash_model_name` etc.) at client-construction time rather than hardcoded — this is the seam that lets a staging environment point `FLASH_LITE` at a different/cheaper/preview model than production without any code change.
- A `PRICING_TABLE: dict[ModelTier, PricingRates]` constant — `PricingRates(input_per_million_usd: float, output_per_million_usd: float)` — used purely by the cost calculator in `gemini_client.py`. This table is explicitly commented as "verify against current Google AI pricing before each deploy" — a living config value, not a fire-and-forget constant, because provider pricing changes are outside this codebase's control and silent staleness here would quietly corrupt every cost report from Day 60 onward.
- A pure function `resolve_model(task_type: TaskType, settings: Settings) -> tuple[str, ModelTier]` is the only public surface other modules touch — callers never reach into the dicts directly, keeping the routing logic swappable behind one function signature.

### 4.7 `services/gemini_client.py` (the centerpiece)

**Logic, broken into its constituent responsibilities:**

**(a) Construction**
- `GeminiClient.__init__(self, settings: Settings)` constructs the underlying Google GenAI SDK client once, storing it as an instance attribute. The class itself is designed to be instantiated exactly once per process (via `deps.py`'s singleton provider) — never per-request.

**(b) `generate_structured(self, task_type: TaskType, system_prompt: str, user_prompt: str, response_schema: type[BaseModel]) -> GeminiCallResult[T]`**
- Step 1: `resolve_model(task_type, self.settings)` → model name + tier.
- Step 2: builds the SDK call with `response_mime_type="application/json"` and the schema derived from `response_schema.model_json_schema()` (or the SDK's native Pydantic-binding support if available — principal-level note: confirm at implementation time whether `google-genai` accepts a Pydantic class directly as `response_schema`, which is the cleaner integration if supported).
- Step 3: wraps the actual SDK call in a `tenacity.AsyncRetrying` policy: `wait_exponential(multiplier=..., max=...)` with jitter, `stop_after_attempt(settings.max_gemini_retries)`, `retry_if_exception_type((TimeoutError, RateLimitHTTPError, ServerHTTPError))` — explicitly **excluding** 4xx-class non-429 errors from the retry predicate, so a malformed-request bug fails fast in one call instead of burning the full retry budget pointlessly.
- Step 4: on response, attempts `response_schema.model_validate_json(raw_text)`. On `ValidationError`: if this is the first attempt, re-issue the call once with an amended user prompt appending a corrective instruction (the "your previous response did not match schema" retry described in the brief) — implemented as a *separate*, bounded one-shot retry layered on top of (not merged into) the tenacity transient-error retry loop, because schema-mismatch and network-transient-failure are different failure classes deserving different retry semantics. On second failure: raise `GeminiSchemaValidationError` with the raw offending text attached (for offline debugging/eval), never returned to the caller as data.
- Step 5: on success, computes `CostRecord` from the SDK response's usage metadata (`prompt_token_count`, `candidates_token_count` or equivalent field names — to be confirmed against the actual SDK response shape at implementation time) and `PRICING_TABLE`.
- Step 6: logs one structured `structlog` event per call — success or failure — containing `task_type`, `model_tier`, `model_name`, full `CostRecord` fields, `latency_ms`, `retry_count`. This single log line is the entire raw data source Day 60's cost-eval script will aggregate; nothing else needs to be built to support that later report.
- Step 7: returns `GeminiCallResult[T]`.

**(c) `generate_text(self, task_type, system_prompt, user_prompt) -> GeminiCallResult[str]`**
- Same retry/timeout/cost-tracking skeleton as `generate_structured`, but without schema validation — used for free-text generation tasks (e.g. eventually, narrative summary prose in later days). Built today as a thin sibling method specifically so the *next* nine days never need to touch `gemini_client.py`'s core retry/cost machinery again — they only ever call one of these two already-hardened entry points.

**(d) `embed(self, texts: list[str]) -> GeminiCallResult[list[list[float]]]`**
- Scaffolded today (even though not consumed until Day 56+) so the client's public surface area is complete and stable from day one — this avoids a Day-56 surprise where the embedding call needs a different retry/cost-tracking pattern bolted on awkwardly. Batches input texts respecting the embedding model's max-batch-size constraint (a config value, not hardcoded), reusing the same retry/timeout decorator pattern as the text-generation methods.

**(e) Timeout enforcement**
- Every SDK call is wrapped in `asyncio.wait_for(..., timeout=settings.gemini_timeout_seconds)` *inside* the tenacity retry loop (timeout-per-attempt, not one timeout for the whole retry sequence) — this is a deliberate, easy-to-get-wrong detail: a single outer timeout wrapping multiple retries can either let one slow attempt eat the entire budget or unfairly truncate a legitimate later retry; per-attempt timeout with tenacity's own `stop_after_attempt` ceiling is the correct composition.

**(f) Concurrency control**
- An `asyncio.Semaphore(settings.gemini_max_concurrent_calls)` is held as an instance attribute and acquired around every outbound call — this exists today even though nothing exercises high concurrency yet, because Day 50's multi-chunk extraction will fan out several concurrent calls per single `/extract` request, and the bound must live at the client level (shared across all callers process-wide) rather than being re-implemented per-feature later.

### 4.8 `db/mongo_client.py` / `db/redis_client.py`

**Logic:**
- Each exposes a small class (`MongoClientWrapper`, `RedisClientWrapper`) with `connect()`, `disconnect()`, and `ping() -> bool` methods — `connect()`/`disconnect()` are called exactly once each, from `main.py`'s `lifespan` context manager; `ping()` is what `/ready` calls per-request (cheap, bounded-timeout health check, never a full query).
- Pool sizing pulled from `settings.mongo_pool_min_size/max_size` and `settings.redis_pool_max_connections` — never library defaults, per Decision 4 above.
- Both wrapper classes raise a typed `DependencyUnavailableError` (added to `models/exceptions.py`) on connection failure at startup — `lifespan` lets this propagate, which means **the FastAPI process refuses to fully start if Mongo or Redis is unreachable at boot**, consistent with the fail-fast philosophy applied to settings.

### 4.9 `middleware/request_id.py`, `request_logger.py`, `error_handler.py`

**Logic:**
- `request_id.py`: a `BaseHTTPMiddleware` (or pure ASGI middleware, principal-level preference for raw ASGI middleware here for lower overhead, to be decided at implementation time) that reads an inbound `X-Request-ID` header if present (propagated from the Node.js caller, which already generates `req_{cuid}` per the platform's existing convention) or generates a new UUID if absent, sets it on the `structlog` context var, and echoes it back on the response header — this is what stitches a single meeting's processing trace across both the Node.js and Python services in shared logs.
- `request_logger.py`: logs one structured line per request — method, path, status code, duration_ms — at request completion (not request start, to capture the full lifecycle in one line rather than two correlated-but-separate lines, reducing log volume and query complexity for the common case).
- `error_handler.py`: a single FastAPI exception handler registered for `AIPipelineError` (catches the entire typed hierarchy from §4.5) and a separate catch-all `Exception` handler for genuinely unexpected errors — both map to the `ErrorEnvelope` shape, both log the full exception with stack trace via structlog, and **the catch-all handler never leaks a raw Python traceback into the HTTP response body in any environment** (a security-relevant detail: stack traces can leak file paths, internal hostnames, and dependency versions to anything that can reach this internal API, even though it's not internet-facing — defense in depth).

### 4.10 `api/deps.py`

**Logic:**
- `get_settings_dep()`, `get_gemini_client()`, `get_mongo_client()`, `get_redis_client()` — each a thin `Depends()`-compatible provider function returning the process-singleton instance (constructed once at `lifespan` startup and stashed on `app.state`, then retrieved from `request.app.state` inside each provider — the standard, correct FastAPI pattern for sharing singletons across requests without global mutable module state).
- `verify_internal_service_key(x_internal_service_key: str = Header(...)) -> None`: compares the inbound header against `settings.api_shared_secret` using `secrets.compare_digest` (constant-time comparison — the same timing-attack-resistant discipline already documented and enforced on the Node.js side's webhook signature verification) and raises `InternalAuthError` (→ 401 via the error handler) on mismatch. This dependency is added to every route **except** `/health` (liveness must be checkable by an orchestrator with no knowledge of the shared secret) — `/ready`, by contrast, **is** protected, since it reveals dependency-health detail that's mildly sensitive operational information.

### 4.11 `api/main.py`

**Logic:**
- `create_app() -> FastAPI`: constructs the app, registers the `lifespan` async context manager (startup: build settings, construct+connect Mongo/Redis/Gemini singletons, attach to `app.state`, log "service ready"; shutdown: disconnect Mongo/Redis gracefully, log "service shutting down" — directly mirroring the Node.js `server.ts` graceful-shutdown pattern already established platform-wide).
- Middleware registration order is deliberate and documented inline as a comment block (because FastAPI/Starlette middleware ordering is a frequent source of subtle bugs): request-id middleware first (so every subsequent layer, including error handling, has access to the request_id context var) → CORS middleware (configured with an explicit `allow_origins=[settings.node_api_internal_origin]`, never `["*"]`, and only enabled at all in non-production environments where browser-based testing tools might hit it directly — in production this service sits behind internal networking and arguably doesn't need CORS handling at all, a decision to be confirmed against actual deployment topology) → request logger middleware (logs after request_id is available) → exception handlers (registered, not strictly "middleware" in the ordering sense, but conceptually the last line of defense).
- Registers `health.router` under no prefix (`/health`, `/ready` at root, not `/api/v1/health` — liveness/readiness probes are infra-level concerns and conventionally live outside any versioned API prefix).
- Future routers (`cleanup.router`, `extract.router`, etc.) are **not** registered today — the file includes a clearly marked comment block showing exactly where/how the next router will be added, so Day 47 is a copy-paste-and-extend operation, not a re-read-the-whole-file operation.

### 4.12 `api/routes/health.py`

**Logic:**
- `GET /health`: returns `{"status": "ok"}` with a 200, synchronously, no `await` on any dependency — this must be fast and trivially reliable, because container orchestrators (Kubernetes, ECS) use liveness failures to **kill and restart** the container; a liveness check that depends on Mongo/Redis/Gemini availability would cause restart-loop death spirals during a transient downstream outage, which is precisely the failure mode liveness/readiness separation exists to prevent.
- `GET /ready`: protected by `verify_internal_service_key`; calls `mongo_client.ping()`, `redis_client.ping()`, and a lightweight Gemini reachability check (principal-level call: a real generation call costs money and adds latency on every readiness probe interval — the readiness check should validate API-key validity and network reachability via the cheapest possible SDK call, e.g. a models-list call if the SDK exposes one, rather than a full generation call; this exact mechanism is flagged as "confirm cheapest viable check against SDK capabilities" at implementation time). Returns `200 {"status": "ready", "checks": {...per-dependency bool...}}` if all pass, `503` with the same per-dependency breakdown if any fail — the breakdown is what lets an on-call engineer immediately see *which* dependency is down without grepping logs.

---

## 5. Security Considerations Specific to Today

```
- Secrets never logged: GEMINI_API_KEY and API_SHARED_SECRET are SecretStr
  at the settings layer specifically so accidental inclusion in a debug
  log statement (`logger.info("settings", **settings.dict())`) renders as
  "**********" rather than the live secret — a cheap, durable guardrail.
- Constant-time comparison on the internal auth header (§4.10) — prevents
  a timing side-channel from leaking the shared secret byte-by-byte,
  mirroring the existing platform-wide discipline applied to webhook
  signature checks.
- No stack traces in HTTP responses, any environment (§4.9) — internal-only
  services are still subject to defense-in-depth; "it's not public" is
  never treated as a substitute for "it's secure."
- CORS is not blanket-enabled — explicitly scoped or disabled depending on
  deployment topology, never a wildcard origin, even on an internal service.
- Settings validation rejects empty/placeholder secret values in
  non-development environments (a validator checks that in
  environment="production", api_shared_secret is not a known-bad default
  like "changeme" — closes the "forgot to set the real secret in prod"
  class of incident before it ships).
```

---

## 6. Scalability Considerations Specific to Today

```
- Stateless process design: nothing in today's code stores per-request
  state in process memory beyond the request's own lifecycle — this is
  what allows the AI pipeline service to be horizontally scaled by simply
  running more container replicas behind a load balancer, with zero
  code changes, consistent with the platform's existing "workers must be
  stateless" principle already applied to the Node.js Bull workers.
- Connection pools (Mongo, Redis) are sized as explicit settings, not
  hardcoded — this is the lever an SRE pulls when scaling replica count
  up, without needing a code change (pool_max_size × replica_count must
  stay under each backing service's total connection ceiling — documented
  as an operational note in README.md today).
- The Gemini concurrency semaphore (§4.7e) is process-local. At higher
  replica counts, true global concurrency is (semaphore_limit × replica_count)
  — this is flagged explicitly as a known limitation today: a future
  iteration may need a distributed rate limiter (Redis-backed token bucket,
  the same pattern already used for the Node.js API's sliding-window rate
  limiter) if Gemini-side per-project rate limits become a binding
  constraint at higher replica counts. Not built today — deliberately
  scoped out, but the seam (the semaphore abstraction) is placed exactly
  where a distributed limiter would later slot in.
- structlog's JSON output is designed for ingestion by a log aggregator,
  not local file rotation — this assumes container-native logging
  (stdout/stderr captured by the orchestrator), the same operational
  model already used by the Node.js service, avoiding a divergent
  logging-infrastructure requirement for this one service.
```

---

## 7. End-of-Day Testing & Definition of Done

```
MANUAL / LOCAL VERIFICATION:
  [ ] `docker build` succeeds for both Dockerfile and Dockerfile.dev
  [ ] `uvicorn src.api.main:create_app --factory` boots locally with a
      valid .env → GET /health → 200 {"status": "ok"}
  [ ] GET /ready (with valid X-Internal-Service-Key) → 200, all three
      dependency checks true, when Mongo+Redis+Gemini all reachable
  [ ] GET /ready with MONGODB_URL pointed at an unreachable host → 503,
      checks.mongodb == false, checks.redis/gemini still accurately reported
  [ ] GET /ready without X-Internal-Service-Key header → 401, ErrorEnvelope
      shape, request_id present in response
  [ ] Removing GEMINI_API_KEY from .env → `uvicorn` boot fails immediately
      with a clear Pydantic validation error message (fail-fast verified
      at the process level, not just unit-tested in isolation)
  [ ] One real `generate_structured()` call (a tiny test Pydantic schema,
      e.g. `class Echo(BaseModel): message: str`) against a live Gemini
      Flash-Lite call → returns valid `GeminiCallResult[Echo]`, cost fields
      populated and numerically plausible (non-zero, non-absurd)
  [ ] Deliberately malformed schema-mismatch scenario (mock or a prompt
      designed to confuse the model) → one retry observed in logs, then
      a clean `GeminiSchemaValidationError`, never a raw/unvalidated
      payload silently returned
  [ ] A simulated network timeout (e.g. via a very low
      GEMINI_TIMEOUT_SECONDS against a real call) → tenacity retry
      sequence observable in structured logs (attempt count incrementing),
      final `GeminiTimeoutError` after exhausting retries
  [ ] Log output, manually inspected: every Gemini call produces exactly
      one structured cost/latency log line; every HTTP request produces
      exactly one structured access-log line; request_id is consistent
      across both for a single request that triggers a Gemini call inside it

AUTOMATED (pytest, run in CI):
  [ ] test_settings.py — missing required var raises at import; SecretStr
      fields never appear in repr()/str() output; production-environment
      placeholder-secret validator rejects known-bad values
  [ ] test_gemini_client.py — fully mocked SDK boundary:
        • structured-output success path returns correctly typed result
        • schema-mismatch → one corrective retry → second failure raises
          GeminiSchemaValidationError
        • simulated 429 → tenacity retries up to max_gemini_retries → 
          raises GeminiRateLimitExhaustedError on exhaustion
        • simulated 401 → raised immediately as GeminiNonRetryableError,
          zero retry attempts made (assert call-count == 1)
        • cost calculation: given known mocked token counts, assert the
          computed estimated_cost_usd matches a hand-calculated expected
          value exactly
        • concurrency semaphore: N+1 concurrent calls against a semaphore
          configured for N → the (N+1)th call observably waits (tested via
          a controlled async timing assertion, not a flaky sleep-based test)
  [ ] test_health.py — /health always 200 regardless of dependency mock
      state; /ready reflects each mocked dependency's true/false state
      correctly in both the boolean response and the HTTP status code;
      auth-required behavior on /ready verified
  [ ] test_middleware.py — request_id is generated when absent, propagated
      when present on the inbound request; error_handler maps a raised
      AIPipelineError subclass to the correct ErrorEnvelope + status code;
      catch-all handler never includes a raw traceback string in the
      response body (assert on response content, not just status code)

DEFINITION OF DONE (unchanged bar, reaffirmed): a second engineer clones
  the repo, copies .env.example to .env, fills in only a real
  GEMINI_API_KEY (Mongo/Redis can point at local Docker Compose instances
  per README instructions), runs one documented command, and successfully
  observes a real structured Gemini call succeed end-to-end — without
  reading a single line of source code, guided only by .env.example and
  README.md's quick-start section.
```

---

## 8. Explicit Risks & Open Decisions Carried Forward

```
RISK / DECISION                              RESOLUTION TODAY / DEFERRED TO
─────────────────────────────────────────────────────────────────────────
Exact google-genai SDK response field names   Confirm at implementation
for token usage (prompt_token_count vs.       time against installed SDK
similar) may differ from assumed names         version's actual response object
SDK's native Pydantic-schema binding support   Confirm at implementation time;
vs. manual model_json_schema() construction    fallback path (manual schema +
                                                manual model_validate_json) is
                                                the safe default assumed in
                                                this plan if native binding
                                                is unavailable/unstable
Cheapest viable Gemini call for /ready check   Confirm SDK exposes a models-list
                                                or similarly free reachability
                                                check; fallback is a minimal
                                                1-token generation call,
                                                accepted as a small but
                                                bounded readiness-probe cost
Distributed (cross-replica) Gemini rate        Explicitly deferred — process-
limiting                                       local semaphore only today;
                                                revisit if/when replica count
                                                or Gemini rate-limit pressure
                                                makes it necessary
CORS posture in production deployment          Deferred to actual infra
topology (fully internal network vs.           topology decision — flagged,
exposed-with-auth)                             not resolved, in main.py today
```

---

*Document: AI-PIPELINE-DAY46-DEEP | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*FastAPI Foundation + Gemini Client + Health Endpoint — Full Depth*
*Planning Document Only — No Implementation Code*
