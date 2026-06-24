# Vocaply — Day 18 Full Scalable Industry-Level Build Plan
> The Async Engine: Webhooks, Bull Queues, Workers, Idempotency, Security & Performance
> Document: DAY18-PLAN-001 | Version 1.0 | Planning Only — No Code

---

## 1. Theme & Objective

Day 18 ka core kaam hai: **meeting processing ko fully asynchronous bana dena.** Recall.ai bot jab meeting khatam karta hai, woh ek webhook bhejta hai. Us webhook se lekar AI extraction tak ka pura safar — transcript storage, queueing, worker pickup, status updates, real-time UI updates — sab kuch non-blocking, retryable, idempotent, aur horizontally scalable hona chahiye.

Goal of the day: design and build the **async backbone** of Vocaply — the part of the system that lets 1 meeting or 1,000,000 meetings flow through the same pipeline without ever blocking an HTTP request, losing a job, double-processing an event, or leaking data across tenants.

This document is a **planning blueprint only** — no code. It defines what gets built, why, how it must behave under scale, and the security/performance bar every module must meet before being marked "done."

---

## 2. Why This Day Matters

```
IF DONE WRONG                         IF DONE RIGHT
─────────────────────────────────────────────────────────────────
Webhook timeout → Recall.ai retries   Webhook ACKs in <100ms always
Duplicate events → duplicate data     Idempotent — same event, same result
One slow meeting blocks others        Queues isolate slow work from fast
Worker crash loses in-flight job      Jobs persist in Redis until ack'd
No retry → permanent data loss        Exponential backoff + DLQ
Spoofed webhook → fake data injected  HMAC signature + replay window
Can't see what's stuck                BullBoard + structured logs + alerts
```

Everything downstream (AI extraction, notifications, integrations, billing) depends on this layer being rock solid. A bug here doesn't just break one feature — it silently corrupts data across the entire product.

---

## 3. System Architecture for Today's Build

```
Recall.ai / Stripe / Jira (External)
        │
        ▼
[Webhook Ingestion Layer]  ← signature verify, idempotency check, fast ACK
        │
        ▼
[Bull Queue Layer]  ← Redis-backed, 5 queues, priority + retry policy
        │
        ▼
[Worker Pool]  ← horizontally scalable, concurrency-tuned, stateless
        │
        ├──→ MongoDB (transcript storage)
        ├──→ PostgreSQL (meeting/commitment state)
        ├──→ Socket.io (real-time push to dashboard)
        └──→ Next queue (chained: transcribe → extract → notify → integrate)
```

Design principle for the day: **every box above must be independently scalable, independently observable, and independently failable without taking down the rest of the system.**

---

## 4. Functional Scope — What Gets Built Today

### 4.1 Webhook Ingestion Layer
- Inbound webhook receiver for **Recall.ai** (bot lifecycle events).
- Inbound webhook receiver for **Stripe** (billing/subscription lifecycle events).
- Shared webhook infrastructure: raw-body preservation, signature verification middleware, idempotency middleware, structured event logging — reusable for future providers (Jira, Slack) without rewriting the ingestion pattern.
- Fast-acknowledge contract: every webhook responds within the provider's expected window (Recall.ai: <5s; Stripe: <10s) regardless of how long downstream processing takes.

### 4.2 Queue Infrastructure
- Five production queues defined with distinct retry/backoff/priority policies:
  1. `transcribe` — store + enrich transcript
  2. `extract` — AI extraction trigger (mock today, real Day 46+)
  3. `notify` — outbound notifications (scaffold)
  4. `integrate` — third-party sync (scaffold)
  5. `deadline` — cron-driven commitment deadline sweep (scaffold)
- Each queue has its own dead-letter handling, job retention policy, and concurrency ceiling.
- Queue client is a **singleton connection module** — no duplicate Redis connections per request.

### 4.3 Worker Processes
- `transcribe.worker` — fully functional: pulls raw transcript from MongoDB, resolves speaker tags to user identities using meeting participant data, writes enriched transcript back, hands off to `extract` queue.
- `extract.worker` — functional scaffold: receives job, marks meeting `DONE`, writes placeholder AI result, emits real-time event, hands off to `notify` queue. (Designed so Day 46+ AI logic can be swapped in without changing the queue contract.)
- `notify.worker`, `integrate.worker`, `deadline.worker` — scaffolded with correct job contracts, concurrency settings, and error handling shape, but business logic deferred.

