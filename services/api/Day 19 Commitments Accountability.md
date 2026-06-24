# Day 19 — Commitments & Accountability Engine
> Full Scalable, Industry-Grade Build Plan (Plan Only — No Code)
> Module: Commitments API | Vocaply Backend Sprint
> Standard: 1M+ users, multi-tenant SaaS, zero cross-tenant leakage, sub-150ms hot paths
> Document: DAY19-PLAN-001 | Version 1.0

---

## Table of Contents

1. Objective
2. Functional Scope — What Gets Built Today
3. Complete API Surface (Endpoint-by-Endpoint Spec)
4. Core Business Logic to Implement
5. Data Layer Strategy (Repository, Indexes, Query Patterns)
6. Scalability Architecture
7. Security Architecture
8. Performance & Speed Optimization
9. Reliability & Failure Handling
10. Observability & Monitoring
11. Testing Strategy
12. Hour-by-Hour Build Order
13. Definition of Done — Final Checklist

---

## 1. Objective

Day 19 builds the **Commitments module end-to-end** — the single most important feature in Vocaply, since it is the core differentiator versus Fireflies, Otter, and Grain. Everything built today must meet four non-negotiable bars before it is considered "done":

- **Correct** — filters, state machine, and score math behave exactly as specified, with no silent edge-case failures.
- **Secure** — no tenant can ever read or mutate another tenant's data, no member can act outside their authorized scope, and every mutation leaves an audit trail.
- **Scalable** — every query, cron job, and side-effect is designed so that performance does not degrade as commitments grow from thousands to tens of millions of rows.
- **Fast** — read endpoints stay under their latency budget under realistic concurrent load, and slow work is never done inline on the request path.

This plan covers what to build, in what order, and — critically — *how* to build it so it survives production scale, not just local testing.

---

## 2. Functional Scope — What Gets Built Today

| # | Capability | Why It Matters |
|---|---|---|
| 1 | Commitment listing & filtering engine (10+ filter dimensions, cursor pagination) | Powers the team commitment tracker dashboard |
| 2 | "My Commitments" personal view | Powers the member's own accountability widget |
| 3 | Manager-only team statistics + per-member breakdown + weekly trend | Powers team health analytics |
| 4 | Single commitment detail endpoint | Powers commitment detail / timeline view |
| 5 | Status transition engine (state machine) with role-based authorization | The actual accountability mechanism |
| 6 | Commitment Score algorithm (recency-weighted, on-time bonus, trend) | Differentiating IP — "who actually keeps promises" |
| 7 | Deadline automation — 9AM reminder cron + 6PM auto-miss cron | Removes the need for managers to manually chase people |
| 8 | Real-time propagation of every status/score change | Keeps dashboards live without polling |
| 9 | Downstream side-effects — Jira sync trigger, notification dispatch, score recalculation | Closes the loop between meeting → promise → resolution |

Nothing in this list ships as a "v1 we'll harden later" — security, indexing, and queue-offloading are built in on day one, because retrofitting them onto a live accountability engine with growing historical data is expensive and risky.

---

## 3. Complete API Surface (Endpoint-by-Endpoint Spec)

### 3.0 Summary Table

| Method | Path | Auth | Role Required | Idempotent | Latency Budget (P95) |
|---|---|---|---|---|---|
| GET | `/commitments` | Required | any (tenant-scoped) | Yes | < 150ms |
| GET | `/commitments/my` | Required | any | Yes | < 100ms |
| GET | `/commitments/stats` | Required | MANAGER+ | Yes | < 400ms (cached) |
| GET | `/commitments/:commitmentId` | Required | any (tenant-scoped) | Yes | < 80ms |
| PATCH | `/commitments/:commitmentId/status` | Required | MEMBER (own only) / MANAGER+ (any) | Yes, with `X-Idempotency-Key` | < 200ms (excluding async side-effects) |

### 3.1 `GET /commitments` — List & Filter

