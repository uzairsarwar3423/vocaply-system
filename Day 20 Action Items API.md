# Day 20 — Action Items API & Onboarding Experience
## Full Scalable, Industry-Grade Build Plan

> Day 20 sirf "do endpoints aur ek form" ka din nahi hai. Backend side pe Action Items module commitments engine ka twin hai — agar yeh loose likha gaya, Day 36 ki UI aur Day 58 ka Jira sync dono iski galtiyon ka bojh utha-yein ge. Frontend side pe Onboarding wo pehla real screen hai jo user dekhta hai — yeh product ka "first impression" hai. Is din ka kaam invisible engineering (security, indexes, idempotency) aur visible craft (typography, motion, micro-copy) dono ko ek saath production-grade banata hai.

**Document:** BUILD-PLAN-DAY20 | **Project:** Vocaply | **Version:** 1.0 | **Track:** Backend (Action Items + Notification Routing) + Frontend (Onboarding Wizard)

---

## 1. Mission Brief

Day 20 closes out the "core backend" phase's task pairing (Commitments ↔ Action Items) and opens the "core frontend" phase with the very first screen a verified user sees after registration. Two outcomes are shipped:

1. **Action Items API** — a production-grade CRUD + sync surface that mirrors the rigor already established for Commitments (cursor pagination, filtering DSL, tenant isolation, idempotency).
2. **Onboarding Wizard** — a 4-step, fully responsive, accessible, motion-polished flow that takes a brand-new user from "just verified" to "inside the dashboard with a team," following the same design-token system used everywhere else in the product (jarakata plus sans headings, DM Sans body, shadcn/ui primitives, brand green accent).

Both surfaces must read as if they were built by a team that has already shipped this exact pattern a dozen times before — no rough edges, no inconsistent spacing, no unhandled error states.

---

## 2. Definition of Ready (Pre-requisites)

Before writing a single line, confirm these are already true (carried over from prior days):

|
 Dependency 
|
 Source Day 
|
 Verification 
|
|
---
|
---
|
---
|
|
`action_items`
 table + indexes migrated 
|
 Day 15 
|
`idx_ai_team_id`
, 
`idx_ai_assignee_id`
, 
`idx_ai_team_completed`
, 
`idx_ai_team_priority`
, 
`idx_ai_jira_issue`
, 
`idx_ai_linear_issue`
 all present 
|
|
 Commitments engine live (pattern to mirror) 
|
 Day 14 
|
`/commitments`
 endpoints return standard envelope 
|
|
 Bull queues operational 
|
 Day 16 
|
`notify`
, 
`integrate`
 queues registered in 
`queue.client.ts`
|
|
 Deadline + calendar-sync worker scaffolds 
|
 Day 19 
|
 Workers exist, even if calendar-sync is not fully wired 
|
|
 Auth middleware chain (JWT, tenant injection, rate limiting) 
|
 Days 6–10 
|
 Reused as-is — 
**
no changes today
**
|
|
 Shared validators package (
`@vocaply/validators`
) 
|
 Day 1–2 setup 
|
`createTeamSchema`
 already defined; extend, don't duplicate 
|
|
 Env vars present (or feature-flag fallback) 
|
 — 
|
`GOOGLE_CLIENT_ID`
, 
`GOOGLE_CLIENT_SECRET`
, 
`BREVO_API_KEY`
, 
`REDIS_URL`
|

If `GOOGLE_CLIENT_ID`/`SECRET` are missing in an environment, the Connect Calendar step must **degrade gracefully** (button disabled with a tooltip), not throw a 500 — this is a hard requirement, not a nice-to-have.

---

## 3. North Star Outcomes for the Day

|
 Outcome 
|
 Metric 
|
 Target 
|
|
---
|
---
|
---
|
|
 Action Items API is feature-complete 
|
 Endpoint coverage vs. spec 
|
 100% (list, my, update, sync) 
|
|
 Notification routing no longer stubbed 
|
 Worker handles all 3 job types end-to-end 
|
 COMMITMENT_MISSED, DEADLINE_REMINDER, MEETING_PROCESSED 
|
|
 Onboarding completion rate (post-launch proxy) 
|
 Time-to-first-team-created 
|
 < 90 seconds median 
|
|
 Zero blocking errors in onboarding 
|
 Error boundary catch rate 
|
 0 unhandled exceptions in E2E suite 
|
|
 API latency stays in budget 
|
 P95 for list/update endpoints 
|
 < 150ms (per platform SLO) 
|

---

## 4. Architecture Tenets Applied Today