### 4.4 Real-Time Event Emission
- Every meaningful state transition (`BOT_JOINING`, `RECORDING`, `PROCESSING`, `DONE`, `FAILED`) emits a Socket.io event to the owning team's room — never to the wrong tenant.
- Event emission is decoupled from the HTTP response cycle entirely; it happens inside workers, not inside the webhook handler.

### 4.5 Admin / Observability Tooling
- BullBoard (or equivalent queue dashboard) wired up behind authentication, disabled by default in production, toggleable per environment.
- Structured logs for every webhook receipt, every job start/complete/fail, every idempotency skip.

---

## 5. API & Endpoint Inventory

```
ENDPOINT                  METHOD   AUTH                 PURPOSE
─────────────────────────────────────────────────────────────────────────────
/webhooks/recall          POST     HMAC signature only   Bot lifecycle events
/webhooks/stripe          POST     Stripe signature only,idempotency Billing lifecycle events
/admin/queues             GET      Bearer (internal)     BullBoard dashboard (non-prod)
/health                   GET      None                  Liveness probe (existing)
/ready                    GET      None                  Readiness incl. Redis/Mongo check
```

Notes:
- Webhook endpoints are **deliberately excluded** from standard JWT auth middleware — they use signature verification instead, registered as a separate route group with its own raw-body parsing configuration.
- No new customer-facing REST endpoints are introduced today — this is purely the internal processing spine. (Customer-facing job status endpoints like `GET /jobs/:id` are out of scope for Day 18; they were defined in the broader API design and will be wired to this same queue data later.)
- `/ready` should be extended today to check Redis and MongoDB connectivity specifically, since this day introduces hard dependencies on both.

---

## 6. Core Business Logic To Implement

### 6.1 Meeting State Machine Transition Logic
- Enforce the existing state machine strictly inside the webhook handlers: `SCHEDULED → BOT_JOINING → RECORDING → PROCESSING → DONE/FAILED`.
- Every transition must validate the **current** state before applying the **next** state — never blindly overwrite status. A `bot.recording_started` event arriving twice (duplicate delivery) must not double-apply side effects.
- Terminal states (`DONE`, `CANCELLED`) are immutable from webhook handlers — only an explicit admin reprocess action may move out of them.

### 6.2 Webhook Signature Verification
- HMAC-SHA256 verification for Recall.ai using the raw, unparsed request body (not the JSON-parsed object — signature must be computed over exact bytes received).
- Stripe SDK-native signature verification (constructEvent) using the Stripe webhook secret.
- Constant-time comparison for all signature checks — never use simple string equality (timing attack surface).
- Reject-fast: signature failure returns an error response immediately, before any business logic executes, and is logged as a security event (not just a normal error).

### 6.3 Idempotency & Deduplication Logic
- Every inbound webhook event is keyed by a deterministic idempotency key (provider + event type + external ID, e.g., `botId + event` for Recall, `event.id` for Stripe).
- Idempotency state lives in Redis with a TTL long enough to cover the provider's realistic retry window (24h is the safe default both providers use).
- Idempotency check happens **before** any database write — duplicate webhook deliveries must be a no-op, not a partial-reapply.
- This same idempotency pattern must be reusable for future inbound webhooks (Jira, Slack) — design it as a shared utility, not Recall-specific code.

### 6.4 Speaker-to-User Resolution Logic
- Map Recall.ai's anonymous `speaker_tag` labels ("Speaker 1") to actual Vocaply user records using the `meeting_participants` table (matched by email first, fallback to fuzzy name match already defined in the LLD).
- Unresolved speakers (confidence below threshold) must be explicitly flagged, never silently dropped or silently mismatched to the wrong person — wrong attribution of a commitment is a trust-breaking bug.
- This resolution must happen inside the worker, not inside the webhook handler — keeps the webhook fast and the resolution logic testable in isolation.