- **Purpose**: Primary feed for the team commitment tracker. Must support every filter a manager or member needs without ever requiring a full table scan.
- **Filter dimensions**: status (exact + `in` list), ownerId, meetingId, overdue flag, date range (from/to), free-text search, minimum confidence score, sort field + direction, cursor + limit.
- **Authorization rule**: Any authenticated team member may *read* the full team's commitment list (read access is team-wide; *write* access is restricted later in the status-update endpoint). Tenant scoping is mandatory and non-optional — the `teamId` filter is injected server-side and is never taken from client input.
- **Response shape**: paginated array of commitment summaries (id, text, status, due date info, confidence, owner summary, meeting summary, timestamps) plus a `meta` block containing pagination cursors **and** a status-count breakdown (`PENDING`, `FULFILLED`, `MISSED`, `DEFERRED` counts) so the UI can render filter tabs without a second round trip.
- **Error handling**: invalid/unknown filter field → 422 with the list of valid fields; malformed cursor → 422; no results → 200 with empty array (never 404 for an empty list).
- **Performance note**: status-count aggregation in `meta` must be computed via a single grouped aggregate query, not by re-running the list query four times.

### 3.2 `GET /commitments/my` — Personal View

- **Purpose**: Drives the "my open commitments" widget and the personal accountability page.
- **Behavior**: identical filter capability to the list endpoint, but `ownerId` is always forced to the authenticated user's id server-side — never accepted from the client, even if passed.
- **Response addition**: a `summary` block (`pending`, `overdue`, `fulfilled`, `missed` counts for the current user) computed in the same query pass as the list, not as a separate round trip.
- **Performance note**: this is the highest-frequency endpoint in the whole module (loaded on every dashboard visit) — it must be backed by the composite index on (teamId, ownerId, status) and should be eligible for a short-lived cache (a few seconds) since dashboard reloads happen far more often than commitments actually change.

### 3.3 `GET /commitments/stats` — Team Statistics

- **Purpose**: Manager-facing analytics — team fulfillment rate, per-member leaderboard, weekly trend chart.
- **Authorization rule**: gated to `MANAGER+` only — this is sensitive performance data about individual employees and must never be visible to plain `MEMBER` role.
- **Computation strategy**: team-level aggregate (total/fulfilled/missed/pending, fulfillment rate, average days overdue) for the requested period; per-member breakdown sorted by fulfillment rate descending; a 7-point weekly trend series.
- **Scalability decision**: the weekly trend series should **not** be computed by scanning raw commitment rows live. It should read from a pre-aggregated weekly snapshot table that is written once per week by a background job. This converts an O(all historical commitments) query into an O(number of weeks requested) lookup, which is the difference between this endpoint staying fast at 10,000 commitments versus 10,000,000.
- **Caching**: response cached per `(teamId, period)` key for several minutes — this is expensive aggregation data that does not need to be real-time to the second.

### 3.4 `GET /commitments/:commitmentId` — Detail View

- **Purpose**: Full detail page including resolution history (which meeting resolved it, if any).
- **Security rule**: the lookup must filter by `teamId` in the same query as the `id` lookup. If the row exists but belongs to a different team, the correct response is **404, never 403** — returning 403 would confirm the resource exists, leaking information about other tenants' data through enumeration.

### 3.5 `PATCH /commitments/:commitmentId/status` — Status Transition

This is the most complex and most security-sensitive endpoint in the module — full detail in Section 4.2 and Section 7.

- **Purpose**: the actual mechanism of accountability — marking a promise fulfilled, deferred, or cancelled.
- **Authorization rule**: `MEMBER` role may only transition commitments they own; `MANAGER`, `ADMIN`, `OWNER` may transition any commitment within their own team.
- **Required idempotency**: clients must send a `X-Idempotency-Key` header. A retried request with the same key and same payload must return the original result rather than re-running the transition and re-firing side effects (re-closing a Jira ticket, re-sending a notification, double-counting a score change).
- **Side effects triggered (all asynchronous, never inline)**: score recalculation, Socket.io broadcast to the team room and the owner's personal room, notification dispatch, and — if the commitment is linked to a synced Jira/Linear issue — a sync job to close the external ticket.

---

## 4. Core Business Logic to Implement

### 4.1 Filter & Query Builder Logic

- Maintain an explicit **whitelist** of filterable and sortable fields. Any field not on the whitelist is rejected at validation time with a clear error — this prevents both invalid queries and any possibility of probing internal/sensitive columns through the filter mechanism.
- Cap the number of simultaneous filter conditions (e.g., 10) and the length of free-text search terms (e.g., 200 characters) to prevent pathological queries.
- `teamId` is **never** read from the request — it is derived exclusively from the authenticated session and injected into every query before any user-supplied filter is applied.
- Default sort order is meaningful, not arbitrary: surface `MISSED` first, then `PENDING` ordered by soonest due date, then everything else — this matches what a manager actually wants to see first when opening the page.

### 4.2 Status Transition State Machine