These are inherited from the platform-wide architecture docs and are **non-negotiable** for any code written today:

- **Tenant isolation by default** — every Action Items query is scoped to `team_id` at three layers: application code, Prisma middleware, and PostgreSQL RLS.
- **Optimistic by default (frontend)** — every onboarding mutation updates the UI before the server confirms, with rollback on failure.
- **Streaming/incremental feedback** — slug availability, invite sending, calendar connection all show progressive states (checking → available/taken, sending → sent).
- **Fail gracefully** — every async action has a defined error path with a retry affordance, never a blank screen.
- **Feature isolation** — `action-items` and `onboarding` are independent vertical slices; neither imports from the other or from unrelated features.
- **Async heavy work, never block the request thread** — Jira/Linear/Notion sync is queued, never called synchronously inside the HTTP request lifecycle.

---

## 5. Functional Scope Summary

|
 Layer 
|
 Module 
|
 What Ships Today 
|
|
---
|
---
|
---
|
|
 Backend 
|
 Action Items 
|
 List (filtered, paginated), My Items, Update, Sync-trigger 
|
|
 Backend 
|
 Notifications 
|
`notify.worker`
 fully wired for 3 notification types across email + (Slack-ready) channels 
|
|
 Backend 
|
 Integrations 
|
`integrate.worker`
 scaffold — acknowledges jobs, logs, sets pending state 
|
|
 Backend 
|
 Teams 
|
`GET /teams/check-slug`
 — async slug availability with suggestion 
|
|
 Backend 
|
 Auth 
|
`GET /auth/google-calendar`
 (initiate) + callback scaffold 
|
|
 Frontend 
|
 Onboarding 
|
 4-step wizard: Welcome → Create Team → Invite Team → Connect Calendar 
|
|
 Frontend 
|
 Onboarding 
|
`useOnboarding`
 hook, progress shell layout, guarded step routing 
|
|
 Cross-cutting 
|
 Routing 
|
 All new routes registered in 
`app.ts`
; workers started in 
`server.ts`
|

---

## 6. Backend Build Plan

### 6.1 Module & Layer Architecture

The Action Items module follows the exact same five-file pattern already proven by Auth, Meetings, and Commitments — this consistency is itself a scalability feature (any engineer who has touched one module can immediately navigate another):

|
 File 
|
 Responsibility 
|
 Hard Rule 
|
|
---
|
---
|
---
|
|
`action-items.routes.ts`
|
 Express route wiring only 
|
 No business logic, no Prisma calls 
|
|
`action-items.validator.ts`
|
 Zod schemas for query params + request bodies 
|
 Every public field validated, allow-listed 
|
|
`action-items.controller.ts`
|
 HTTP request/response translation 
|
 Calls service only, never repository directly 
|
|
`action-items.service.ts`
|
 All business rules, ownership checks, side-effect orchestration 
|
 Never imports Express types 
|
|
`action-items.repository.ts`
|
 Prisma queries only 
|
 Returns domain shapes, never raw Prisma internals 
|

Public API of the module is exported only through `index.ts` — no other module may deep-import internals (`eslint-plugin-boundaries` enforces this at lint time, same as the frontend feature-isolation rule).

### 6.2 API Contract — Action Items Endpoints

#### `GET /api/v1/action-items`

|
 Aspect 
|
 Detail 
|
|
---
|
---
|
|
 Auth 
|
 Required (JWT or API key) + 
`injectTenant`
|
|
 Scope 
|
`action_items:read`
|
|
 Role 
|
 any (MEMBER+) 
|
|
 Rate limit tier 
|
 User tier (200 req / 60s) 
|
|
 Pagination 
|
 Cursor-based, default limit 20, max 100 
|
|
 Sort allow-list 
|
`createdAt`
, 
`dueDate`
, 
`priority`
 (anything else → 
`422 UNSORTABLE_FIELD`
) 
|
|
 Cache 
|
 None — always live data 
|

Query parameters:

|
 Param 
|
 Type 
|
 Notes 
|
|
---
|
---
|
---
|
|
`assigneeId`
|
 string 
|
 Filter to one team member 
|
|
`completed`
|
 boolean 
|
 Default behavior: incomplete-first if omitted 
|
|
`priority[in]`
|
 comma list 
|
`LOW,MEDIUM,HIGH,URGENT`
 — validated against enum 
|
|
`meetingId`
|
 string 
|
 Scope to a single meeting 
|
|
`hasJiraTicket`
 / 
`hasLinearIssue`
|
 boolean 
|
 Filters on null-vs-not-null of sync columns 