### 6.5 Retry & Backoff Logic
- Each queue gets a deliberately different retry policy based on the cost/urgency of the work it does (transcription vs. notification vs. integration sync) — not a single blanket policy copy-pasted everywhere.
- Exponential backoff with provider-appropriate base delays; jobs that exhaust retries land in a dead-letter state for manual inspection rather than disappearing.
- Failure of a downstream queue push (e.g., transcribe succeeds but the push to extract queue fails) must not silently lose the transcript — the worker should be written so the chain is resumable from the stored MongoDB state, not solely reliant on the queue hop succeeding.

### 6.6 Stripe Billing Event Logic
- Subscription created/updated → resolve Stripe price ID to internal plan tier, update team plan, reset usage counters at the correct billing-cycle boundary, invalidate the team's cached plan data.
- Subscription cancelled → downgrade to FREE plan, preserve historical data, do not silently delete anything.
- Payment failed → route into the same `notify` queue contract so billing alerts use the identical delivery infrastructure as meeting notifications (no separate bespoke email-sending path).

---

## 7. Scalability Architecture

### 7.1 Horizontal Worker Scaling
- Workers must be **stateless** — no in-memory state that would break if two instances of the same worker run simultaneously across machines. Anything that needs to persist lives in Redis, MongoDB, or PostgreSQL.
- Concurrency per worker process is tuned per queue type, not uniform: lighter, I/O-bound work (transcribe) gets higher concurrency; heavier work (extract, once real AI calls land) gets lower concurrency to avoid overwhelming the AI pipeline or hitting provider rate limits.
- Worker deployment is designed so additional worker replicas can be added purely by scaling the container/process count — no code change required to add throughput.

### 7.2 Queue Partitioning & Priority
- Priority levels are assigned deliberately: deadline/time-sensitive work (e.g., bot status updates feeding real-time UI) is not starved behind bulk/non-urgent work (e.g., integration sync).
- Queues are logically separated by **failure domain** — a Jira outage stalling the `integrate` queue must never block or slow down the `transcribe` or `extract` queues. This separation is the single most important scalability decision of the day.

### 7.3 Database Access Patterns
- Worker DB writes should be designed to avoid N+1 query patterns when resolving participants/speakers — fetch all participants for a meeting in one query, build an in-memory map, then iterate over transcript turns.
- All writes remain tenant-scoped (`team_id` always present) so the multi-tenant isolation guarantees from the database design hold even inside async workers, not just inside HTTP request handlers.
- Heavy aggregate writes (e.g., updating denormalized counts) should be designed as single batched updates rather than one query per row wherever the data shape allows it.

### 7.4 Multi-Tenant Isolation in Queues
- Job payloads always carry `teamId` explicitly — never inferred from ambient request context, since workers run outside any HTTP request lifecycle.
- Socket.io emission targets the specific `team:{teamId}` room exclusively — there is zero global broadcast path for any event derived from webhook processing.
- Redis keys (idempotency, dedup, caching) used by this pipeline are namespaced consistently so no team's processing state can collide with another's.

### 7.5 Connection Pooling
- Redis connection for BullMQ is a dedicated, reused connection object — not opened fresh per job or per request.
- MongoDB and PostgreSQL clients used inside workers are the same pooled singleton clients used elsewhere in the service, sized appropriately for worker concurrency (pool size must be ≥ total worker concurrency across all queues to avoid connection starvation under load).

---

## 8. Security Architecture

### 8.1 Webhook Hardening
- Raw body must be captured **before** any JSON body-parsing middleware runs for webhook routes specifically — this route group is configured separately from the rest of the API so the exact bytes are available for signature verification.
- No webhook route ever trusts a `teamId` or `userId` value sent inside the payload for authorization purposes — trust is established only via signature, and tenant context is derived server-side by looking up the bot/customer ID against Vocaply's own records.

### 8.2 Secrets Management
- `RECALL_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET` are environment-only secrets, never logged, never included in error messages returned to any client, validated at process startup (fail-fast if missing) rather than discovered missing at the first real webhook call.
- BullBoard's access secret follows the same rule — never hardcoded, never the literal placeholder value in any environment beyond local dev.