| From | Allowed To | Extra Requirement |
|---|---|---|
| PENDING | FULFILLED | — |
| PENDING | DEFERRED | future `newDueDate` required |
| PENDING | CANCELLED | `note` required (audit trail) |
| DEFERRED | FULFILLED | — |
| DEFERRED | CANCELLED | `note` required |

- `PENDING` and `MISSED` can **never** be set manually through this endpoint — they are system-managed states (set on creation and by the deadline cron respectively). Any request attempting to set them is rejected at validation.
- Every transition is wrapped in a single database transaction: the status change, the deferred-count increment, and the "first deferral" original-due-date capture must all succeed or all fail together — no partially-applied state machine writes.
- **Concurrency safety**: because two managers could theoretically act on the same commitment at the same time, the update should be conditioned on the commitment's *current* known status (an optimistic check) rather than blindly overwriting — if the row's status has already changed since it was read, the transition is rejected with a conflict rather than silently clobbering a concurrent change.

### 4.3 Commitment Score Algorithm (Conceptual Specification)

- **Window**: trailing 30 days of the owner's commitments.
- **Quality filter**: commitments with AI confidence below 0.5 are excluded from scoring entirely — a low-confidence extraction should never unfairly damage or inflate someone's accountability score.
- **Base fulfillment rate**: fulfilled ÷ (fulfilled + missed), excluding still-pending items since they haven't been decided yet.
- **Recency weighting**: activity in the last 7 days counts at full weight (1.0); activity from 7–30 days ago counts at reduced weight (0.7) — this rewards *current* behavior more than stale history, so someone who improved last week sees that reflected quickly.
- **On-time bonus**: up to +10 points added based on what fraction of fulfilled commitments were resolved before their due date, not just eventually fulfilled.
- **Final score**: clamped to the 0–100 range.
- **Trend classification**: compare this week's rate to the prior week's rate — a swing of more than 5 points in either direction is classified `improving` or `declining`; otherwise `stable`.
- **Denormalization decision**: the computed score is written back to the user's row immediately, so every other part of the system (dashboards, member tables, leaderboards) reads a pre-computed value instead of recalculating on every page load. Recalculation is triggered only by status-change events and by a nightly full recalculation pass that corrects any drift.

### 4.4 Stats & Aggregation Logic

- Team-level aggregate, per-member breakdown, and weekly trend are computed in a single coordinated service call, not three independent endpoints making three independent expensive queries.
- Per-member breakdown is sorted by fulfillment rate descending by default — the leaderboard ordering managers actually want.
- As noted in 3.3, the weekly trend portion is sourced from a pre-aggregated snapshot table rather than live computation over raw rows.

### 4.5 Deadline Automation Logic

**9AM reminder pass**
- Find `PENDING` commitments due within the next 24 hours that have not yet had a reminder sent.
- Skip teams on the FREE plan (notifications are a paid-tier feature).
- Deduplicate using a short-lived Redis flag so a retried or overlapping cron run never sends the same reminder twice.
- Queue the actual notification (do not send inline from the cron loop) and mark the reminder as sent.