|
|
`from`
 / 
`to`
|
 ISO date 
|
 Bounds on 
`createdAt`
|
|
`search`
|
 string 
|
 ILIKE on 
`text`
, min 2 / max 200 chars 
|
|
`cursor`
, 
`limit`
|
 — 
|
 Standard platform pagination contract 
|

Response item fields: `id`, `text`, `priority`, `dueDate`, `completed`, `completedAt`, `assignee {id, name, avatarUrl}`, `meeting {id, title, scheduledAt}`, `jiraIssueId`, `jiraIssueUrl`, `linearIssueId`, `notionPageId`, `confidenceScore`, `createdAt`.

#### `GET /api/v1/action-items/my`

Identical contract, hard-filtered server-side to `assigneeId = req.user.id`. Default sort: `priority DESC, dueDate ASC` (most urgent first) — this becomes the data source for the future dashboard "My Action Items" widget, so the sort order is a product decision being locked in today.

#### `PATCH /api/v1/action-items/:actionItemId`

|
 Aspect 
|
 Detail 
|
|
---
|
---
|
|
 Auth 
|
 Required + 
`injectTenant`
|
|
 Idempotency-Key 
|
 Recommended (mutation has a downstream side effect: Jira status sync) 
|
|
 Editable fields 
|
`completed`
, 
`assigneeId`
, 
`dueDate`
, 
`priority`
, 
`text`
 (all optional, partial update) 
|

Domain rules enforced in the **service** layer (not the controller):

- Setting `completed: true` stamps `completedAt = now()` and `completedById = req.user.id` server-side — clients cannot set these directly.
- Setting `completed: false` clears `completedAt`/`completedById` (un-completing is allowed, e.g. accidental click).
- `assigneeId`, if provided, **must** resolve to an active member of the same team — otherwise `422 VALIDATION_ERROR` with field-level detail. Never silently assign cross-tenant.
- If the item already has a `jiraIssueId`/`linearIssueId` **and** `completed` flips to `true`, the service queues an `integrate` job to push the status update outward (today: scaffold-only, see §6.6).
- **Hardening beyond the MVP spec:** while the platform-wide table marks this route as "any" role, this module additionally restricts *reassignment* and *priority changes* to the assignee themself or `MANAGER+`. A `MEMBER` may still mark their own item complete/incomplete or fix a typo in `text`. This narrower rule prevents one team member from silently reassigning another's work.

#### `POST /api/v1/action-items/:actionItemId/sync`

|
 Aspect 
|
 Detail 
|
|
---
|
---
|
|
 Auth 
|
 Required + 
`injectTenant`
|
|
 Idempotency-Key 
|
**
Required
**
 — without it, a network retry could create two Jira tickets for the same item 
|
|
 Body 
|
`{ provider: "JIRA" | "LINEAR" | "NOTION" }`
|
|
 Throttle 
|
 Reuses the platform's documented integration policy: max 
**
1 concurrent sync per team
**
, enforced via a short-TTL Redis lock keyed by 
`teamId`
|
|
 Response 
|
`202`
-style payload: 
`{ provider, status: "queued", queuedAt }`
|
|
 Errors 
|
`422`
 if the named provider integration isn't connected/active (with a 
`reconnectUrl`
, mirroring the existing 
`/integrations/:provider/test`
 UX pattern); 
`429`
 if the per-team throttle is currently held 
|
|
 Usage tracking 
|
 A 
`usage_events`
 row of type 
`INTEGRATION_SYNC`
 is written on every accepted sync request — this is required for the existing billing/usage analytics pipeline, not optional 
|

### 6.3 API Contract — Supporting Endpoints

#### `GET /api/v1/teams/check-slug`

|
 Aspect 
|
 Detail 
|
|
---
|
---
|
|
 Auth 
|
 Required 
|
|
 Rate limit 
|
 Tighter than default — 30 req/60s per user, to deter slug enumeration 
|
|
 Query 
|
`slug`
 (required; format-validated: lowercase letters, numbers, hyphens, 2–50 chars) 
|
|
 Response 
|
`{ available: boolean, suggestedSlug?: string }`
|
|
 Privacy rule 
|
 Never reveal 
*
which
*
 team owns a taken slug — boolean + suggestion only 
|

**Race-condition note (important for industry-grade correctness):** this endpoint is advisory, not authoritative. The database's `UNIQUE` constraint on `teams.slug` remains the single source of truth. Two users can pass the debounced "available" check simultaneously; the `POST /teams` call must still catch a `409 DUPLICATE` and return a friendly error with an auto-suggested alternative (e.g., `techflow-eng-2`), never a raw constraint-violation message.