### 8.3 Replay Attack Protection
- Stripe signature verification inherently includes a timestamp tolerance check — this must not be disabled or loosened.
- For Recall.ai (which doesn't include a timestamp in the same way), the idempotency-key approach effectively serves as replay protection: a resent identical event is a guaranteed no-op rather than a reprocess.

### 8.4 Rate Limiting & Abuse Prevention
- Webhook endpoints sit behind IP-level rate limiting at the gateway/middleware layer like every other route, sized generously enough not to throttle legitimate provider bursts, but present so a misconfigured or malicious sender cannot flood the ingestion layer and starve queue workers.
- Failed signature verifications are logged distinctly from normal errors so repeated failures from the same source can be flagged as a potential probing attempt.

### 8.5 Data Handling Security
- Transcript content stored in MongoDB during this phase carries no additional encryption beyond the platform's standard at-rest encryption — but speaker emails/names inside transcripts are treated as PII and excluded from any verbose debug logging.
- Webhook payload bodies are never logged in full at `info` level — only event type, provider, and identifiers are logged; full payload logging (if ever needed) is gated behind a debug flag that is off by default.

### 8.6 Least Privilege & Network Security
- The webhook routes and the BullBoard admin route are configured with distinct access models — webhook routes are public-but-signed, the admin route is private-and-authenticated, and the two must never share a code path that could let one bypass the other's protection.
- Outbound calls the workers make (to MongoDB, PostgreSQL, Redis, and later to the AI pipeline) use internal network addressing where the infrastructure allows it, not public endpoints, reducing exposure surface.

---

## 9. Performance Optimization Strategy

### 9.1 Non-Blocking Webhook Acknowledgment
- The HTTP response to the webhook provider is sent **immediately after signature + idempotency checks**, before any business logic (DB writes, queue pushes) executes. This is the single biggest latency win of the day and is non-negotiable — a slow downstream step must never delay the ACK.

### 9.2 Caching Layer
- Team plan/quota data touched indirectly by billing webhooks is invalidated in Redis rather than re-fetched synchronously inside the webhook handler — cache invalidation is a cheap async operation, not a blocking read-modify-write inside the hot path.

### 9.3 Batch & Bulk Operations
- Speaker map construction during transcript enrichment is built once per job from a single participant query, then applied to every transcript turn in memory — not one DB lookup per turn.
- Where multiple records need updating together (e.g., meeting status + timing fields), they are written as a single combined update rather than multiple round trips.

### 9.4 Concurrency Tuning
- Each worker's concurrency value is treated as a tunable, environment-driven setting (not a hardcoded magic number) so it can be adjusted per deployment size without a code change — light queues higher, heavy/expensive queues lower.
- Backoff delays are tuned so retries don't create thundering-herd spikes against downstream services after a transient outage recovers.

### 9.5 Payload Size Management
- Large transcripts are stored once in MongoDB and referenced by ID in every subsequent job payload — job payloads passed through Redis/BullMQ stay small (IDs and metadata only), never the full transcript blob, keeping queue throughput high and Redis memory pressure low.

---

## 10. Reliability & Fault Tolerance

### 10.1 Retry Policy Design
- Retry counts and backoff curves are chosen per queue based on how expensive/risky a retry is: cheap idempotent work can retry more aggressively; work with side effects (like notifications) retries fewer times with longer gaps to avoid spamming.

### 10.2 Dead Letter Queue Strategy
- Jobs that exhaust all retries are not silently dropped — they remain inspectable (via BullBoard / failed job retention) so an engineer can diagnose and manually replay them if needed, rather than the meeting silently getting stuck forever with no visibility.

### 10.3 Circuit Breaker Pattern
- Even though full AI pipeline integration is deferred, today's `extract.worker` scaffold should be structured so that when the real downstream call is added later, repeated failures naturally pause/back off rather than hammering a struggling dependency — the worker shape (try/catch + throw-to-retry) is designed with this future need in mind.

### 10.4 Graceful Degradation
- If MongoDB transcript storage fails, the meeting must land in a clearly visible `FAILED` state with an error reason captured — never silently stuck in `PROCESSING` indefinitely with no signal to the user or the team.
- If Socket.io emission fails for any reason, it must never throw and block the underlying state update — real-time notification is a nice-to-have layered on top of the source-of-truth database write, not a dependency of it.

---

## 11. Observability & Monitoring

### 11.1 Structured Logging
- Every webhook receipt, every job lifecycle event (start, complete, fail, retry), and every idempotency skip is logged in a consistent structured format including: provider, event type, meeting/team identifiers, job ID, and outcome — enabling log-based debugging without needing to reproduce the issue.

### 11.2 Correlation IDs / Tracing
- A correlation/request identifier flows from the original webhook receipt through the entire job chain (transcribe → extract → notify) so a single meeting's full processing journey can be reconstructed from logs alone.

### 11.3 BullBoard / Job Dashboard
- Provides a visual, real-time view of queue depth, active jobs, failed jobs, and retry counts — used today for verification and going forward as the first stop for diagnosing a "my meeting is stuck" support ticket.

### 11.4 Alerting Rules (Forward-Looking Design)
- Today's logging/structure should be compatible with future alerting thresholds already defined in the broader system design (e.g., webhook failure rate spikes, queue depth growth) — even though wiring actual alerts is a later milestone, nothing built today should make that wiring harder.

---

## 12. Coding Standards for Today's Modules

- **Single Responsibility per file**: webhook handler only translates provider events into internal actions; it never contains business logic that belongs in a service/worker.
- **No business logic in route handlers** — routes/controllers stay thin; the actual decision-making (state transitions, resolution logic) lives in dedicated service functions that are independently unit-testable.
- **Pure functions where possible**: helpers like building enriched transcript text, mapping price IDs to plans, or computing duration should be side-effect-free and easy to test without spinning up Redis/Mongo.
- **Explicit typing for every job payload** — no `any`-typed data crossing a queue boundary; the contract between "what gets pushed" and "what a worker expects" must be enforced at compile time, not discovered at runtime.
- **No silent catch blocks** — every caught error is logged with enough context to act on; swallowing errors silently is treated as a bug, not a safety net.
- **Consistent naming convention** carried over from the rest of the codebase (`*.worker.ts`, `*.job.ts`, `*.webhook.ts`, `*.service.ts`) so any engineer can predict where a given piece of logic lives without searching.
- **Idempotent-by-default mindset**: every new piece of logic added today is designed assuming it may run twice for the same input — because in a distributed, retry-driven system, it eventually will.

---

## 13. File / Module Structure To Create

```
services/api/src/queues/
  queue.client.ts                  ← all 5 queue definitions + shared connection
  jobs/
    transcribe.job.ts               ← job payload contract
    extract.job.ts                  ← job payload contract
    notify.job.ts                   ← job payload contract
    integrate.job.ts                ← job payload contract (scaffold)
    deadline.job.ts                 ← job payload contract (scaffold)
  workers/
    transcribe.worker.ts            ← fully functional
    extract.worker.ts               ← functional scaffold (mock AI)
    notify.worker.ts                ← scaffold
    integrate.worker.ts             ← scaffold
    deadline.worker.ts              ← scaffold

services/api/src/modules/webhooks/
  recall.webhook.ts                 ← Recall.ai event handler
  stripe.webhook.ts                 ← Stripe event handler
  webhooks.validator.ts             ← shared signature verification utilities
  webhooks.routes.ts                ← route registration, raw-body config

services/api/src/services/
  mongo.service.ts                  ← transcript read/write operations

services/api/src/config/
  bull-board.ts                     ← queue monitoring dashboard wiring
```

This structure deliberately mirrors the modular pattern already established across the rest of the backend (controller/service separation, job-type isolation, shared validators) so Day 18's output integrates cleanly with everything built on prior days.

---

## 14. Hour-by-Hour Execution Plan

```
9:00 – 10:00   Queue infrastructure: define all 5 queues, connection singleton,
               retry/backoff/priority policy per queue, queue-level event logging
10:00 – 11:00  Recall.ai webhook: route setup with raw-body capture, signature
               verification utility, idempotency check, event router skeleton
11:00 – 12:00  transcribe.worker: MongoDB fetch, participant lookup, speaker
               map construction, transcript enrichment, hand-off to extract queue
12:00 – 1:00   Lunch
1:00 – 2:00    extract.worker scaffold: mock processing, meeting status → DONE,
               MongoDB update, Socket.io emission, hand-off to notify queue
2:00 – 3:00    notify.worker scaffold: contract + concurrency + error handling
               shape (business logic deferred to Day 19)
3:00 – 4:00    integrate.worker + deadline.worker scaffolds: same pattern,
               contracts only
4:00 – 5:00    Stripe webhook: signature verification via SDK, idempotency,
               subscription created/updated/deleted handling, plan cache
               invalidation, payment failed → notify queue hand-off
5:00 – 5:30    BullBoard wiring: dashboard route, auth gate, disabled-by-default
               in production
5:30 – 6:00    End-to-end manual test pass + structured-logging spot check +
               Day 18 checklist sign-off
```

---

## 15. Testing & Verification Plan

```
SIGNATURE VERIFICATION
  - Valid signature accepted, invalid rejected, missing header rejected
  - Tampered body (same signature, different bytes) rejected

IDEMPOTENCY
  - Same event delivered twice → only one set of side effects observed
  check for payment
  - Different event for same bot/meeting → processed independently

STATE MACHINE
  - Out-of-order or duplicate lifecycle events do not corrupt meeting status
  - Terminal-state meetings are not mutated by late/duplicate webhooks

WORKER CHAIN
  - transcribe → extract → notify hand-off verified end-to-end via BullBoard
  - Speaker resolution produces correct user mapping from known fixture data
  - Failure injected mid-chain (e.g., simulate Mongo write failure) results in
    a clearly FAILED meeting state, not a silently stuck one

MULTI-TENANCY
  - Two different teams' meetings processed concurrently never cross-emit
    Socket.io events or cross-write data

STRIPE
  - Subscription upgrade/downgrade correctly updates team plan and resets
    usage counters at the right boundary
  - Cancelled subscription correctly downgrades to FREE without data loss

LOAD / SCALE SANITY CHECK
  - Multiple webhook events fired in rapid succession do not block each
    other's ACK response time
  - Queue depth and worker concurrency behave predictably under a burst of
    simulated meetings ending simultaneously
```

---

## 16. Definition of Done — End of Day Checklist

```
ARCHITECTURE
  [ ] All 5 queues exist with distinct, justified retry/priority policies
  [ ] Worker processes are stateless and horizontally scalable by design
  [ ] Job payloads carry team/tenant context explicitly, never inferred

WEBHOOKS
  [ ] Recall.ai webhook: signature verified, fast-ACK'd, idempotent, routed
  [ ] Stripe webhook: signature verified, fast-ACK'd, idempotent, routed
  [ ] Raw body correctly preserved for signature checks on both routes

SECURITY
  [ ] No secret values logged or exposed in any response
  [ ] Signature failures logged distinctly as security-relevant events
  [ ] Webhook routes never trust client-supplied tenant identifiers

PERFORMANCE
  [ ] Webhook ACK happens before any heavy downstream work executes
  [ ] No N+1 query pattern in speaker/participant resolution
  [ ] Job payloads stay small; large data referenced by ID, not inlined

RELIABILITY
  [ ] Exhausted retries land in an inspectable failed state, not silently lost
  [ ] Meeting never gets stuck in PROCESSING with zero error signal
  [ ] Socket.io emission failures never block the underlying state write

OBSERVABILITY
  [ ] BullBoard accessible (non-prod) and shows live job movement
  [ ] Structured logs present for every webhook + job lifecycle event
  [ ] A single meeting's processing journey is traceable end-to-end in logs

SIGN-OFF
  [ ] Full manual end-to-end test passes: simulated Recall.ai event → meeting
      reaches DONE with correct enriched transcript and emitted real-time event
```

---

## 17. Risks & Edge Cases To Handle

```
RISK                                          MITIGATION BUILT TODAY
─────────────────────────────────────────────────────────────────────────────
Duplicate webhook delivery                    Idempotency key per event
Out-of-order webhook delivery                 Strict state-machine guards
Bot fails mid-recording                       bot.failed → FAILED + notify hook
Unresolvable speaker (no email match)         Flagged, not silently misassigned
Worker crash mid-job                          Job remains in queue until ack'd
Downstream queue push fails after success     Resumable from persisted Mongo state
Webhook flood / malicious sender              Rate limiting + signature reject-fast
Stripe event for unknown team                 Defensive lookup, log + skip safely
Production accidentally exposing BullBoard    Disabled by default outside dev/staging
```

---

*Document: DAY18-PLAN-001 | Vocaply | 100-Day Build Plan — Day 18*
*Scope: Async Webhook & Queue Engine | Planning Document — Implementation Follows Day 19+*
Done