**6PM auto-miss pass**
- Find `PENDING` commitments whose due date has passed and which have not yet been alerted as missed.
- Perform the status flip as a single **batch update** (not a per-row loop) to minimize database round trips and lock time.
- For each affected commitment, separately: emit a real-time event to the team and the owner, queue a notification (including to that owner's managers), and trigger a score recalculation for the owner.
- Process in bounded batches (e.g., 500 rows per run) so a single cron execution never holds a long-running transaction or floods the notification queue — if more than one batch's worth of work exists, the job continues in the next scheduled run or loops internally with short pauses between batches.
- **Multi-instance safety**: because the API/worker layer runs multiple replicas in production, the cron logic must acquire a short-lived distributed lock before running, so the same batch is never processed twice by two different instances racing each other.

---

## 5. Data Layer Strategy

### 5.1 Repository Responsibilities

The repository layer's only job is translating service-layer intent into database queries — it contains no business rules, no authorization checks, and no side-effect triggering. This separation is what allows the service layer (where the state machine, scoring, and authorization live) to be unit-tested without touching a real database.

### 5.2 Index Coverage Required for This Module

| Query Pattern | Index Needed | Why |
|---|---|---|
| Team commitment list filtered by status | `(team_id, status)` | The single most common read pattern |
| "My commitments" personal view | `(team_id, owner_id, status)` | Second most common read pattern |
| 9AM reminder cron | partial index `WHERE status = 'PENDING'` on `(team_id, due_date)` | Keeps the scan proportional to *active* commitments, not total history |
| 6PM auto-miss cron | partial index `WHERE status = 'PENDING' AND missed_alert_sent_at IS NULL` on `due_date` | This is the single most latency-critical query in the whole module — must stay sub-10ms regardless of table size |
| Analytics / trend by period | `(team_id, created_at DESC)` | Supports date-range filtering without a full scan |
| Resolution history lookup | index on `resolved_in_meeting_id` | Powers the cross-meeting commitment timeline |

### 5.3 Avoiding N+1 and Over-Fetching

- The list and detail endpoints must fetch owner and meeting summary data via a single joined query, never via a per-row follow-up lookup.
- List queries select only the columns the UI actually renders — never a blanket "select everything" on a table that will eventually hold tens of millions of rows.
- The 6PM cron's batch status update is one `UPDATE ... WHERE id IN (...)` statement, not 500 individual update statements.

### 5.4 Pagination Strategy

- The commitments list uses **cursor-based pagination**, not offset pagination — this domain has a high write rate (new commitments created continuously from every processed meeting), and offset pagination would produce duplicate or skipped rows as new data is inserted between page loads. Offset pagination is reserved for slower-changing, report-style views elsewhere in the system, not here.

---

## 6. Scalability Architecture

- **Cache-aside on hot reads**: the personal "my commitments" summary and the manager stats response are both candidates for short-TTL caching, invalidated on any write that touches the relevant team's commitments rather than on a fixed timer alone.
- **Queue offloading**: every side effect of a status change — notification dispatch, Jira/Linear sync trigger, Socket.io broadcast preparation, score recalculation — is pushed onto a background queue rather than executed inline. The API responds to the client the moment the database transaction commits; everything downstream happens asynchronously. This is what keeps the PATCH endpoint's latency stable even as the number of integrations and notification channels grows.
- **Distributed cron locking**: because the API and worker tiers run multiple horizontally-scaled replicas, both the 9AM and 6PM cron jobs must acquire a Redis-based lock with a short TTL before executing, so only one instance ever runs a given scheduled job in a given window.
- **Bounded batch processing**: both cron jobs process a fixed maximum number of rows per execution and rely on their own progress markers (`reminderSentAt`, `missedAlertSentAt`) to safely pick up where they left off on the next scheduled run — this means the system degrades gracefully under unexpectedly large backlogs instead of timing out or locking the table.
- **Read/write separation for analytics**: the team stats endpoint, being read-heavy and tolerant of a few seconds of staleness, is a natural candidate to be routed to a read replica once one exists, freeing the primary database for write-heavy commitment mutations.
- **Real-time fan-out via Redis adapter**: Socket.io events for commitment and score changes are broadcast through the existing Redis-backed adapter so they reach connected clients regardless of which server instance they're attached to — this module does not introduce any new real-time infrastructure, it reuses the platform's existing multi-server-safe pattern.
- **Snapshot-based trend analytics**: as covered in Section 4.4, the weekly trend chart reads from a small pre-aggregated table rather than scanning the ever-growing raw commitments table — this is the single biggest scalability decision in this module, since without it the stats endpoint would get slower every single month as more history accumulates.

---

## 7. Security Architecture

- **Three-layer tenant isolation** (reused from platform standard, applied strictly in this module): application code explicitly filters by `teamId` on every query; the ORM middleware layer auto-injects `teamId` as a backstop in case any service function forgets; and database row-level security acts as the final safety net if both application layers somehow fail. A bug in any single layer is not enough to leak data across tenants.
- **Resource-ownership authorization (IDOR prevention)**: before any status mutation is allowed, the service layer verifies both that the commitment belongs to the requester's team *and*, for `MEMBER` role specifically, that the requester is the commitment's owner. This check happens server-side on every request — it is never inferred from anything the client sends.
- **Existence-leak prevention**: cross-tenant access to a real resource ID returns 404, not 403 — this denies an attacker the ability to distinguish "this ID doesn't exist" from "this ID exists but belongs to someone else," which prevents resource enumeration attacks.
- **Strict input validation**: every query parameter and request body field is validated against an explicit schema before it touches the data layer, with a hard whitelist of filterable/sortable fields — this closes off any path toward arbitrary query manipulation through the filtering system.
- **Idempotency on mutation**: the status-update endpoint requires an idempotency key, and a replayed request with an identical key and payload returns the original cached result rather than re-executing the transition and re-firing every downstream side effect a second time.
- **Audit trail by design, not as an afterthought**: cancellation requires a note, deferral requires a note and a future date, and every manually-driven transition records *who* made the change (distinguishing human action from system-driven transitions like the auto-miss cron). This is essential for an accountability product — the system itself must be auditable.
- **Notification/dedup safety**: every outbound alert (reminder, missed alert, manager alert) is gated by a Redis dedup key so that retried cron executions, worker restarts, or queue redelivery never result in the same person receiving the same alert multiple times.
- **Data-quality as a security property**: excluding sub-0.5-confidence AI extractions from scoring and statistics isn't just a quality decision — it's a safeguard against a flawed extraction unfairly damaging someone's accountability record, which in an accountability product is a trust and integrity issue, not just a cosmetic one.
- **Rate limiting**: standard per-authenticated-user request limits apply to all five endpoints; the mutation endpoint additionally benefits from idempotency-key deduplication as a second line of defense against rapid repeated submission.
- **No sensitive detail in error responses**: clients receive a stable, machine-readable error code and a generic message; full context (stack traces, internal field names, query details) is captured only in server-side structured logs, never returned to the caller.

---

## 8. Performance & Speed Optimization

- **Denormalized score field**: `commitmentScore` lives directly on the user row, so every dashboard, member table, and leaderboard reads it as a simple field — there is no live recomputation on the read path anywhere in the product.
- **Partial indexes keep hot queries cheap forever**: indexing only the `PENDING` subset for the due-date and cron queries means their cost is tied to the *current working set* of open commitments, not the total historical row count — this is what prevents the deadline cron from getting slower every month as the company's commitment history grows into the millions.
- **Batch over loop**: the auto-miss transition is one batched SQL update touching many rows at once, not hundreds of individual statements — this dramatically reduces database round trips and lock duration during the cron run.
- **Async side effects**: nothing the user is waiting on (notifications, third-party sync, score recalculation, real-time broadcast) happens before the API responds — all of it is queued and processed by workers, so the perceived latency of marking a commitment fulfilled stays low and constant regardless of how many integrations or notification channels exist behind it.
- **Targeted cache invalidation**: when caches are used (personal summary, team stats), invalidation on write targets the specific affected keys rather than flushing broad swaths of cache — this keeps cache hit rates high even under frequent writes.
- **Column-projection over full-row fetches**: list-style queries select only what the UI displays, which matters increasingly as the commitments table grows large and wide.
- **Pre-aggregation over live aggregation for trend data**: as repeated throughout this plan because it is the single highest-leverage decision in the module — a weekly snapshot table turns the slowest possible query pattern (full historical scan) into the fastest possible one (small lookup table read).

---

## 9. Reliability & Failure Handling

- **Cron idempotency by design**: the `reminderSentAt` and `missedAlertSentAt` markers double as both dedup flags *and* crash-recovery checkpoints — if a cron run is interrupted partway through a batch, the next scheduled run naturally skips everything already completed and only picks up the remainder.
- **Transactional integrity on every mutation**: the status update, deferred-count increment, and original-due-date capture either all commit together or none do — there is no code path where the state machine can be left in an inconsistent half-applied state.
- **Queue retry policy for downstream work**: notification and integration-sync jobs use exponential backoff retry with a capped maximum attempt count; jobs that exhaust retries are routed to a failed/dead-letter state for manual review rather than being silently dropped.
- **Graceful degradation on cache/Redis unavailability**: if the dedup or cache layer is temporarily unreachable, the system favors *safe* behavior — falling back to a direct database check or simply re-queuing rather than either crashing the request or silently skipping a notification that should have been sent.
- **Conflict handling on concurrent mutation**: the optimistic concurrency check described in Section 4.2 means a losing concurrent request gets a clear, actionable conflict response rather than silently overwriting another manager's action.

---

## 10. Observability & Monitoring

- **Per-request structured logging**: every API call logs request id, user id, team id, route, status code, and latency — enabling fast root-cause tracing for any reported issue.
- **Cron-specific observability**: each scheduled run logs how many rows it processed, how long it took, and whether it completed or errored — this is what lets the team notice early if a missing index or growing table is starting to slow the deadline engine down, before it becomes a customer-visible incident.
- **Key product metrics to track**: total commitments fulfilled vs. missed (rolling), score recalculation duration, deadline-cron batch size and duration over time, and dedup-key collision rate (a spike here would indicate the distributed lock is failing and the cron is double-firing).
- **Alerting thresholds**: alert if either cron job fails to complete within its expected window, if it fails to run at its expected scheduled time at all, or if error rates on the status-update endpoint exceed a small baseline threshold.

---

## 11. Testing Strategy

- **Unit tests**: full coverage of the state machine's valid and invalid transition matrix; the score algorithm across edge cases (zero commitments, perfect record, all-missed record, recency-weighting correctness, trend boundary conditions).
- **Integration tests**: full request/response coverage for all five endpoints, explicit tests proving a `MEMBER` cannot mutate another member's commitment, explicit tests proving cross-team access to any endpoint returns 404, and an idempotency-replay test proving a duplicate request with the same key does not re-trigger side effects.
- **Load testing targets**: list and personal-view endpoints sustaining their latency budgets under realistic concurrent load; the 6PM cron processing a full batch within its time budget without holding locks long enough to interfere with live traffic.
- **Regression protection on the scoring formula**: fixed input/output snapshot tests so any future tweak to the algorithm is a deliberate, reviewed change rather than an accidental side effect of refactoring.

---

## 12. Hour-by-Hour Build Order

```
9:00 AM  – 10:00 AM   Repository layer + verification of all required indexes exist
10:00 AM – 11:30 AM   Service layer: list / my / detail, including the filter whitelist
                       and tenant-scoping guarantees
11:30 AM – 12:30 PM   Service layer: status-update state machine, authorization checks,
                       transactional update logic, idempotency handling
12:30 PM – 1:00 PM    Lunch
1:00 PM  – 2:00 PM    Score algorithm implementation + unit tests for edge cases
2:00 PM  – 3:00 PM    Stats endpoint: team aggregate, per-member breakdown, trend
                       sourced from snapshot table, response caching
3:00 PM  – 4:00 PM    Controller + routes wiring, validators, rate-limit/idempotency
                       middleware application
4:00 PM  – 5:00 PM    Deadline automation: 9AM reminder pass + 6PM auto-miss pass,
                       including batching and distributed-lock logic
5:00 PM  – 5:45 PM    Security pass: tenant-isolation test, IDOR test, idempotency-replay
                       test, cross-team 404 test
5:45 PM  – 6:15 PM    Load/latency spot-check against budgets in Section 3, observability
                       log field review
6:15 PM  – 6:30 PM    Final checklist sign-off
```

---

## 13. Definition of Done — Final Checklist

**Functional**
- [ ] All five endpoints implemented and reachable under their documented paths
- [ ] Every documented filter on the list endpoint behaves correctly, including combinations
- [ ] Status-count breakdown in list `meta` matches the underlying data
- [ ] Personal summary on `/my` matches the current user's actual open/overdue/fulfilled/missed counts
- [ ] All five valid state transitions work; every invalid transition is rejected with a clear error
- [ ] Deferral without a future date is rejected; cancellation without a note is rejected

**Security**
- [ ] `MEMBER` updating another member's commitment is rejected
- [ ] Cross-team access to any of the five endpoints returns 404, not 403 and not data leakage
- [ ] Replayed idempotency key with identical payload returns the cached result, not a re-run
- [ ] Replayed idempotency key with a different payload is rejected as a conflict
- [ ] Manual-status attribution (`manualStatusById`) is correctly recorded on human-driven transitions and absent on cron-driven ones

**Scalability**
- [ ] Deadline cron processes in bounded batches and is safe to run from multiple instances without double-processing
- [ ] Auto-miss transition uses a single batched update, not a per-row update loop
- [ ] Weekly trend data is sourced from the pre-aggregated snapshot table, not a live scan
- [ ] All required indexes (Section 5.2) exist and are confirmed used by the query planner on the hot-path queries

**Performance**
- [ ] List/my/detail endpoints meet their latency budgets under representative load
- [ ] All status-change side effects (notifications, sync, score recalculation, broadcast) are dispatched asynchronously, never inline
- [ ] Commitment score is read from the denormalized field everywhere it's displayed, never recomputed live on a read path

**Observability**
- [ ] Every cron run logs batch size, duration, and outcome
- [ ] Structured request logs include team/user context for every API call in this module
- [ ] Alerting is wired for cron non-completion and for elevated error rates on the status-update endpoint

---

*Document: DAY19-PLAN-001 | Vocaply | Commitments & Accountability Engine*
*Plan only — implementation to follow this specification exactly*
