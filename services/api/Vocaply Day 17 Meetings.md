# Vocaply — Day 17: Meetings API
## Full Scalable Industry-Level Build Plan
> Senior Engineer Edition | Production-Grade | Security-First | Performance-Optimized
> Document: DAY-17-PLAN-001 | Version 1.0 | June 2026

---

## Table of Contents

1. [Day Overview & Goals](#1-day-overview--goals)
2. [File Structure to Create](#2-file-structure-to-create)
3. [Layer 1 — Data Layer (Repository)](#3-layer-1--data-layer-repository)
4. [Layer 2 — Business Logic (Service)](#4-layer-2--business-logic-service)
5. [Layer 3 — Recall.ai Integration Service](#5-layer-3--recallai-integration-service)
6. [Layer 4 — MongoDB Service (Transcripts)](#6-layer-4--mongodb-service-transcripts)
7. [Layer 5 — HTTP Layer (Controller + Routes)](#7-layer-5--http-layer-controller--routes)
8. [Layer 6 — Validation Layer](#8-layer-6--validation-layer)
9. [Meeting State Machine Architecture](#9-meeting-state-machine-architecture)
10. [Security Architecture](#10-security-architecture)
11. [Performance Architecture](#11-performance-architecture)
12. [Deduplication System](#12-deduplication-system)
13. [Error Handling Strategy](#13-error-handling-strategy)
14. [API Endpoints — Full Specification](#14-api-endpoints--full-specification)
15. [Middleware Chain Design](#15-middleware-chain-design)
16. [Calendar Sync Service Scaffold](#16-calendar-sync-service-scaffold)
17. [Types & Interfaces](#17-types--interfaces)
18. [Testing Plan](#18-testing-plan)
19. [End-of-Day Checklist](#19-end-of-day-checklist)

---

## 1. Day Overview & Goals

### What Gets Built Today

Day 17 delivers the **heart of Vocaply's pipeline** — the Meetings API. This is the entry point for the entire AI accountability system. A meeting is created → bot joins → recording happens → AI extracts → commitments are tracked. Everything downstream depends on today being done right.

### Why This Day Is Critical

```
TODAY BUILDS:
  ✅ 8 meeting API endpoints (full CRUD + bot control + transcript)
  ✅ Recall.ai bot scheduling (2-min early join)
  ✅ Platform URL detection (Zoom, Meet, Teams, Webex)
  ✅ 2-layer deduplication (Redis + PostgreSQL)
  ✅ Meeting state machine (7 states, valid transitions enforced)
  ✅ MongoDB transcript service (scaffold)
  ✅ Plan limit enforcement middleware
  ✅ Calendar sync service scaffold (full build Day 62)

DOWNSTREAM IMPACT:
  Day 18 — Recall.ai webhook handler needs this to exist
  Day 19 — Queue workers find meetings by ID
  Day 46 — AI Pipeline calls back into meeting records
  Day 62 — Calendar sync uses dedup system built today

DO NOT SKIP OR RUSH:
  The deduplication system, state machine, and plan limit check
  are load-bearing security features. If these are wrong, you get:
  → 2 bots in same meeting (Recall.ai charges per bot)
  → Infinite meeting creation on free plan
  → Invalid state transitions corrupting data pipeline
```

### 8-Hour Time Allocation

```
9:00 AM – 10:00 AM   → meetings.repository.ts (all DB query functions)
10:00 AM – 11:30 AM  → meetings.service.ts (create + bot scheduling)
11:30 AM – 12:00 PM  → recall.service.ts + platform-detect util
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 2:00 PM    → meetings.service.ts (list, get, delete, transcript)
2:00 PM – 3:00 PM    → State machine + plan limit middleware
3:00 PM – 4:00 PM    → meetings.controller.ts + meetings.routes.ts
4:00 PM – 5:00 PM    → calendar-sync.service.ts scaffold
5:00 PM – 5:30 PM    → Postman testing all 8 endpoints
5:30 PM – 6:00 PM    → Checklist review
```

---

## 2. File Structure to Create

```
services/api/src/
│
├── modules/meetings/
│   ├── meetings.repository.ts       ← DB queries ONLY — no business logic
│   ├── meetings.service.ts          ← All business logic
│   ├── meetings.controller.ts       ← HTTP req/res handlers ONLY
│   ├── meetings.validator.ts        ← Zod schemas for all request bodies
│   ├── meetings.routes.ts           ← Route definitions + middleware chain
│   └── meetings.types.ts            ← TypeScript interfaces for this module
│
├── middleware/
│   └── plan-limits.middleware.ts    ← Enforce plan meeting quotas (new file)
│
├── services/
│   ├── recall.service.ts            ← Recall.ai REST API client
│   ├── mongo.service.ts             ← MongoDB transcript operations
│   └── calendar-sync.service.ts    ← Calendar sync scaffold (full Day 62)
│
└── utils/
    └── platform-detect.ts           ← Meeting URL → platform detection
```

### Dependency Flow (No Circular Deps)

```
meetings.routes.ts
  └── meetings.controller.ts
        └── meetings.service.ts
              ├── meetings.repository.ts  (DB access)
              ├── recall.service.ts       (Recall.ai API)
              ├── mongo.service.ts        (MongoDB transcripts)
              ├── cache.service.ts        (Redis — already exists)
              └── usage.service.ts        (Usage events — already exists)

meetings.routes.ts
  └── middleware chain:
        ├── requireAuth()           (exists from Day 11)
        ├── injectTenant()          (exists from Day 11)
        ├── checkMeetingLimit()     (NEW today — plan-limits.middleware.ts)
        ├── requireRole()           (exists from Day 11)
        └── validate(schema)        (exists from Day 11)
```

---

## 3. Layer 1 — Data Layer (Repository)

### File: `meetings.repository.ts`

**Responsibility:** All Prisma/DB queries. Zero business logic. Returns domain types, never raw Prisma types.

### Functions to Implement

#### `create(data: CreateMeetingData): Promise<Meeting>`
Creates a meeting record. Accepts all meeting fields. Returns the created meeting. Called after Recall.ai bot is scheduled (so recallBotId is set in the same transaction if possible, or in a follow-up update).

#### `findById(id: string, teamId: string): Promise<Meeting | null>`
Finds a meeting by ID, scoped to a team. Always include teamId in WHERE clause — never trust the ID alone. Returns null if not found or belongs to different team.

#### `findByRecallBotId(botId: string): Promise<Meeting | null>`
Looks up meeting by Recall.ai bot ID. Used by the webhook handler (Day 18). Uses the unique partial index `idx_mtg_recall_bot`. This must be fast (webhook processing path).

#### `findByPlatformId(teamId: string, platform: string, platformMeetingId: string): Promise<Meeting | null>`
Deduplication query. Checks if a meeting with this platform+ID already exists for this team, excluding terminal statuses. Uses the unique partial index `idx_mtg_platform_dedup`.

#### `list(teamId: string, filters: MeetingListFilters, cursor?: CursorData): Promise<{ meetings: Meeting[], nextCursor: string | null }>`
Cursor-paginated list of team meetings. Supports filtering by status, platform, date range, and text search. Fetches `limit + 1` items to determine `hasMore`. Encodes cursor from last item's (scheduledAt, id).

#### `update(id: string, data: Partial<MeetingUpdateData>): Promise<Meeting>`
Partial update. Only updates provided fields. Used for: setting recallBotId, updating status, setting startedAt/endedAt, updating counts after extraction.

#### `updateStatus(id: string, newStatus: MeetingStatus, extraData?: object): Promise<Meeting>`
Dedicated status update. Includes state machine validation check. Merges extra fields (startedAt when RECORDING, endedAt when PROCESSING, etc.).

#### `delete(id: string, teamId: string): Promise<void>`
Hard delete. Cascades to commitments, action_items, decisions, blockers (all configured with ON DELETE CASCADE). Validates meeting belongs to team before delete. Throws if meeting is in RECORDING status.

#### `countMeetingsThisMonth(teamId: string): Promise<number>`
For plan limit enforcement fallback. Counts usage_events where type = MEETING_PROCESSED for this team in the current billing cycle. Used only when Redis cache is cold — primary check uses teams.meetings_used (denormalized counter).

#### `findWithRelations(id: string, teamId: string, include: IncludeOptions): Promise<MeetingWithRelations | null>`
Full meeting detail with optional relations. The `include` parameter controls which relations are loaded (participants, commitments, actionItems, decisions, blockers). Uses Prisma `include` selectively to avoid over-fetching.

### Query Patterns & Performance Notes

All queries must:
- Always include `teamId` in WHERE clause (tenant isolation)
- Use the indexed columns for filtering (never filter on non-indexed columns for large datasets)
- Never use `SELECT *` in Prisma — always specify `select` for list queries
- Use cursor pagination, never offset pagination (prevents duplicate/missing records on concurrent inserts)

---

## 4. Layer 2 — Business Logic (Service)

### File: `meetings.service.ts`

**Responsibility:** All business logic, orchestration, side effects. Never touches HTTP (req/res). Returns domain objects.

### Function: `createMeeting(data, user, teamId)`

This is the most complex function of the day. Full flow:

**Step 1 — Input Validation & Platform Detection**

Determine the platform from the meeting URL using `platformDetect(url)`. If the URL doesn't match any known platform pattern and platform is not MANUAL, reject with validation error. Extract the `platformMeetingId` from the URL:
- Zoom: numeric meeting ID from `/j/123456789`
- Google Meet: room code `abc-defg-hij`
- Teams: SHA-256 hash of the full join URL (URLs are too long and variable)
- Webex: numeric meeting ID

**Step 2 — Plan Limit Check**

Check `team.meetingsUsed` against plan limit. This is a fast path: the value is denormalized on the teams table. Read from Redis cache `cache:team:plan:{teamId}` (TTL 1 hour). On cache miss, query DB and populate cache. If limit reached, throw `PlanLimitError` with `{ used, limit, plan, upgradeUrl }`.

Do NOT count usage_events here — that's the fallback for data reconciliation only. The denormalized counter is the authoritative real-time source.

**Step 3 — Deduplication (2 layers)**

Layer 1 — Redis (fast, milliseconds):
- Key: `bot:scheduled:{platform.toLowerCase()}:{platformMeetingId}`
- If exists → 409 DUPLICATE immediately (no DB query needed)

Layer 2 — PostgreSQL (authoritative):
- Query: find meeting WHERE teamId + platformMeetingId AND status NOT IN ('DONE','FAILED','CANCELLED')
- If found → 409 DUPLICATE
- This catches edge cases where Redis key expired but meeting still active

**Step 4 — Bot Scheduling**

Calculate `botJoinAt = scheduledAt - 2 minutes`. Call `recallService.scheduleBot({ meetingUrl, joinAt: botJoinAt })`. This is a network call — wrap in try/catch. If Recall.ai returns error, throw `IntegrationError('RECALL_AI', errorMessage)` which maps to 502.

**Step 5 — Persist Meeting Record**

Create meeting in PostgreSQL with all fields including `recallBotId` from Step 4. Use a single create operation. Status starts as SCHEDULED.

**Step 6 — Set Redis Dedup Flag**

After successful DB write, set the Redis dedup flag:
- Key: `bot:scheduled:{platform}:{platformMeetingId}`
- Value: `meeting.id`
- TTL: `max(3600, secondsUntilMeetingEndPlus4Hours)` — ensures flag persists through the meeting

**Step 7 — Invalidate Plan Cache**

After creating a meeting, do NOT immediately increment `meetingsUsed` here. The database trigger on `usage_events` handles that when status → DONE. But invalidate the team plan cache so next limit check reflects fresh data.

**Step 8 — Return Result**

Return the full meeting object with a human-readable `message` field.

### Function: `listMeetings(teamId, filters, cursor?)`

Build the filter object dynamically. Only include filter properties if provided (don't include undefined keys — Prisma ignores undefined). Decode cursor if present. Call repository. Return meetings + nextCursor.

Filter rules:
- `status`: exact enum match or array of statuses
- `platform`: exact enum match
- `from` / `to`: scheduledAt range (inclusive)
- `search`: case-insensitive title search — use Prisma `contains` with `mode: 'insensitive'`
- Never allow filtering on non-indexed columns without checking query plan first

### Function: `getMeeting(id, teamId, include?)`

Simple: verify meeting exists and belongs to team, then fetch with requested relations. The `include` parameter is an object: `{ participants: boolean, commitments: boolean, actionItems: boolean, decisions: boolean, blockers: boolean }`. Default all true.

### Function: `getTranscript(id, teamId, filters?)`

Verify meeting belongs to team. Check `meeting.mongoTranscriptId` exists — if null, meeting hasn't been processed yet (404 with specific error code `TRANSCRIPT_NOT_AVAILABLE`). Call `mongoService.getTranscript(mongoTranscriptId, filters)`. Apply speaker filter and time range filter in MongoDB query. Apply text search via Atlas Search if `search` param provided.

### Function: `addBotManually(meetingUrl, user, teamId)`

For adding a bot to an already-running meeting. Same dedup check. Same plan limit check. Bot join time is `NOW()` (immediate). Returns meeting with status BOT_JOINING.

### Function: `removeBot(id, teamId)`

Find meeting, call `recallService.removeBot(botId)`, update status to CANCELLED. Only valid from SCHEDULED or BOT_JOINING states.

### Function: `deleteMeeting(id, teamId, deleteTranscript?)`

Guard: cannot delete a meeting in RECORDING status (active recording). If `deleteTranscript=true`, delete MongoDB document first. Then delete PostgreSQL record (CASCADE handles children). Delete Redis dedup key. Return void.

### Function: `updateMeetingStatus(id, newStatus, extraData?)` (Internal — Used by Webhook Handler)

This is called from the Recall.ai webhook handler (Day 18), not directly from the HTTP layer. Validates transition is allowed by the state machine. Applies extra data (timestamps, etc.). Emits Socket.io event after successful update.

---

## 5. Layer 3 — Recall.ai Integration Service

### File: `recall.service.ts`

**Responsibility:** All communication with Recall.ai API. Clean abstraction — nothing else knows Recall.ai's API shape.

### Architectural Decisions

**Use a dedicated Axios instance** (not the main API client). Recall.ai uses a different base URL and auth scheme (Token-based, not Bearer). Timeout: 15 seconds. Retry: 3 attempts with exponential backoff on 429 and 5xx.

**Never expose Recall.ai's response shape** to the service layer. Map to internal types. This means if Recall.ai changes their API, only this file changes.

**Log all Recall.ai calls** with correlation IDs. Include: endpoint, status code, response time. Sentry captures Recall.ai errors with full context.

### Functions to Implement

#### `scheduleBot(data: { meetingUrl, joinAt, teamId, meetingId })`
POST to Recall.ai `/api/v1/bot`. Payload includes:
- `meeting_url`: the full join URL
- `join_at`: ISO 8601 UTC timestamp (2 min before meeting)
- `bot_name`: "Vocaply" (customizable per team in enterprise plan later)
- `transcription_options.provider`: "assembly_ai" (best accuracy for English)
- `transcription_options.language`: "en"
- `real_time_transcription.partial_results`: true (enables live transcript display)
- `webhook_url`: `${process.env.API_URL}/webhooks/recall` (receives bot lifecycle events)
- Custom `metadata`: `{ teamId, meetingId }` (Recall.ai passes this back in webhooks)

Returns `{ id: string }` (the Recall.ai bot ID, stored as `recallBotId` in the meetings table).

#### `removeBot(botId: string)`
DELETE `/api/v1/bot/{botId}`. Idempotent — if bot already removed (404 from Recall.ai), treat as success (don't throw). Only throw on 5xx.

#### `getBotStatus(botId: string)`
GET `/api/v1/bot/{botId}`. Returns the latest status from Recall.ai's `status_changes` array. Used for debugging and admin tooling. Not called on the hot path.

### Error Handling

Map Recall.ai error codes to internal errors:
- 401 → `RECALL_AUTH_ERROR` (API key invalid — alert, stop retrying)
- 402 → `RECALL_QUOTA_EXCEEDED` (their billing limit — alert ops immediately)
- 404 → `RECALL_BOT_NOT_FOUND` (bot already removed — treat as success in removeBot)
- 422 → `RECALL_INVALID_URL` (unsupported platform or malformed URL)
- 429 → `RECALL_RATE_LIMITED` (retry after Retry-After header)
- 5xx → `RECALL_SERVICE_ERROR` (retry 3x, then throw IntegrationError)

### Retry Logic

Implement exponential backoff retry wrapper:
- Attempts: 3
- Delays: 1s, 2s, 4s (with ±10% jitter to prevent thundering herd)
- Retry on: 429, 500, 502, 503, 504
- Do NOT retry on: 4xx (except 429)

---

## 6. Layer 4 — MongoDB Service (Transcripts)

### File: `mongo.service.ts`

**Responsibility:** All MongoDB operations for the transcripts collection. Abstracted from the rest of the system.

### Functions to Implement Today (Scaffold — Full Implementation Day 18)

#### `storeTranscript(data: StoreTranscriptData)` → scaffold only
Inserts a new transcript document. Called by the webhook handler (Day 18). Today: define the interface and stub the implementation.

#### `getTranscript(mongoId: string, filters?: TranscriptFilters)`
Fetches transcript from MongoDB. Applies:
- Speaker filter: `{ 'raw_transcript.speaker_email': speakerEmail }`
- Time range: `{ 'raw_transcript.start_time': { $gte: fromTime, $lte: toTime } }`
- Text search: Atlas Search `$search` pipeline stage with `lucene.english` analyzer

Returns formatted transcript object with turns array.

#### `updateTranscriptExtraction(mongoId: string, extractionResult: object)`
Updates the `ai_extraction` field and sets `processing_status = 'done'`. Called by the extract worker (Day 46).

#### `deleteTranscript(mongoId: string)`
Hard deletes a transcript document. Called when a meeting is deleted with `deleteTranscript=true`.

### MongoDB Connection Design

Use a **singleton connection pattern**. The connection is established once at server startup and reused. Use `mongoose` or the native MongoDB driver. Connection string from environment. Add event listeners for: connected, error, disconnected (log all with Pino).

Connection options for production:
- `maxPoolSize`: 10 (connection pool)
- `serverSelectionTimeoutMS`: 5000
- `socketTimeoutMS`: 45000
- `heartbeatFrequencyMS`: 10000

---

## 7. Layer 5 — HTTP Layer (Controller + Routes)

### File: `meetings.controller.ts`

**Responsibility:** Parse HTTP request → call service → format HTTP response. Zero business logic. Zero DB access. Only thin translation layer.

### Design Rules for All Controller Functions

Every controller function:
- Calls `asyncHandler()` wrapper (catches errors, passes to error middleware)
- Reads from `req.body`, `req.params`, `req.query`, `req.user`, `req.teamId`
- Calls exactly one service function
- Returns `res.status(N).json(success(data))` or lets error propagate
- NEVER contains if/else business logic
- NEVER imports Prisma, Redis, or Axios directly

### Controllers to Implement

#### `createMeetingController`
Parse body. Extract `user` and `teamId` from request. Call `meetingService.createMeeting()`. Return 201 with full meeting data + message.

#### `listMeetingsController`
Parse query params: status, platform, from, to, search, limit, cursor. Build `MeetingListFilters` object. Call `meetingService.listMeetings()`. Return 200 with cursor-paginated response.

#### `getMeetingController`
Parse `meetingId` from params. Parse `include` query param (comma-separated: `participants,commitments,actionItems`). Convert to `IncludeOptions` object. Call `meetingService.getMeeting()`. Return 200.

#### `getTranscriptController`
Parse meetingId, search, speaker, fromTime, toTime from params/query. Call `meetingService.getTranscript()`. Return 200.

#### `addBotController`
Parse meetingUrl from body. Call `meetingService.addBotManually()`. Return 200 with BOT_JOINING status.

#### `removeBotController`
Parse meetingId from params. Call `meetingService.removeBot()`. Return 200.

#### `deleteMeetingController`
Parse meetingId from params. Parse `deleteTranscript` boolean from query. Call `meetingService.deleteMeeting()`. Return 200.

### File: `meetings.routes.ts`

Each route has a precisely designed middleware chain. Order matters — middleware runs left to right.

```
POST   /meetings
  chain: requireAuth → injectTenant → checkMeetingLimit → validate(createSchema) → controller

GET    /meetings
  chain: requireAuth → injectTenant → validate(listQuerySchema) → controller

GET    /meetings/:meetingId
  chain: requireAuth → injectTenant → controller

GET    /meetings/:meetingId/transcript
  chain: requireAuth → injectTenant → controller

POST   /meetings/bot/add
  chain: requireAuth → injectTenant → checkMeetingLimit → validate(addBotSchema) → controller

DELETE /meetings/:meetingId/bot
  chain: requireAuth → injectTenant → controller

DELETE /meetings/:meetingId
  chain: requireAuth → injectTenant → requireRole('ADMIN') → controller

IMPORTANT ROUTE ORDERING:
  /meetings/bot/add must be registered BEFORE /meetings/:meetingId
  or Express will treat "bot" as the meetingId param
```

---

## 8. Layer 6 — Validation Layer

### File: `meetings.validator.ts`

All Zod schemas for request validation. Imported by validate() middleware.

### Schemas to Define

#### `createMeetingSchema`

Fields:
- `title`: string, min 1 char, max 500 chars, required
- `platform`: enum of ['ZOOM','GOOGLE_MEET','TEAMS','WEBEX','MANUAL'], required
- `meetingUrl`: string, valid URL format (Zod `.url()`), required
- `scheduledAt`: ISO 8601 datetime string, must be in the future (custom refinement: `.refine(date => new Date(date) > new Date(), 'Must be in the future')`)
- `calendarEventId`: string, optional, max 500 chars

Cross-field validation: if platform is not MANUAL, meetingUrl should match that platform's URL pattern (use `platformDetect()` util inside a `.superRefine()`).

#### `listMeetingsQuerySchema`

All fields optional:
- `status`: union of status enums (or array of them)
- `platform`: platform enum
- `from`: ISO date string
- `to`: ISO date string
- `search`: string, max 200 chars
- `limit`: number coerced, min 1, max 100, default 20
- `cursor`: string
- `sortBy`: enum `['scheduledAt','createdAt','title']`, default 'scheduledAt'
- `sortOrder`: enum `['asc','desc']`, default 'desc'

#### `addBotSchema`

- `meetingUrl`: string, valid URL, required

#### `getMeetingQuerySchema`

- `include`: string (comma-separated), optional, valid values: `participants,commitments,actionItems,decisions,blockers`

#### `getTranscriptQuerySchema`

- `search`: string, max 200 chars, optional
- `speaker`: email format, optional
- `fromTime`: number (seconds), optional
- `toTime`: number (seconds), optional, must be > fromTime if both provided

#### `deleteMeetingQuerySchema`

- `deleteTranscript`: boolean, optional, default false

---

## 9. Meeting State Machine Architecture

### The 7 States

```
SCHEDULED     → Initial state. Bot has been scheduled. Meeting has not started.
BOT_JOINING   → Bot is dispatched and connecting to the room.
RECORDING     → Bot is inside the meeting and recording audio.
PROCESSING    → Meeting ended. Transcript stored. AI extraction running.
DONE          → Extraction complete. All data available. Terminal state.
FAILED        → Irrecoverable error at any stage. Terminal. Admincan reprocess.
CANCELLED     → User cancelled before recording. Or bot failed to enter. Terminal.
```

### Valid Transition Matrix

```
FROM          → TO (allowed transitions)
──────────────────────────────────────────────────────────────────────
SCHEDULED     → BOT_JOINING (webhook: bot.joining_call)
SCHEDULED     → CANCELLED   (user action: DELETE /meetings/:id/bot)
BOT_JOINING   → RECORDING   (webhook: bot.recording_started)
BOT_JOINING   → FAILED      (webhook: bot.failed — could not enter)
BOT_JOINING   → CANCELLED   (webhook: meeting ended before bot entered)
RECORDING     → PROCESSING  (webhook: bot.done)
RECORDING     → FAILED      (webhook: bot.failed — kicked or crashed)
PROCESSING    → DONE        (worker: extraction completed successfully)
PROCESSING    → FAILED      (worker: extraction failed after max retries)
DONE          → (none)      TERMINAL — cannot transition
FAILED        → (none)      TERMINAL — admin creates new meeting to retry
CANCELLED     → (none)      TERMINAL
```

### State Machine Implementation Design

The state machine lives in `meetings.service.ts` as a pure function `validateTransition(from, to)`. It checks the transition map and throws `AppError('INVALID_STATUS_TRANSITION', 409, ...)` if invalid.

This function is also called in the repository's `updateStatus()` as a final guard — defense in depth. The application layer calls it first, the repository calls it again. Two checks mean a rogue caller (e.g., a Bull worker with a bug) cannot corrupt the state machine.

### Why State Machine Matters for Performance

When the Recall.ai webhook arrives (Day 18), it will fire `bot.recording_started` even for meetings already in RECORDING state (Recall.ai retries webhooks). The state machine means a duplicate webhook is a no-op rather than corrupting data. Combined with the Redis idempotency key for webhooks, this guarantees exactly-once processing.

---

## 10. Security Architecture

### Tenant Isolation (3 Layers)

**Layer 1 — JWT Claim:**
Every authenticated request carries `teamId` in the JWT payload. The `injectTenant()` middleware extracts this and attaches it to `req.teamId`. No user-provided teamId is ever trusted.

**Layer 2 — Repository Pattern:**
Every repository function accepts `teamId` as an explicit parameter and includes it in the WHERE clause. Example: `findById(id, teamId)` — not just `findById(id)`. This means even if the controller somehow passes the wrong ID, the query returns null (not the wrong tenant's data).

**Layer 3 — RLS (PostgreSQL):**
Row-Level Security on the meetings table (configured in Day 11 schema) provides a database-level backstop. Even if layers 1 and 2 both fail, the database won't return rows from a different team.

### Plan Limit Enforcement

The `checkMeetingLimit()` middleware runs **before** the controller on creation endpoints. It must be fast (< 5ms) because it's on the hot path for every meeting creation.

Implementation:
1. Try Redis: `GET cache:team:plan:{teamId}` — returns JSON with `{ plan, meetingsUsed, meetingsLimit }`
2. On cache hit: compare `meetingsUsed >= meetingsLimit` → 402 if exceeded
3. On cache miss: query `teams` table for `{ plan, meetings_used }`, compute limit from `PLAN_LIMITS` config, cache for 1 hour, then compare

The `PLAN_LIMITS` config must live in a single file (`modules/billing/plans.config.ts`) — never hardcoded in middleware. This file is imported by multiple modules.

```
PLAN      MEETINGS/MONTH   MEMBERS   STORAGE
FREE      5                2         1 GB
STARTER   40               10        10 GB
GROWTH    120              25        50 GB
BUSINESS  300              60        unlimited
ENTERPRISE unlimited       unlimited unlimited
```

### Recall.ai API Key Security

The `RECALL_API_KEY` env var is used only in `recall.service.ts`. Never logged. Never included in error messages. In Sentry errors, the Authorization header is scrubbed by the `beforeSend` hook. The key is loaded once at module initialization, not on every request.

### Meeting URL Validation

The `meetingUrl` is validated at two levels:
1. Zod: `.url()` ensures it's a valid URL format
2. `platformDetect()`: ensures the URL matches the declared platform's pattern

For Zoom URLs, extract only the meeting ID (numeric). Never trust other parts of the URL. A malicious URL like `zoom.us/j/123456789?inject_header=true` is fine because we only use the meeting ID, not the full URL directly with Recall.ai. The meeting URL is passed to Recall.ai as-is (they handle it), but we never parse query params as trusted data.

### Deduplication Security

The Redis dedup key prevents bot bombing — a scenario where a bad actor rapidly creates hundreds of meetings pointing to the same Zoom URL, generating hundreds of bot charges on your Recall.ai account.

The TTL calculation ensures the key lives long enough: `max(3600, secondsUntilScheduledAt + 4hours)`. For a meeting scheduled 24 hours from now, the TTL is 28 hours. This means even if the Redis key survives a restart, the meeting is still protected.

---

## 11. Performance Architecture

### Redis Cache Strategy for Meetings

**Team Plan Cache:**
- Key: `cache:team:plan:{teamId}`
- TTL: 3600 seconds
- Invalidate: on plan upgrade/downgrade (Stripe webhook), on meeting count increment
- This prevents a DB query on every meeting creation

**Meeting Detail Cache:**
- Key: `cache:meeting:detail:{meetingId}`
- TTL: 86400 seconds (24 hours — DONE meetings never change)
- Only cache meetings in DONE status
- SCHEDULED/RECORDING/PROCESSING meetings are never cached (they change)
- Invalidate: when status transitions to DONE (set cache at that moment)

**No caching for meeting lists:**
- Lists change frequently (new meetings added throughout the day)
- Cursor pagination handles performance at the DB level via indexes
- Stale list data would confuse users (bot status updates in real-time)

### Cursor Pagination Design

The cursor encodes the sort key values of the last record seen. For `sortBy=scheduledAt&sortOrder=desc`:

Cursor value: `base64url(JSON({ scheduledAt: "2026-05-12T09:00:00Z", id: "mtg_abc" }))`

Next page query adds: `WHERE (scheduled_at, id) < ($cursorScheduledAt, $cursorId)`

This uses a composite index `(team_id, scheduled_at DESC, id DESC)` which already exists. The cursor approach guarantees no duplicates or gaps even if new meetings are inserted between page fetches.

The cursor is **opaque to clients** — they must not parse or construct it. The server decodes it with `base64url.decode()`. Expired or malformed cursors return a 422 error.

### Database Query Optimization

For the `listMeetings` query, the SELECT must only fetch columns needed for the list view. The meeting detail (with summary text, mongo_transcript_id, etc.) is not included in list queries. Use Prisma `select` with explicit column list:

```
id, title, platform, status, scheduled_at, started_at, ended_at,
duration_minutes, participant_count, commitment_count, action_item_count,
decision_count, summary (truncated to 200 chars), created_at
```

This prevents fetching large TEXT columns (`processing_error`, full `summary`) in bulk queries.

### Prefetching for Immediate Bot Scheduling

When creating a meeting, the bot scheduling (Recall.ai API call) should happen **before** the DB write when possible. If the Recall.ai call fails, we haven't created a meeting record, so no cleanup is needed. Sequence:

1. Validate inputs (fast, local)
2. Check dedup Redis (fast, ~1ms)
3. Check dedup DB (fast, indexed, ~5ms)
4. Check plan limit Redis (fast, ~1ms)
5. Schedule bot with Recall.ai (network, ~200-500ms) ← blocking step
6. Write to PostgreSQL (fast, ~10ms)
7. Set Redis dedup key (fast, ~1ms)

The Recall.ai call is the slowest step but must succeed before we commit the meeting. This prevents orphaned meeting records with no bot.

### N+1 Query Prevention

The `findWithRelations()` repository function uses Prisma's `include` to eager-load all relations in a single query. The `include` parameter is constructed from the request's `?include=` query param, so we only load what's needed.

For the `listMeetings` endpoint, relations are NOT included. The list returns summary data only. Fetching full commitments/participants for 20 meetings at once would be a massive N+1 problem.

---

## 12. Deduplication System

### The Problem

Without deduplication, 5 team members sharing a Google Calendar event would each trigger the calendar sync (Day 62), resulting in:
- 5 meetings created for the same Zoom call
- 5 Recall.ai bots joining the same meeting
- 5x Recall.ai billing
- 5x extraction running on the same transcript
- 5x duplicate commitments extracted

### The 2-Layer Solution

**Layer 1 — Redis (Millisecond Speed):**

```
Key:   bot:scheduled:{platform.toLowerCase()}:{platformMeetingId}
Value: meeting.id (for debugging which meeting claimed this slot)
TTL:   max(3600, seconds until meeting starts + 4 hours)

On creation: SET if not exists (SETNX) — atomic, race-condition safe
On lookup:   GET — if exists, return 409 immediately
On cleanup:  DEL after meeting reaches DONE/FAILED/CANCELLED
```

**Layer 2 — PostgreSQL (Authoritative):**

```
Query: SELECT id FROM meetings
       WHERE team_id = ?
         AND platform_meeting_id = ?
         AND status NOT IN ('DONE','FAILED','CANCELLED')
       LIMIT 1

Uses:  UNIQUE partial index idx_mtg_platform_dedup
```

### Race Condition Handling

Two simultaneous requests creating the same meeting:
1. Both pass Redis check (not yet set)
2. Both pass DB check (not yet created)
3. First one writes to DB → DB UNIQUE constraint enforces uniqueness → second fails with Prisma P2002

The DB unique constraint is the final safety net. The Redis check is just a fast-path optimization.

### Platform Meeting ID Extraction Logic

```
ZOOM:
  URL patterns: zoom.us/j/123456789, zoom.us/j/123456789?pwd=abc
  Extract: numeric segment after /j/
  Normalize: strip leading zeros, strip query params
  Result: "123456789"

GOOGLE MEET:
  URL patterns: meet.google.com/abc-defg-hij, g.co/meet/abc-defg-hij
  Extract: room code segment (format: xxx-xxxx-xxx)
  Normalize: lowercase
  Result: "abc-defg-hij"

MICROSOFT TEAMS:
  URL patterns: teams.microsoft.com/l/meetup-join/... (very long)
  Extract: SHA-256(full_url) — first 16 chars (hex)
  Reason: URLs are too long and contain session tokens that vary
  Result: "a1b2c3d4e5f6g7h8"

WEBEX:
  URL patterns: webex.com/meet/ROOM_NAME, webex.com/j/123456789
  Extract: room name or numeric ID
  Result: "ROOM_NAME" or "123456789"

MANUAL:
  No platformMeetingId extracted (null)
  No deduplication needed — user is manually uploading transcripts
  Multiple MANUAL meetings with same URL are allowed
```

---

## 13. Error Handling Strategy

### Error Classification

Every error thrown from the service layer must be a typed `AppError` (defined in `utils/errors.ts`). Controllers never catch errors — they propagate to the global error middleware.

**Meeting-specific error codes:**

```
MEETING_NOT_FOUND         404  → Meeting doesn't exist or belongs to different team
MEETING_DUPLICATE         409  → Meeting URL already scheduled for this team
MEETING_INVALID_URL       422  → URL doesn't match declared platform
MEETING_UNSUPPORTED_PLATFORM 422 → Platform not supported (Webex in some regions)
MEETING_ACTIVE_CANNOT_DELETE 409 → Cannot delete a meeting currently recording
MEETING_NO_TRANSCRIPT     404  → Meeting processed but transcript not found in MongoDB
TRANSCRIPT_NOT_AVAILABLE  404  → Meeting not yet processed (status != DONE)
INVALID_STATUS_TRANSITION 409  → State machine violation
RECALL_AI_ERROR           502  → Recall.ai API failure
RECALL_AI_QUOTA_EXCEEDED  502  → Recall.ai billing limit hit
PLAN_LIMIT_REACHED        402  → Monthly meeting quota exceeded
```

### Recall.ai Failure Handling

If Recall.ai is down when creating a meeting:
- The meeting is NOT created in PostgreSQL
- Return 502 with error code `RECALL_AI_ERROR`
- Log with full context (teamId, meetingUrl, Recall.ai response)
- Alert via Sentry (tagged `recall_ai=true`)

This is better than creating a meeting with no bot — an orphaned meeting that nobody can use.

### Partial Failure Handling

If the meeting is created in PostgreSQL but setting the Redis dedup key fails:
- The meeting is valid and should be returned as success
- The missing Redis key means deduplication falls to the DB layer
- Log a warning (not error) — `redis_dedup_key_missing=true`
- The DB unique index prevents actual duplicate creation

---

## 14. API Endpoints — Full Specification

### `POST /api/v1/meetings` — Create Meeting

**Auth:** JWT required | **Role:** Any | **Rate Limit:** User tier (200/min) | **Idempotency:** Required

**Middleware chain:** `requireAuth → injectTenant → checkMeetingLimit → validate(createMeetingSchema) → controller`

**Request body fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| title | string | yes | min 1, max 500 |
| platform | enum | yes | ZOOM, GOOGLE_MEET, TEAMS, WEBEX, MANUAL |
| meetingUrl | string | yes | valid URL, matches platform pattern |
| scheduledAt | ISO 8601 | yes | must be in the future |
| calendarEventId | string | no | max 500 chars |

**Success response:** 201 with full meeting object + `message` field

**Error responses:**
- 400 → malformed request body
- 402 → plan limit reached
- 409 → duplicate meeting URL
- 422 → validation error (invalid URL, past scheduledAt)
- 502 → Recall.ai unavailable

---

### `GET /api/v1/meetings` — List Meetings

**Auth:** JWT required | **Role:** Any | **Rate Limit:** User tier

**Middleware chain:** `requireAuth → injectTenant → validate(listQuerySchema) → controller`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| status | enum or array | all | SCHEDULED, BOT_JOINING, RECORDING, PROCESSING, DONE, FAILED, CANCELLED |
| platform | enum | all | ZOOM, GOOGLE_MEET, TEAMS, WEBEX, MANUAL |
| from | ISO date | none | scheduledAt >= this date |
| to | ISO date | none | scheduledAt <= this date |
| search | string | none | case-insensitive title search |
| limit | integer | 20 | max 100 |
| cursor | string | none | opaque cursor from previous response |
| sortBy | enum | scheduledAt | scheduledAt, createdAt, title |
| sortOrder | enum | desc | asc, desc |

**Response shape:** paginated list with `meta.nextCursor` and `meta.hasMore`

---

### `GET /api/v1/meetings/:meetingId` — Get Meeting Detail

**Auth:** JWT required | **Role:** Any

**Middleware chain:** `requireAuth → injectTenant → controller`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| include | string | all | comma-separated: participants,commitments,actionItems,decisions,blockers |

**Response:** Full meeting object with requested relations. Relations are always arrays (empty if none exist).

**Error responses:**
- 404 → meeting not found or belongs to different team (same error — never reveal which)

---

### `GET /api/v1/meetings/:meetingId/transcript` — Get Transcript

**Auth:** JWT required | **Role:** Any

**Middleware chain:** `requireAuth → injectTenant → controller`

**Query parameters:**

| Param | Type | Notes |
|---|---|---|
| search | string | Full-text search across transcript text (Atlas Search) |
| speaker | email | Filter turns by speaker email |
| fromTime | number | Start time in seconds |
| toTime | number | End time in seconds |

**Response:** Transcript object with turns array, total turn count, search result count.

**Error responses:**
- 404 with `TRANSCRIPT_NOT_AVAILABLE` → meeting not yet processed
- 404 with `MEETING_NOT_FOUND` → meeting doesn't exist for this team

---

### `POST /api/v1/meetings/bot/add` — Manually Add Bot

**Auth:** JWT required | **Role:** Any | **Idempotency:** Required

**Middleware chain:** `requireAuth → injectTenant → checkMeetingLimit → validate(addBotSchema) → controller`

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| meetingUrl | string | yes | Must be a supported platform URL |

**Response:** 200 with meeting object in BOT_JOINING status + ~30 second join estimate.

---

### `DELETE /api/v1/meetings/:meetingId/bot` — Remove Bot

**Auth:** JWT required | **Role:** Any

**Middleware chain:** `requireAuth → injectTenant → controller`

**Response:** 200 with updated meeting in CANCELLED status.

**Error responses:**
- 404 → meeting not found
- 409 → meeting is already in DONE/FAILED/CANCELLED (nothing to remove)

---

### `DELETE /api/v1/meetings/:meetingId` — Delete Meeting

**Auth:** JWT required | **Role:** ADMIN+

**Middleware chain:** `requireAuth → injectTenant → requireRole('ADMIN') → controller`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| deleteTranscript | boolean | false | Also delete MongoDB transcript document |

**Response:** 200 with confirmation message.

**Error responses:**
- 404 → meeting not found
- 403 → insufficient role (not ADMIN+)
- 409 → cannot delete meeting in RECORDING status

---

### HTTP Status Code Reference

```
201  Created          → POST /meetings (new meeting created)
200  OK               → GET endpoints, DELETE endpoints, POST /bot/add
400  Bad Request      → Malformed JSON body
401  Unauthorized     → Missing or invalid JWT
402  Payment Required → Plan limit exceeded
403  Forbidden        → Wrong role (not ADMIN for delete)
404  Not Found        → Meeting doesn't exist in this team
409  Conflict         → Duplicate meeting URL, invalid state transition, active recording
422  Unprocessable    → Zod validation failed, invalid URL pattern
429  Too Many Requests → Rate limit exceeded
502  Bad Gateway      → Recall.ai API failure
```

---

## 15. Middleware Chain Design

### `checkMeetingLimit()` — New Middleware (plan-limits.middleware.ts)

This middleware protects all meeting creation endpoints. It is intentionally fast — must complete in < 5ms to not affect user experience.

**Implementation plan:**

Step 1: Extract `teamId` from `req.teamId` (set by `injectTenant()` which runs before this).

Step 2: Build Redis cache key `cache:team:plan:{teamId}`.

Step 3: Try `redis.get(key)`:
- Hit: parse JSON `{ plan, meetingsUsed, meetingsLimit }` → compare → proceed or 402
- Miss: query `teams` table for `id, plan, meetings_used` → compute limit from `PLAN_LIMITS` → set Redis cache (TTL 3600) → compare → proceed or 402

Step 4: If limit not reached, call `next()`. If reached, call `next(new PlanLimitError(...))` — let error middleware format the response.

**Why middleware, not service:**
Plan limit enforcement must happen before the service layer touches any business logic. Putting it in middleware makes it impossible for a developer to accidentally bypass it by calling the service directly from another context. It also makes it testable in isolation.

**The `PLAN_LIMITS` constants must be imported from a shared config file**, not hardcoded in the middleware. The billing module imports the same config for pricing calculations.

---

## 16. Calendar Sync Service Scaffold

### File: `calendar-sync.service.ts`

Today's implementation is a scaffold only. Full implementation in Day 62. Build the interface and stub functions so other modules can import and call them without errors.

### Functions to Scaffold

#### `syncUserCalendar(userId: string)`
Will scan a user's connected Google Calendar or Outlook Calendar for upcoming meetings and create Vocaply meetings + schedule bots. Today: returns `{ synced: 0, skipped: 0, message: 'Not yet implemented — full implementation Day 62' }`.

#### `extractMeetingUrl(calendarEvent: unknown)`
Will parse a calendar event object and return the meeting URL. Today: returns null.

#### `detectPlatformFromEvent(calendarEvent: unknown)`
Will detect Zoom/Meet/Teams from event conferenceData, description, or location. Today: returns null.

### Why Scaffold Now

The `meetings.service.ts` will eventually import from `calendar-sync.service.ts`. If the import fails on Day 62, it cascades. Building the scaffold today means the import exists and TypeScript types are established. Day 62 fills in the implementation.

---

## 17. Types & Interfaces

### File: `meetings.types.ts`

All TypeScript interfaces specific to the meetings module. The shared `Meeting` type is in `@vocaply/types`. Module-specific types go here.

### Types to Define

**`CreateMeetingInput`** — what the service function accepts:
- All fields from the request body schema
- Plus `userId` and `teamId` (from auth context, not user input)

**`MeetingListFilters`** — parsed filter object:
- All optional fields matching the list query params
- Properly typed (dates as Date objects, not strings)

**`CursorData`** — decoded cursor shape:
- `scheduledAt: Date`
- `id: string`
- `sortField: string` (for multi-column cursor support)

**`IncludeOptions`** — which relations to load:
- All boolean flags for each relation
- Default: all true

**`MeetingWithRelations`** — extends `Meeting` with optional relation arrays

**`TranscriptFilters`** — for the transcript endpoint:
- `search?: string`
- `speakerEmail?: string`
- `fromTime?: number`
- `toTime?: number`

**`StoreTranscriptData`** — for MongoDB insert (scaffold for Day 18):
- `meetingId`, `teamId`, `recallBotId`, `platform`, `rawTranscript`, `fullText`

**`PlatformType`** — re-export from shared-types for use within this module

---

## 18. Testing Plan

### Day 17 Testing Scope

Testing happens in the last 30 minutes using Postman. Full automated tests are written in Phase 8 (Days 89–100). Today's testing is functional validation — ensure every endpoint works as expected before Day 18 builds on top.

### Create Meeting Tests

Test 1 — Happy path: Valid Zoom URL, future scheduledAt → 201, meeting visible in DB, Recall.ai bot scheduled.

Test 2 — FREE plan 6th meeting: After creating 5 meetings on a FREE team → 402 PLAN_LIMIT with correct `used: 5, limit: 5` in response.

Test 3 — Duplicate meetingUrl (same platform ID, same team): Create meeting → create again with same URL → 409 DUPLICATE.

Test 4 — Duplicate meetingUrl (different teams): Create meeting on Team A → create same URL on Team B → should succeed (dedup is per-team).

Test 5 — Invalid platform: Send `"platform": "WEBEX"` with a Google Meet URL → 422 VALIDATION_ERROR.

Test 6 — Past scheduledAt: Send scheduledAt 1 hour ago → 422 VALIDATION_ERROR.

Test 7 — Missing required field: Body without `meetingUrl` → 422 VALIDATION_ERROR with field-level error.

### List Meetings Tests

Test 1 — No filters: Returns cursor-paginated list ordered by scheduledAt DESC.

Test 2 — Status filter: `?status=DONE` returns only DONE meetings.

Test 3 — Search filter: `?search=standup` returns only meetings with "standup" in title (case-insensitive).

Test 4 — Date range filter: `?from=2026-05-01&to=2026-05-31` returns meetings in range.

Test 5 — Cursor pagination: Fetch page 1 → get `nextCursor` → fetch page 2 with cursor → no duplicates.

Test 6 — Cross-team isolation: Team A's meetings are not visible when authenticated as Team B.

### Get Meeting Detail Tests

Test 1 — Happy path: Returns full meeting with all relations.

Test 2 — Partial include: `?include=commitments` returns commitments but not participants.

Test 3 — Wrong team: Meeting from Team A, request as Team B → 404.

### Delete Meeting Tests

Test 1 — ADMIN role: Can delete successfully.

Test 2 — MEMBER role: 403 Forbidden.

Test 3 — RECORDING status: Cannot delete → 409.

Test 4 — `?deleteTranscript=true`: Meeting deleted + MongoDB document deleted.

### Bot Tests

Test 1 — Manual add: `POST /meetings/bot/add` with valid URL → 200 BOT_JOINING.

Test 2 — Remove bot: `DELETE /meetings/:id/bot` → 200 CANCELLED.

---

## 19. End-of-Day Checklist

### Create Meeting
- [ ] `POST /meetings` returns 201 with `recallBotId` present
- [ ] Bot is visible in Recall.ai dashboard after creation
- [ ] Redis dedup key is set: `redis-cli GET bot:scheduled:zoom:*`
- [ ] Duplicate meetingUrl (same team) → 409 DUPLICATE
- [ ] Duplicate meetingUrl (different team) → 201 (allowed)
- [ ] FREE plan 6th meeting → 402 PLAN_LIMIT with `{ used: 5, limit: 5, upgradeUrl }`
- [ ] Missing `meetingUrl` field → 422 VALIDATION_ERROR
- [ ] Past `scheduledAt` → 422 VALIDATION_ERROR
- [ ] Platform mismatch (Zoom URL + GOOGLE_MEET platform) → 422
- [ ] Recall.ai API key missing from env → startup fails fast (env validation)
- [ ] Recall.ai unavailable (simulate with wrong API URL) → 502 INTEGRATION_ERROR

### List Meetings
- [ ] `GET /meetings` returns cursor-paginated response
- [ ] `?status=DONE` filter works
- [ ] `?search=standup` is case-insensitive
- [ ] `?from=2026-05-01` date filter applied correctly
- [ ] Second page with cursor returns no duplicates from first page
- [ ] Team B cannot see Team A's meetings

### Get Meeting Detail
- [ ] Full meeting detail with all relations returned
- [ ] `?include=commitments` returns commitments only
- [ ] Wrong team meeting → 404 (not 403 — never reveal team ownership)

### Transcript
- [ ] Unprocessed meeting transcript → 404 TRANSCRIPT_NOT_AVAILABLE
- [ ] Processed meeting with `mongoTranscriptId` → 200 with turns array

### Bot Control
- [ ] `POST /meetings/bot/add` → 200 BOT_JOINING status
- [ ] `DELETE /meetings/:id/bot` → 200 CANCELLED status

### Delete Meeting
- [ ] ADMIN role → 200 deleted
- [ ] MEMBER role → 403 Forbidden
- [ ] RECORDING status → 409 cannot delete active recording
- [ ] `?deleteTranscript=true` → MongoDB document also deleted

### State Machine
- [ ] SCHEDULED → BOT_JOINING: valid transition
- [ ] DONE → CANCELLED: throws 409 INVALID_STATUS_TRANSITION
- [ ] RECORDING → PROCESSING: valid transition
- [ ] Invalid transition logged with full context in Pino

### Performance & Security
- [ ] Team plan cache hit: meeting creation completes in < 100ms
- [ ] Team plan cache miss: meeting creation completes in < 300ms (includes DB query)
- [ ] No `teamId` in JWT → 401 AUTH_REQUIRED
- [ ] RECALL_API_KEY not in env → server refuses to start (env validation)
- [ ] All meeting endpoints return `X-Request-ID` response header
- [ ] Recall.ai API key never appears in logs or Sentry events

---

## Appendix A — Environment Variables Required Today

```
# Recall.ai (required — server fails to start without this)
RECALL_API_KEY=recall_api_key_here
RECALL_WEBHOOK_SECRET=recall_webhook_secret_here

# Backend URL (for Recall.ai webhook callback)
API_URL=https://api.vocaply.com

# MongoDB (required for transcript operations)
MONGODB_URL=mongodb+srv://...

# Already set from previous days
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
```

---

## Appendix B — Dependencies to Install

```bash
# If not already installed from previous days:
pnpm add axios                   # Recall.ai HTTP client
pnpm add mongoose                # MongoDB ODM (or use native driver)
pnpm add @types/mongoose --save-dev

# Platform URL parsing util
pnpm add url-parse               # URL parsing (or use native URL class)
```

All other dependencies (Prisma, Zod, ioredis, express, Pino) were installed in earlier days.

---

## Appendix C — Quick Decision Reference

```
QUESTION                                    ANSWER
────────────────────────────────────────────────────────────────────────
Where does bot scheduling happen?           Service layer, before DB write
What if Recall.ai is down?                  Return 502, do NOT create meeting
What if Redis dedup key write fails?        Log warning, return success
What if DB unique constraint fires?         Catch P2002, return 409 DUPLICATE
Can MEMBER delete a meeting?               No — ADMIN+ only
Can any role add a bot manually?           Yes — any authenticated user
Is the dedup key per-team or global?       Per-team (platform+meetingId only)
Should list endpoint cache in Redis?        No — too volatile, use DB indexes
Should detail endpoint cache in Redis?      Only for DONE meetings
What cursor field to use?                   (scheduledAt, id) composite
Is transcript stored in Postgres?          No — MongoDB only
Is transcript ID stored in Postgres?       Yes — meetings.mongoTranscriptId
What happens on duplicate Recall webhook?  State machine is idempotent — no-op
```

---

*Document: DAY-17-PLAN-001 | Vocaply | Day 17: Meetings API*
*Full Scalable Industry-Level Build Plan | Senior Engineer Edition*
*8 endpoints · State machine · 2-layer dedup · Plan limits · Recall.ai integration*
*Security-first · Performance-optimized · Production-grade*
