# Vocaply AI Pipeline

Internal FastAPI service for AI-powered meeting processing.
**Not internet-facing** — authenticated via shared secret from the Node.js API.

---

## Stack

| Component | Technology |
|-----------|-----------|
| Framework | FastAPI + Uvicorn |
| AI | Google Gemini (`google-genai` SDK) |
| Database | MongoDB via Motor (async) |
| Cache/Queue | Redis via `redis.asyncio` |
| Validation | Pydantic v2 + pydantic-settings |
| Logging | structlog (JSON in prod, console in dev) |
| Retry | tenacity |
| Testing | pytest-asyncio + httpx ASGI transport |

---

## Quick Start (Second Engineer On-Ramp)

### Prerequisites

- Python 3.12+
- MongoDB running locally (Docker: `docker run -d -p 27017:27017 mongo`)
- Redis running locally (Docker: `docker run -d -p 6379:6379 redis`)
- A real Gemini API key (https://aistudio.google.com/app/apikey)

### 1. Clone & set up environment

```bash
cd services/ai-pipeline

# Create virtual environment
python3.12 -m venv .venv
source .venv/bin/activate

# Install dev dependencies (includes prod deps)
pip install -r requirements-dev.txt

# Copy environment template and fill in your values
cp .env.example .env
# Edit .env — you MUST set at minimum:
#   GEMINI_API_KEY=<your real key>
#   API_SHARED_SECRET=<any 32+ char string for local dev>
```

### 2. Verify settings (fail-fast pre-flight check)

```bash
python -c "from src.config.settings import settings; print('✅ Settings OK:', settings.environment)"
```

If this fails with a `ValidationError`, check your `.env` file for the named missing variable.

### 3. Run the service

```bash
uvicorn src.api.main:create_app --factory --reload --port 8001
```

### 4. Verify it's running

```bash
# Liveness
curl http://localhost:8001/health

# Readiness (requires X-Internal-Service-Key matching .env API_SHARED_SECRET)
curl -H "X-Internal-Service-Key: <your-secret>" http://localhost:8001/ready
```

Expected responses:
- `/health` → `{"status": "ok"}`
- `/ready` → `{"status": "ready", "checks": {"mongodb": true, "redis": true, "gemini": true}}`

---

## Running Tests

```bash
# All tests (no real network calls — all mocked)
pytest

# With coverage
pytest --cov=src --cov-report=term-missing

# Single test file
pytest tests/test_health.py -v
```

---

## Project Structure

```
src/
├── api/
│   ├── main.py          ← App factory + lifespan + middleware wiring
│   ├── deps.py          ← Depends() providers + internal auth
│   └── routes/
│       └── health.py    ← GET /health, GET /ready
├── config/
│   ├── settings.py      ← Pydantic BaseSettings (fail-fast, SecretStr)
│   ├── logging.py       ← structlog setup + request_id ContextVar
│   └── model_routing.py ← TaskType→ModelTier table + pricing constants
├── db/
│   ├── mongo_client.py  ← Motor async singleton
│   └── redis_client.py  ← redis.asyncio singleton
├── middleware/
│   ├── request_id.py    ← X-Request-ID propagation
│   ├── request_logger.py← Structured access log
│   └── error_handler.py ← Global exception → ErrorEnvelope mapping
├── models/
│   ├── common.py        ← TaskType, ModelTier, GeminiCallResult, ErrorEnvelope
│   └── exceptions.py    ← Typed exception hierarchy
└── services/
    └── gemini_client.py ← Core Gemini client (the centerpiece)
```

---

## Adding a New Route (Day 47+ Pattern)

1. Create `src/api/routes/cleanup.py` with your router
2. In `src/api/main.py`, find the comment `# ADDING FUTURE ROUTERS` and add:
   ```python
   from src.api.routes import cleanup
   app.include_router(cleanup.router, prefix="/api/v1", tags=["cleanup"])
   ```

That's it — no other file needs to change.

---

## Operational Notes

### Connection Pool Sizing

**Rule:** `pool_max_size × replica_count` must stay under your MongoDB Atlas / self-hosted connection ceiling.

Example: If Atlas allows 500 connections and you run 5 replicas with `MONGO_POOL_MAX_SIZE=20`:
- 5 × 20 = 100 connections max (well under the 500 ceiling) ✅

If you scale to 50 replicas: 50 × 20 = 1000 > 500 → reduce `MONGO_POOL_MAX_SIZE` before scaling.

### Gemini Concurrency

`GEMINI_MAX_CONCURRENT_CALLS` is a process-local semaphore. At N replicas, effective global concurrency is `N × GEMINI_MAX_CONCURRENT_CALLS`. If Gemini API rate limits become a constraint at high replica counts, replace the semaphore with a Redis-backed token bucket (the semaphore abstraction is in `GeminiClient.__init__` as the designated swap point).

### Cost Tracking

Every Gemini call logs one structured line with `estimated_cost_usd`, `input_tokens`, `output_tokens`, `model_tier`. Day 60's cost-eval script aggregates these fields from the log aggregator (Axiom/Datadog). No additional instrumentation is needed.

### Model Name Changes

If Google retires or renames a model, update the env vars (`GEMINI_FLASH_MODEL_NAME`, `GEMINI_FLASH_LITE_MODEL_NAME`, `GEMINI_EMBEDDING_MODEL_NAME`) in your deployment config — no code deploy required.

---

*Vocaply AI Pipeline | Day 46 Foundation | FastAPI + Gemini + Motor + Redis*