#### `GET /auth/google-calendar` (initiate) & `GET /auth/google-calendar/callback` (scaffold)

|
 Aspect 
|
 Detail 
|
|
---
|
---
|
|
 Initiate 
|
 Auth required. Generates a cryptographically random state (≥32 bytes), stores it in Redis (
`oauth:state:calendar:{state}`
) with a 10-minute TTL bound to 
`userId`
, then 302-redirects to Google's consent screen with 
`scope=calendar.readonly`
, 
`access_type=offline`
, 
`prompt=consent`
 (guarantees a refresh token on first auth). 
|
|
 Callback (today) 
|
 Verifies and 
**
consumes
**
 (one-time use) the state token before doing anything else. Full token exchange + persistence is Day 56 — today the callback only validates state and redirects to 
`/onboarding/connect-calendar?connected=true`
. 
|
|
 Hard rule 
|
 The redirect target after callback must come from an 
**
allow-list constant
**
, never from a query parameter — this closes an open-redirect vector even in scaffold form. 
|

### 6.4 Domain Rules & Business Logic (Plain-Language Summary)

|
 Rule 
|
 Why it matters 
|
|
---
|
---
|
|
 Action item completion always records who/when server-side 
|
 Audit trail; prevents spoofed completion timestamps 
|
|
 Assignee changes validated against team membership 
|
 Prevents cross-tenant assignment leakage 
|
|
 Sync requests require an active, connected integration 
|
 Prevents wasted Jira API calls and confusing errors 
|
|
 Sync is throttled per team, not per user 
|
 One team's bulk-sync storm cannot affect itself via multiple users clicking simultaneously 
|
|
 Slug availability is advisory; uniqueness is enforced at the DB layer 
|
 Closes the race-condition gap inherent to any "check then act" UX pattern 
|
|
 Notification dedup keys follow the existing 
`notif:dedup:{type}:{userId}:{resourceId}`
 convention 
|
 Reuses an already-battle-tested Redis key design rather than inventing a new one 
|

### 6.5 Notification Routing Engine — Completed Today

The `notify.worker` moves from stub to fully functional for the three job types currently produced by the platform:

|
 Type 
|
 Recipients 
|
 Channel(s) Today 
|
 Dedup TTL 
|
 Notes 
|
|
---
|
---
|
---
|
---
|
---
|
|
`MEETING_PROCESSED`
|
 Managers (email) + team Slack channel (logged as pending, real Slack ships Day 60) 
|
 Email (Resend) 
|
 24h 
|
 Reads team-level Slack integration; if absent, logs and continues — never throws 
|
|
`COMMITMENT_MISSED`
|
 Owner + all managers 
|
 Email 
|
 1h 
|
 Respects per-user 
`notificationPreferences.email.commitmentMissed`
|
|
`DEADLINE_REMINDER`
|
 Owner only 
|
 Email 
|
 24h 
|
 Respects 
`notificationPreferences.email.deadlineReminder`
|

Cross-cutting worker design rules:

- **Preference-aware**: every send checks `notification_preferences` before dispatching; an explicit `false` always wins over a default.
- **Idempotent by construction**: a Redis dedup key is checked *before* any send and set *immediately after acquiring the job*, not after sending — this prevents duplicate sends if the worker crashes mid-send and the job is retried.
- **Never throws on a missing integration**: a team without Slack connected should not fail the whole notification job; each channel attempt is independently guarded.
- **Structured logging on every branch**: every notification attempt logs `requestId`-equivalent context (`teamId`, `userId`, `type`, `channel`, `result`) for observability (see §15).

### 6.6 Integrate Worker — Scaffold for Day 58+

Today's scaffold exists purely to establish the **job contract** that real Jira/Linear/Notion logic will fill in later, without requiring a schema or interface change down the line:

|
 Field 
|
 Purpose 
|
|
---
|
---
|
|
`jobId`
|
 Bull-assigned identifier 
|
|
`teamId`
, 
`actionItemId`
, 
`provider`
|
 Routing context 
|
|
`idempotencyKey`
|
 Carried through from the originating API call so retries are safe 
|
|
`attempt`
|
 For exponential backoff visibility in logs 
|

Scaffold behavior: acknowledge the job, write a structured log line (`integrate.worker: sync acknowledged, real implementation pending Day 58`), and leave the action item's sync columns untouched until the real provider call exists. This is intentional — **no fake success states are ever written to the database.**

### 6.7 Data Layer & Query Engineering

- All list queries filter `team_id` first, matching the leftmost-prefix design of the existing composite indexes: `idx_ai_team_completed (team_id, completed)`, `idx_ai_team_priority (team_id, priority) WHERE completed = FALSE`.
- Assignee and meeting data are eager-loaded via a single Prisma `include`, never fetched in a per-row loop — this is the standard N+1 prevention rule applied consistently across the codebase.
- Cursor pagination uses the same keyset pattern as Commitments and Meetings: `(createdAt DESC, id DESC)` as a composite tiebreaker, guaranteeing stable ordering even when many rows share a timestamp.
- The unique partial index `idx_ai_jira_issue` (and its Linear equivalent) is the mechanism that powers the future Jira reverse-webhook lookup (`jira_issue_id → action_item`) — today's update logic must never write a `jiraIssueId` that could collide with this constraint.
- Tenant isolation triple-check before merge: application-layer `where: { teamId }` clause present → Prisma middleware's `TENANT_TABLES` list includes `ActionItem` → PostgreSQL RLS policy `action_items_team_isolation` active. All three must be verified, not assumed.

---

## 7. Engineering Standards for Scalable, Industry-Grade Code

These are the non-functional standards every file written today must satisfy — this is what separates "it works" from "it scales":

- **Strict layering, no shortcuts.** Controllers never touch Prisma. Services never import Express types. A service that needs HTTP-specific data (e.g., the request IP) receives it as a plain argument, not the `req` object.
- **No silent `any`.** Every function has explicit input and return types. Validation happens once, at the boundary (Zod), and the rest of the call stack trusts the typed shape.
- **Consistent error taxonomy.** All thrown errors extend the existing `AppError` hierarchy (`NotFoundError`, `ValidationError`, `ForbiddenError`, etc.) — no ad-hoc `throw new Error("...")` anywhere in new code, so the global error handler can always produce the standard `{ success: false, error: { code, message } }` envelope.
- **DTO discipline.** Repository methods return domain-shaped objects; the controller/service layer is responsible for shaping the public API response — internal columns (e.g., `assignee_name_raw`, `confidence_score` below the display threshold) are never leaked unintentionally.
- **Allow-list everything dynamic.** Sort fields, filter fields, and included relations are all explicit allow-lists, never derived directly from client input — this is a security control as much as a code-quality one (see §8).
- **Query-key and cache-config discipline (frontend).** Any new server-state hook adds its key to the centralized `queryKeys` factory and its timing to `cacheConfig` — no ad-hoc string arrays scattered through components.
- **Naming conventions held consistently:** `kebab-case` file names, `camelCase` functions/hooks, `PascalCase` components/types, `UPPER_SNAKE` constants — matching the platform-wide convention already in force.
- **Commit hygiene.** Work lands as Conventional Commits (`feat(action-items): add list + sync endpoints`, `feat(onboarding): build 4-step wizard`) so the changelog and future bisecting stay readable.
- **Code review gate for today's PRs** must explicitly confirm: no cross-feature imports, query keys added to the factory, cache config entry present, accessibility labels present on all new form fields, loading/error states defined before the happy path was written, and mobile layout checked at 375px.

---

## 8. Security Architecture

|
 Concern 
|
 Control Applied Today 
|
|
---
|
---
|
|
 Authentication 
|
 Reuses the existing JWT middleware chain unchanged — no new auth surface introduced 
|
|
 Authorization 
|
 Role hierarchy reused; 
**
hardened
**
 reassignment/priority-change rule for Action Items (see §6.2) beyond the base spec 
|
|
 Tenant isolation 
|
 Three-layer defense reconfirmed for 
`action_items`
: app-layer 
`where`
, Prisma middleware, PostgreSQL RLS 
|
|
 Input validation 
|
 Every query param and request body validated via Zod; unknown filter fields rejected with 
`422 UNKNOWN_FILTER_FIELD`
 rather than silently ignored 
|
|
 Dynamic field allow-listing 
|
 Sort fields and filter fields are hard-coded allow-lists — prevents accidental exposure of sensitive columns through a generic filter mechanism 
|
|
 Idempotency 
|
`X-Idempotency-Key`
 required on 
`POST /sync`
 (prevents duplicate external tickets); recommended on 
`PATCH`
|
|
 Rate limiting 
|
 Standard user tier (200/60s) on list/update; tightened tier (30/60s) on slug-check to deter enumeration; per-team throttle lock on sync 
|
|
 CSRF protection 
|
 OAuth state token for calendar connect is cryptographically random, single-use, Redis-backed with short TTL, and bound to the initiating user 
|

