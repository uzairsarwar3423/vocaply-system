# Vocaply — Day 24: Notifications API + Socket.io Server + Analytics Foundations
## Full Scalable Industry-Level Build Plan
> Senior Backend Engineer Edition | Production-Grade | Security-First | 1M+ Users
> No Code — Pure Architecture, Logic, Security & Performance Plan
> Document: DAY-24-PLAN-001 | Version 1.0 | June 2026

---

## Table of Contents

1. [Day Overview & Strategic Importance](#1-day-overview--strategic-importance)
2. [8-Hour Time Allocation](#2-8-hour-time-allocation)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Part A — Notifications API](#4-part-a--notifications-api)
5. [Part B — Socket.io Server (Formal Stand-Up)](#5-part-b--socketio-server-formal-stand-up)
6. [Part C — Analytics API Foundations](#6-part-c--analytics-api-foundations)
7. [Retroactive Correctness Audit (Days 16–20 Emits)](#7-retroactive-correctness-audit-days-1620-emits)
8. [API Endpoints — Full Specification](#8-api-endpoints--full-specification)
9. [Security Architecture](#9-security-architecture)
10. [Performance & Scalability Architecture](#10-performance--scalability-architecture)
11. [Error Handling Strategy](#11-error-handling-strategy)
12. [Caching Strategy](#12-caching-strategy)
13. [Multi-Tenant & Role-Based Isolation Design](#13-multi-tenant--role-based-isolation-design)
14. [Types & Interfaces](#14-types--interfaces)
15. [Testing Plan](#15-testing-plan)
16. [End-of-Day Checklist](#16-end-of-day-checklist)

---

## 1. Day Overview & Strategic Importance

### Why Today Is a "Make It True" Day, Not a "Build It New" Day

Days 16–20 mein bohat saari services aur workers ne `io.to(...).emit(...)` likha tha — Socket.io ko ek **promise** ke tor pe treat karte hue, jaisay woh already exist karta tha. Aaj woh promise **truth** banti hai. Yeh ek subtle lekin critical distinction hai: aaj ka kaam sirf "naya feature banana" nahi hai, balke **retroactively verify karna** hai ke pichle 5 dinon ka realtime code waqai kaam karega jab server real ho.

```
WHY THIS DAY HAS THREE SEEMINGLY UNRELATED PARTS (Notifications, Socket.io,
Analytics) BUILT TOGETHER:

  They share ONE underlying theme: "infrastructure that other features
  have been silently depending on since Day 16-20, finally made real."

  - notify.worker (Day 18) has been checking `notification_preferences`
    in its logic from day one — but there was no API to actually SET
    those preferences. Today closes that loop.
  - Every worker since Day 18 has called getIO().to(...).emit(...) — but
    getIO() would have THROWN ('Socket.io not initialized') if any of
    those code paths had actually run before today, because nothing had
    EVER called setIO(). Today is the day that landmine gets defused.
  - team-health.service.ts (Day 16) and the LLD's documented aggregation
    SQL have existed as DESIGN since the early docs — today is the first
    day they're wired to a real, callable endpoint.

PRINCIPLE FOR TODAY:
  "Find every place the system has been trusting an unbuilt promise, and
   build the promise — then go back and PROVE the trust was justified."
```

### What Gets Built Today

```
✅ Notifications API: 3 endpoints (get/patch preferences, test-send)
✅ Socket.io server: formal initialization, JWT handshake auth, Redis
   adapter for multi-server fan-out, room-join handlers
✅ Analytics API: 3 endpoints (overview, members, trends) — first REAL
   aggregation queries in the whole product
✅ A full retroactive audit of every Socket.io emit written since Day 16
✅ Cache-key period-hashing utility shared by all 3 analytics endpoints
```

### Downstream Impact

```
Day 41   — Settings → Notifications UI is a direct, unmodified consumer
            of today's 3 endpoints.
Day 39   — Frontend WebSocket integration (live bot status, realtime
            events) is only POSSIBLE because today's server formally exists.
Day 60   — Slack notification expansion (more templates) reuses today's
            preference-checking logic unchanged — it's a content
            addition, not a logic addition.
Day 81   — Analytics dashboard charts consume EXACTLY today's 3 endpoint
            response shapes — any contract drift discovered today is far
            cheaper to fix now than after a chart has been built against it.
Day 88   — In-app notification bell is the natural next layer ON TOP of
            today's preferences API + Socket.io server (a future day's
            'inApp' delivery channel routes through the same server
            stood up today).
```

---

## 2. 8-Hour Time Allocation

```
9:00 AM  – 9:45 AM    → notifications.repository.ts + notifications.types.ts
9:45 AM  – 10:45 AM   → notifications.service.ts (preferences CRUD,
                         merge logic, test-send orchestration)
10:45 AM – 11:30 AM   → notifications.controller.ts + routes + validator
11:30 AM – 12:00 PM   → socket.events.ts (canonical event registry) +
                         rooms.manager.ts (room-join logic)
12:00 PM – 1:00 PM    → Lunch break
1:00 PM  – 2:00 PM    → socket.server.ts (JWT handshake auth, Redis
                         adapter wiring, connection lifecycle)
2:00 PM  – 2:30 PM    → server.ts wiring (httpServer + setIO() ordering)
2:30 PM  – 3:30 PM    → analytics.repository.ts (3 raw aggregation queries
                         via Prisma $queryRaw)
3:30 PM  – 4:15 PM    → analytics.service.ts (role-scoping, cache-key
                         hashing, team-health.service.ts reuse)
4:15 PM  – 4:45 PM    → analytics.controller.ts + routes + validator
4:45 PM  – 5:30 PM    → Retroactive audit pass: every Socket.io emit
                         since Day 16, re-verified against today's real server
5:30 PM  – 6:00 PM    → Multi-process Redis-adapter test + Postman testing
                         + End-of-Day checklist sign-off
```

---

## 3. File Structure to Create

```
services/api/src/modules/notifications/
├── notifications.controller.ts          ← HTTP layer ONLY
├── notifications.service.ts             ← preferences CRUD + test-send orchestration
├── notifications.repository.ts          ← notification_preferences DB queries ONLY
├── notifications.validator.ts           ← Zod schemas (strict, unknown-key-rejecting)
├── notifications.types.ts               ← TypeScript interfaces
└── notifications.routes.ts              ← Route + middleware chain

services/api/src/realtime/
├── socket.server.ts                     ← FORMAL stand-up — JWT auth, Redis adapter
├── socket.events.ts                     ← Canonical event name registry (single
│                                           source of truth, shared with frontend
│                                           via the EXACT same constant strings)
└── rooms.manager.ts                     ← team:/user:/meeting: room join/leave logic

services/api/src/modules/analytics/
├── analytics.controller.ts              ← HTTP layer ONLY
├── analytics.service.ts                 ← overview + member breakdown + trends logic
├── analytics.repository.ts              ← raw aggregation SQL via Prisma $queryRaw
├── analytics.validator.ts               ← Zod schemas for date-range/query params
├── analytics.types.ts                   ← TypeScript interfaces
└── analytics.routes.ts                  ← Route + middleware chain

services/api/src/utils/
└── period-hash.ts                       ← NEW shared utility — hash(teamId, from, to)
                                            used by ALL THREE analytics cache keys

services/api/src/
└── server.ts                            ← UPDATED — httpServer + initializeSocketServer
                                            + setIO() wiring, correct boot ORDER enforced
```

### Dependency Flow (No Circular Dependencies)

```
notifications.routes.ts
  └── notifications.controller.ts
        └── notifications.service.ts
              ├── notifications.repository.ts
              ├── cache.service.ts            (ALREADY EXISTS — Day 11)
              └── notify.worker's send functions (REUSED for test-send,
                  NOT reimplemented — one delivery pipeline, two callers:
                  the real notify queue AND this test endpoint)

analytics.routes.ts
  └── analytics.controller.ts
        └── analytics.service.ts
              ├── analytics.repository.ts      (raw SQL aggregates)
              ├── team-health.service.ts       (ALREADY EXISTS — Day 16, reused)
              ├── period-hash.ts               (NEW shared utility)
              └── cache.service.ts             (ALREADY EXISTS — Day 11)

server.ts (boot sequence — ORDER IS THE CRITICAL CORRECTNESS POINT TODAY)
  1. const httpServer = createServer(app)
  2. const io = initializeSocketServer(httpServer)
  3. setIO(io)                      ← MUST run before step 4
  4. httpServer.listen(PORT)
  5. (workers, if in the same process, or separate worker processes that
     import getIO() — either way, getIO() must NEVER be reachable before
     step 3 has executed)

RULE CARRIED FORWARD: providers/services never reach upward into the
realtime layer except through the getIO()/socket.events.ts pair — no
service file constructs its own Socket.io client or duplicates room-name
string literals; every room name is built via rooms.manager.ts helpers.
```

---

## 4. Part A — Notifications API

### File: `notifications.repository.ts`

**Responsibility:** All Prisma queries against `notification_preferences`. Zero business logic.

```
findByUserId(userId): Promise<NotificationPreferences | null>
  → Returns null if no row exists yet — the SERVICE decides whether to
    return a default shape or lazily create, the repository just reports
    ground truth

upsert(userId, mergedPreferences): Promise<NotificationPreferences>
  → Single upsert call — create with the full merged shape if absent,
    update if present; the MERGE itself happens in the service layer,
    this function receives an already-merged object and just persists it
```

### File: `notifications.service.ts`

### Function: `getPreferences(userId)`

```
1. row = repo.findByUserId(userId)
2. IF !row → return DEFAULT_PREFERENCES constant (a hardcoded, exported
   shape matching exactly what's documented in the DB schema doc's
   notification_preferences default JSONB) — this is a READ-ONLY
   fallback, NOTHING is written to the DB on this path
3. ELSE → return row.preferences
```

### Function: `updatePreferences(userId, partialUpdate)`

```
1. Zod-validate partialUpdate against a schema that mirrors the EXACT
   preferences shape (email.meetingSummary, email.deadlineReminder,
   email.commitmentMissed, email.weeklyDigest, email.paymentAlerts,
   slack.meetingSummary, slack.deadlineReminder, slack.commitmentMissed,
   slack.dailyDigest, slack.personalDMs, inApp.all) — every key typed as
   strict boolean, UNKNOWN KEYS REJECTED (not stripped silently, REJECTED
   with a 422 — a typo'd key like "emial.meetingSummary" must surface as
   an error to the client, never silently vanish into nothing while the
   user believes their preference was saved)
2. current = await getPreferences(userId)   ← reuses the function above,
   so the "default if missing" logic is written ONCE, not duplicated
3. merged = deepMerge(current, partialUpdate)
   — a TRUE deep merge (email.* sub-keys merge independently of slack.*
   sub-keys), NOT a shallow Object.assign — same merge philosophy
   explicitly carried over from Day 16's team.settings update logic,
   referenced directly so any engineer reading this code recognizes the
   pattern from elsewhere in the codebase rather than re-deriving it
4. repo.upsert(userId, merged)
5. redis.del(`cache:user:${userId}`)
   — preferences are embedded in the cached user object that
   notify.worker reads per-send; invalidating here is what keeps that
   worker's view fresh without it needing to query Postgres on every notification
6. Return merged
```

### Function: `sendTestNotification(userId, teamId, { channel, type })`

```
1. Validate channel ∈ {'email','slack'}, type ∈ the documented
   NotificationType enum (reused from the DB schema's notification_type
   enum — not a new ad-hoc string union invented today)
2. Load the user + team context needed by whichever underlying send
   function is being tested (e.g., for type=DEADLINE_REMINDER + channel=
   email, this needs a representative commitment-shaped payload — built
   from a SYNTHETIC/sample object when no real commitment exists, clearly
   marked as a test send in its content, e.g., "This is a test
   notification from Vocaply")
3. CRITICAL DESIGN DECISION: this function calls the EXACT SAME
   send-function that notify.worker calls for the real, queue-driven path
   (e.g., emailService.sendDeadlineReminder(...) or
   slackNotifyService.sendDeadlineReminderDM(...)) — it does NOT go
   through the queue itself (a test-send should be synchronous and
   immediate, the user is staring at a button waiting for confirmation),
   but it DOES go through the same underlying delivery function as the
   real pipeline, so a successful test genuinely proves the real path works
4. Return { sent: boolean, channel, type, sentAt }
   — IF the channel's integration isn't connected (e.g., testing 'slack'
   with no Slack integration active) → return { sent: false, reason:
   'SLACK_NOT_CONNECTED' } rather than throwing, since this is a normal,
   expected state for the UI to handle gracefully (e.g., "Connect Slack first")
```

### File: `notifications.validator.ts`

```
updatePreferencesSchema
  → A FULLY EXPLICIT Zod object (NOT z.record or any permissive catch-all)
    with every documented key typed boolean and OPTIONAL (since this is a
    PARTIAL update) — z.strict() mode applied so any extra key throws a
    validation error rather than being silently dropped

testNotificationSchema
  channel: enum ['email', 'slack']
  type: enum [...all documented NotificationType values]
```

### File: `notifications.controller.ts` + `notifications.routes.ts`

```
GET    /notifications/preferences
  chain: requireAuth → controller   (no injectTenant needed — this is
  purely user-scoped data, not team-scoped, so the tenant middleware adds
  nothing here and is correctly OMITTED rather than included "just in case")

PATCH  /notifications/preferences
  chain: requireAuth → validate(updatePreferencesSchema) → controller

POST   /notifications/test
  chain: requireAuth → injectTenant → testNotificationRateLimiter (NEW,
  3/60s per user) → validate(testNotificationSchema) → controller
```

---

## 5. Part B — Socket.io Server (Formal Stand-Up)

### File: `socket.events.ts`

**Responsibility:** The single source of truth for every Socket.io event name string used anywhere in the backend — and, critically, the SAME literal strings the frontend's `socket.events.ts` (built later, Day 39) will use. Today's file is written as the canonical registry both sides converge on.

```
Organized into clearly separated groups (matching the HLD's documented
event catalog EXACTLY — no new event names invented today beyond what
was already specified):

CLIENT_EVENTS:
  JOIN_TEAM, LEAVE_TEAM, JOIN_MEETING, LEAVE_MEETING, PRESENCE_PING

SERVER_EVENTS:
  MEETING_BOT_JOINING, MEETING_RECORDING, MEETING_PROCESSING,
  MEETING_PROCESSED, MEETING_FAILED, TRANSCRIPT_TURN,
  COMMITMENT_CREATED, COMMITMENT_FULFILLED, COMMITMENT_MISSED,
  COMMITMENT_DEFERRED, MY_DEADLINE_TODAY, MY_DEADLINE_MISSED,
  MY_SCORE_UPDATED, MEMBER_SCORE_UPDATED, MEMBER_JOINED, MEMBER_REMOVED,
  SYSTEM_SESSION_EXPIRED, SYSTEM_PLAN_LIMIT,
  INTEGRATION_CONNECTED, INTEGRATION_DISCONNECTED, ACTION_ITEM_SYNCED

DESIGN RULE: every emit() call anywhere in the codebase, from today
forward, MUST import its event name from this file — a raw string literal
like io.emit('commitment:fulfilled', ...) typed inline anywhere is treated
as a code-review rejection from today onward, since it's exactly the kind
of drift that makes frontend/backend event names quietly diverge over time.
```

### File: `rooms.manager.ts`

**Responsibility:** The only place room-name strings are constructed, and the only place join/leave authorization logic for opt-in rooms lives.

```
teamRoom(teamId) → `team:${teamId}`
userRoom(userId) → `user:${userId}`
meetingRoom(meetingId) → `meeting:${meetingId}`

handleJoinMeeting(socket, { meetingId }):
  1. VERIFY the meeting belongs to socket.data.teamId BEFORE joining —
     fetches the meeting's teamId via a lightweight repository call and
     compares against the authenticated socket's own team context
  2. IF mismatch → reject silently (no error emitted back that would
     reveal whether the meetingId exists at all for a different team —
     same "never reveal cross-tenant existence" principle applied
     throughout the REST API, now applied to the realtime layer too)
  3. IF match → socket.join(meetingRoom(meetingId))

handleLeaveMeeting(socket, { meetingId }):
  → socket.leave(meetingRoom(meetingId)) — no verification needed, leaving
    a room you're not even in is always safe
```

### File: `socket.server.ts`

### Function: `initializeSocketServer(httpServer)`

```
1. Construct the Socket.io server instance:
   - cors: { origin: FRONTEND_URL, credentials: true }
     (FRONTEND_URL constant, never a wildcard '*' — an open CORS policy
     on a WebSocket server that carries authenticated, tenant-scoped data
     would be a real cross-origin data-leak vector)
   - transports: ['websocket']   (skip the long-polling fallback entirely
     — deliberate choice: polling adds load-balancer/sticky-session
     complexity for marginal benefit at this product's target audience,
     who are on modern browsers in business environments)
   - pingTimeout: 20000, pingInterval: 25000 — tuned values from the HLD,
     applied for real today rather than just documented

2. ATTACH THE REDIS ADAPTER — the single most important line written today:
   io.adapter(createAdapter(redisPubClient, redisSubClient))
   — TWO SEPARATE Redis connections (pub + sub) are required by the
   adapter's own design, NOT the same connection object reused for both
   roles (a Redis client in subscribe mode cannot issue normal commands
   on the same connection) — this is a common first-time mistake
   explicitly guarded against today by using two distinct ioredis client
   instances, both pointed at the same REDIS_URL

3. JWT AUTH MIDDLEWARE on handshake:
   io.use(async (socket, next) => {
     token = socket.handshake.auth?.token
     IF !token → next(new Error('NO_TOKEN'))
     TRY: payload = jwt.verify(token, JWT_SECRET, { algorithms:['HS256'],
       issuer:'vocaply.com', audience:'vocaply-api' })
       socket.data = { userId: payload.sub, teamId: payload.teamId,
                        role: payload.role }
       next()
     CATCH (TokenExpiredError) → next(new Error('TOKEN_EXPIRED'))
     CATCH (other) → next(new Error('INVALID_TOKEN'))
   })
   — THIS IS THE EXACT SAME verification logic, SAME secret, SAME
   algorithm/issuer/audience checks as requireAuth's REST middleware (Day
   6) — deliberately not reimplemented from scratch; the JWT verification
   CALL ITSELF should ideally be extracted into one shared helper function
   that BOTH requireAuth and this handshake middleware call, so a future
   JWT config change (e.g., rotating algorithms) only needs updating once

4. ON CONNECTION:
   socket.join(rooms.teamRoom(socket.data.teamId))
   socket.join(rooms.userRoom(socket.data.userId))
   socket.on('join:meeting', (payload) => rooms.handleJoinMeeting(socket, payload))
   socket.on('leave:meeting', (payload) => rooms.handleLeaveMeeting(socket, payload))
   socket.on('disconnect', (reason) => logger.debug({ userId, reason }, 'socket disconnected'))

5. RETURN the io instance — the caller (server.ts) is responsible for
   calling setIO(io) immediately after this function returns
```

### `getIO()` / `setIO()` Singleton — Confirmed, Not Rebuilt

```
This singleton pair was ALREADY DEFINED in the realtime module's design
since Day 16/18 (every worker has been importing getIO() since then).
Today's work is NOT to redefine this singleton, but to:
  a) Confirm setIO(io) is called at EXACTLY the right point in server.ts's
     boot sequence (see Section 3's dependency flow — step 3, before step 4)
  b) Confirm getIO() throws a CLEAR, LOUD error ('Socket.io not
     initialized') if called before setIO() ever ran — this guard already
     existing is what makes today's retroactive audit (Section 7)
     possible: if any Day 16-20 code path had been exercised before this
     guard, it would have crash-failed LOUDLY in earlier testing rather
     than silently no-op'ing, which is exactly the kind of fail-fast
     behavior that should be confirmed present, not assumed
```

### `server.ts` — Boot Sequence Wiring

```
const app = createExpressApp()
const httpServer = createServer(app)        ← raw Node http server, NOT
                                               app.listen() directly, since
                                               Socket.io needs to attach to
                                               the same underlying server
const io = initializeSocketServer(httpServer)
setIO(io)                                    ← MUST happen here, before listen
httpServer.listen(PORT, () => logger.info({ port: PORT }, 'server started'))

// Graceful shutdown (carried over from earlier days' server.ts, EXTENDED
// today to also close Socket.io connections cleanly):
process.on('SIGTERM', async () => {
  io.close()
  await httpServer.close()
  await prisma.$disconnect()
  process.exit(0)
})
```

---

## 6. Part C — Analytics API Foundations

### File: `period-hash.ts` (Shared Utility)

```
buildPeriodHash(teamId, from, to): string
  → A short, deterministic hash (e.g., first 12 chars of a SHA-256 of
    `${teamId}:${from.toISOString()}:${to.toISOString()}`) used as the
    cache-key suffix for ALL THREE analytics endpoints
  → WHY THIS EXISTS AS ITS OWN FILE: without it, each of the three
    endpoints would invent its own slightly-different cache-key string
    format (one might use raw ISO strings, another might round to dates
    only) — written once, every endpoint's cache key looks identical in
    shape, and any future "invalidate all analytics cache for this team"
    operation can reason about the key format consistently
```

### File: `analytics.repository.ts`

### Function: `getOverviewAggregates(teamId, from, to)`

```
ONE single Prisma $queryRaw call using FILTER (WHERE ...) clauses — the
EXACT pattern documented in the LLD's "Monthly Commitment Rate" query —
computing in ONE round trip:
  total, fulfilled, missed, pending, deferred,
  fulfillmentRate (computed via the FILTER-based ratio, NULLIF-guarded
    against division by zero exactly as the LLD's reference query does),
  avgDaysOverdue (AVG over the missed subset's resolvedAt - dueDate),
  meetingsThisPeriod (a second small aggregate against the meetings
    table, joined into the SAME query via a UNION-free design — i.e.,
    written as two CTEs combined in one statement, not two separate
    round trips, since avoiding N+1-style multiple queries is the
    explicit goal documented in the Day 24 source notes)
RETURNS the raw row shape — formatting/rounding for display happens in
the SERVICE layer, never inside the SQL itself (keeps the query portable
and testable independent of presentation concerns)
```

### Function: `getMemberBreakdown(teamId, from, to)`

```
THE EXACT LEFT JOIN query already fully specified in the LLD's "Member
analytics breakdown" section — today's repository function is a direct,
unmodified translation of that already-designed SQL into a callable
Prisma $queryRaw function:
  SELECT u.id, u.name, u.avatarUrl, u.role, u.commitmentScore,
         COUNT(c.id) total, COUNT(...) FILTER fulfilled, missed, pending,
         fulfillmentRate (FILTER-based ratio)
  FROM users u LEFT JOIN commitments c ON ... AND c.createdAt BETWEEN from/to
  WHERE u.teamId = $1 AND u.deletedAt IS NULL
  GROUP BY u.id, ...
  ORDER BY u.commitmentScore DESC
RETURNS one row per team member, INCLUDING members with zero commitments
in the period (the LEFT JOIN's whole purpose — an INNER JOIN here would
silently drop members who happened to have no activity, which would be a
real correctness bug in a "team health" view)
```

### Function: `getTrendPoints(teamId, metric, granularity, from, to)`

```
Branches on `metric`:
  'fulfillmentRate' → groups commitments by week/month bucket (using
    DATE_TRUNC('week'|'month', createdAt)), computes the same FILTER-based
    ratio PER BUCKET
  'meetingsCount' → groups meetings by the same bucket granularity,
    simple COUNT(*) per bucket
TODAY'S EXPLICIT TRADEOFF (documented inline, not hidden): this reads
LIVE from the commitments/meetings tables rather than a pre-aggregated
table. At the HLD's documented current-scale capacity estimates, this is
acceptable. The function's RETURN SHAPE is deliberately written to be
IDENTICAL to what a future pre-computed-table-backed version would
return — so swapping the implementation later (Sunday-midnight
pre-computation, mentioned as a future optimization) requires NO contract
change for any caller, frontend or otherwise.
```

### File: `analytics.service.ts`

### Function: `getOverview(teamId, from, to, requesterRole)`

```
1. cacheKey = `cache:analytics:overview:${teamId}:${buildPeriodHash(teamId,from,to)}`
2. Try Redis → return on hit
3. raw = repo.getOverviewAggregates(teamId, from, to)
4. teamHealthScore = await teamHealthService.calculate(teamId)   ← REUSES
   Day 16's team-health.service.ts function UNCHANGED — today does not
   reimplement that algorithm, it simply calls it and folds the result
   into this response
5. shaped = {
     fulfillmentRate: round(raw.fulfillmentRate),
     totalCommitments: raw.total, fulfilled: raw.fulfilled,
     missed: raw.missed, pending: raw.pending,
     avgDaysOverdue: round(raw.avgDaysOverdue, 1),
     meetingsThisPeriod: raw.meetingsThisPeriod,
     avgMeetingDuration: raw.avgMeetingDuration,
     teamHealthScore
   }
   (rounding/shaping happens HERE, never in the SQL — see repository note)
6. redis.setex(cacheKey, 300, JSON.stringify(shaped))
7. Return shaped
   NOTE: requesterRole is accepted as a parameter but NOT currently used
   to alter this specific response's shape — overview is genuinely
   team-level, no personal data inside it, so EVERY role sees the
   identical payload; the parameter exists for signature consistency
   with getMembers (which DOES branch on role) and as a forward-looking
   hook should overview ever need role-based redaction later
```

### Function: `getMembers(teamId, from, to, requesterId, requesterRole)`

```
1. cacheKey = `cache:analytics:members:${teamId}:${buildPeriodHash(...)}`
2. Try Redis → on hit, STILL apply the role-filter step below before
   returning (the CACHE stores the FULL team breakdown; filtering for a
   MEMBER's restricted view happens on every read, cached or not — this
   means the cache is shared/reused across different requesters
   regardless of role, which is more cache-efficient than caching a
   separate pre-filtered copy per role)
3. fullBreakdown = repo.getMemberBreakdown(teamId, from, to)  [from cache
   or freshly computed + then cached]
4. IF requesterRole === 'MEMBER':
     RETURN [fullBreakdown.find(row => row.userId === requesterId)] —
     an array containing ONLY their own row, or an empty array if
     somehow not found (never null/undefined — consistent "always an
     array" contract for the frontend)
   ELSE (MANAGER/ADMIN/OWNER):
     RETURN fullBreakdown unchanged — full team visibility
5. THIS FILTERING HAPPENS IN THE SERVICE LAYER, explicitly NOT only via
   route-level requireRole — the route-level check would only block
   non-members entirely; the service-layer filter is what correctly
   allows a MEMBER to call the endpoint (since MEMBERs DO need to see
   their OWN performance) while still preventing them from seeing
   anyone else's row, a distinction a simple requireRole('MANAGER') gate
   could not express on its own
```

### Function: `getTrends(teamId, metric, granularity, from, to)`

```
1. cacheKey = `cache:analytics:trends:${teamId}:${metric}:${granularity}:${buildPeriodHash(...)}`
2. Try Redis → return on hit
3. points = repo.getTrendPoints(teamId, metric, granularity, from, to)
4. summary = { average: round(mean(points.map(p=>p.value))),
   highest: max(...), lowest: min(...),
   trend: compareFirstHalfVsSecondHalf(points) }
   (the trend-direction comparison reuses the SAME "improving/stable/
   declining" threshold logic — diff > 5 → improving, < -5 → declining —
   already established in score.service.ts since Day 19, NOT a
   newly-invented threshold for this one endpoint)
5. redis.setex(cacheKey, 300, JSON.stringify({ points, summary }))
6. Return { points, summary }
```

### File: `analytics.validator.ts`

```
dateRangeQuerySchema
  from: ISO date string, optional, defaults to start of current month
  to:   ISO date string, optional, defaults to now
  REFINEMENT: from must be <= to (reject inverted ranges with 422)

trendsQuerySchema (extends dateRangeQuerySchema)
  metric: enum ['fulfillmentRate', 'meetingsCount']
  granularity: enum ['week', 'month'], default 'week'
```

### File: `analytics.controller.ts` + `analytics.routes.ts`

```
GET /analytics/overview
  chain: requireAuth → injectTenant → validate(dateRangeQuerySchema) → controller
  (Role: Any — no requireRole gate, since the SERVICE returns the same
  team-level shape regardless of role)

GET /analytics/members
  chain: requireAuth → injectTenant → validate(dateRangeQuerySchema) → controller
  (Role: Any at the ROUTE level — deliberately NOT requireRole('MANAGER')
  here, since a MEMBER must be allowed to reach the service layer to get
  their OWN filtered row; the role-based DATA restriction happens inside
  analytics.service.getMembers as detailed above)

GET /analytics/trends
  chain: requireAuth → injectTenant → validate(trendsQuerySchema) → controller
```

---

## 7. Retroactive Correctness Audit (Days 16–20 Emits)

### Why This Section Exists as Formal, Scheduled Work (Not an Afterthought)

```
Every io.to(...).emit(...) call written in:
  - Day 16: member:joined, member:removed, my:role_updated, system:removed_from_team
  - Day 17: meeting:processing (from the webhook design carried into the
    meetings module), bot status events
  - Day 18: meeting:bot_joining, meeting:recording, meeting:processing,
    meeting:processed, meeting:failed, transcript:turn
  - Day 19: commitment:fulfilled, commitment:deferred, commitment:missed,
    my:commitment_missed, member:score_updated
  - Day 20: action_item:synced (Day 21's addition, same family)

...was written AGAINST A SOCKET.IO SERVER THAT DID NOT YET FORMALLY EXIST.
getIO() either would have thrown, or (worse, if some earlier stub silently
no-op'd it) would have made these emits silently vanish into nothing with
no error surfaced anywhere. TODAY IS THE FIRST DAY THESE LINES OF CODE CAN
ACTUALLY BE EXECUTED AND OBSERVED.
```

### The Audit Procedure (Performed Today, Not Skipped)

```
FOR EACH emit call found via a codebase-wide search of `.emit(`:
  CHECK 1 — Room scoping: does it target `team:${teamId}` or
    `user:${userId}` via rooms.manager.ts's helper functions, or does it
    use a raw string or (worse) io.emit() with no room at all? ANY
    instance of unscoped global emit found today is a BUG to fix today,
    not defer — a global emit reaching every connected client regardless
    of team would be a direct cross-tenant data leak the moment Socket.io
    becomes real.

  CHECK 2 — Call-site safety: is the emit wrapped so that if getIO()
    THROWS (e.g., in some theoretical future where the server hasn't
    initialized) or the .emit() call itself errors, the underlying
    business operation (the DB write that triggered the notification)
    is UNAFFECTED? Per the HLD's reliability principle restated
    explicitly here: realtime notification is a nice-to-have layered ON
    TOP of the source-of-truth write, never a dependency of it. Today's
    audit confirms every one of last week's emit call sites is wrapped
    in a try/catch (or equivalent) that swallows a Socket.io-layer
    failure without propagating it upward.

  CHECK 3 — Event name source: does the call import its event string
    from today's NEW socket.events.ts registry? Calls written before
    today obviously used inline string literals (the registry didn't
    exist yet) — TODAY'S AUDIT INCLUDES retrofitting every one of those
    earlier call sites to import from the new registry, so from this
    point forward there is exactly ONE place event name strings are typed.

OUTPUT OF THIS AUDIT: a short list of any fixes needed, applied today,
plus a clean confirmation that the realtime foundation Days 16-20 were
quietly built on top of is now PROVEN solid, not merely assumed solid.
```

---

## 8. API Endpoints — Full Specification

### `GET /api/v1/notifications/preferences`

| Aspect | Detail |
|---|---|
| Auth | Required (no injectTenant — user-scoped, not team-scoped) |
| Response | `200` — preferences JSONB shape, defaulted if no row exists |
| Side effects | None — pure read, never writes on a miss |

### `PATCH /api/v1/notifications/preferences`

| Aspect | Detail |
|---|---|
| Auth | Required |
| Body | Partial preferences object, strict-validated, unknown keys rejected |
| Response | `200` — the full MERGED preferences object |
| Errors | `422 VALIDATION_ERROR` on unknown key or wrong type |

### `POST /api/v1/notifications/test`

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Rate limit | 3 requests / 60 seconds per user |
| Body | `{ channel: 'email'|'slack', type: NotificationType }` |
| Response | `200 { sent, channel, type, sentAt }` or `200 { sent: false, reason }` for a gracefully-handled non-error case (e.g., channel not connected) |
| Errors | `429 RATE_LIMITED` on abuse, `422 VALIDATION_ERROR` on bad channel/type |

### `GET /api/v1/analytics/overview`

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | Any |
| Query | `from`, `to` (ISO dates, optional, default current month) |
| Cache | 300s, `cache:analytics:overview:{teamId}:{periodHash}` |
| Response | `{ fulfillmentRate, totalCommitments, fulfilled, missed, pending, avgDaysOverdue, meetingsThisPeriod, avgMeetingDuration, teamHealthScore }` |

### `GET /api/v1/analytics/members`

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | Any (data filtered per-role inside the service, see Section 6) |
| Query | `from`, `to` |
| Cache | 300s, `cache:analytics:members:{teamId}:{periodHash}` (full breakdown cached once, filtered per request) |
| Response | Array of `{ userId, name, avatarUrl, role, score, total, fulfilled, missed, fulfillmentRate, trend }` — single-element array for MEMBER role |

### `GET /api/v1/analytics/trends`

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | Any |
| Query | `metric`, `granularity`, `from`, `to` |
| Cache | 300s, `cache:analytics:trends:{teamId}:{metric}:{granularity}:{periodHash}` |
| Response | `{ points: [{period,value,label,count}], summary: {average,highest,lowest,trend} }` |

### HTTP Status Code Reference (Today's Modules)

```
200  OK                → every successful read/update/test-send
422  Unprocessable     → unknown preference key, invalid channel/type,
                          inverted date range
429  Too Many Requests → test-notification rate limit exceeded
```

---

## 9. Security Architecture

### Strict Preference Validation — Closing the "Silent Corruption" Risk

```
A z.strict() Zod object, EVERY key explicitly typed, is the control that
prevents a malformed or maliciously-crafted PATCH body from injecting an
unexpected key into the preferences JSONB. Without this, notify.worker's
preference-check logic (which reads specific dotted paths like
preferences.email.commitmentMissed) could encounter an unexpected shape
later and either crash or silently misbehave — this validation is
therefore a CORRECTNESS control for a DIFFERENT, already-existing piece
of code (the worker), not just a tidiness concern for today's own endpoint.
notify.worker is ALSO updated today (a small defensive addition) to apply
a safe-default fallback if any expected key is somehow still missing,
satisfying the "belt and suspenders" principle explicitly called out in
the source notes.
```

### Socket.io Authentication — No Parallel Token System

```
The handshake JWT verification uses the IDENTICAL secret, algorithm,
issuer, and audience checks as the REST requireAuth middleware. This is a
deliberate security simplification: there is exactly ONE token lifecycle
in the entire system. A revoked refresh token, an expired access token, a
forced logout (Day 16's remove-member flow deletes refresh tokens) — all
of these have IMMEDIATE, IDENTICAL effect on both REST access and
realtime access, because both check the SAME 15-minute access token
against the SAME verification logic. There is no separate "socket token"
with its own expiry that could become a forgotten, longer-lived backdoor.
```

### Socket.io CORS — No Wildcard

```
origin: FRONTEND_URL (a specific environment-configured value), never
'*'. An authenticated WebSocket connection that accepted connections from
any origin would let a malicious page, if it could somehow obtain or
guess a valid access token (e.g., via XSS elsewhere), establish a
realtime connection and receive a stream of that user's team's events —
restricting origin closes this off as an additional defense layer beyond
the JWT check itself.
```

### Meeting Room Join — Tenant Check on a Realtime Action, Not Just REST

```
handleJoinMeeting's verification step (Section 5) is the FIRST place in
the entire system where tenant isolation is enforced on a WEBSOCKET
EVENT rather than an HTTP request. This is explicitly called out because
it's easy to assume "tenant isolation" only means REST route guards — today
proves the same discipline extends to the realtime layer's own opt-in
actions, with the same "never reveal cross-tenant existence" behavior
(silent rejection, no error that would let an attacker fish for valid
meetingIds belonging to other teams).
```

### Analytics Role-Scoping as Defense in Depth

```
Restated from Section 6: the MEMBER-row-filtering happens in the SERVICE,
not only via a route-level requireRole gate. This means even a future
internal caller of analytics.service.getMembers() from some OTHER part of
the codebase (a report-generation job, an admin tool) automatically
inherits the same data-visibility restriction without needing to
remember to re-implement a role check itself — the protection travels
with the function, not with the route.
```

### Test-Notification Abuse Prevention

```
The 3/60s rate limit exists because, unlike most rate-limited endpoints
(which protect against wasted COMPUTE), this one protects against wasted
EXTERNAL-PROVIDER QUOTA AND COST — every test send is a REAL email via
Resend or a REAL message into the team's connected Slack workspace.
Without this limit, a single user repeatedly clicking "test" could spam a
real Slack channel or burn through email-sending quota at zero cost to
the attacker but real cost/annoyance to the team.
```

---

## 10. Performance & Scalability Architecture

### Socket.io Redis Adapter — The Day's Single Biggest Architectural Unlock

```
Before today, EVERY worker's getIO().to(room).emit(...) call only ever
had ONE theoretical Socket.io server to reach (since none formally
existed, this was moot). From today forward, with the Redis adapter
attached, the moment Vocaply runs a SECOND API/Socket.io server instance
(for horizontal scaling, which the HLD's whole infrastructure section
assumes will eventually happen), an event emitted by a worker connected
to Server A's Redis Pub/Sub instantly reaches a browser client connected
to Server B — with ZERO application code changes required in any
consuming feature. This is explicitly verified today (not just trusted)
via the multi-process test in Section 15/16.
```

### Single-Query Aggregation — No N+1 Anywhere in Analytics

```
Both getOverviewAggregates and getMemberBreakdown are ONE Prisma
$queryRaw call each, using FILTER (WHERE ...) clauses to compute multiple
aggregate buckets (fulfilled/missed/pending counts, rates) in a SINGLE
round trip to Postgres. The explicitly REJECTED alternative — looping
over team members and running a separate COUNT query per member — would,
at the HLD's documented scale (25-60 members per team on GROWTH/BUSINESS
plans), turn ONE dashboard load into 25-60 sequential database round
trips. Today's design makes dashboard analytics load time INDEPENDENT of
team size, not linearly scaling with it.
```

### Shared Period-Hash Cache Keys

```
Restated from Section 6: by funneling all three endpoints' cache-key
construction through ONE utility (period-hash.ts), a future
"invalidate all analytics for team X" operation (e.g., triggered by a
bulk commitment-status change) can reliably pattern-match
cache:analytics:*:{teamId}:* across all three endpoint families with
confidence the key SHAPE is consistent, rather than needing to know three
slightly different formatting conventions.
```

### Member-Breakdown Cache Reuse Across Roles

```
Restated from Section 6 as a performance point: caching the FULL,
unfiltered team breakdown and applying the role-based filter on every
read (rather than caching a separately-filtered copy per requesting
role) means the cache hit rate for this endpoint is shared across EVERY
team member who calls it, regardless of their individual role — a
25-member team generates ONE cache-population cost, not up to 25
role-segmented ones.
```

### Trend Query — Forward-Compatible Without a Contract Change

```
Restated from Section 6: today's LIVE-read implementation of
getTrendPoints is explicitly designed so that swapping its internals for
a future pre-computed team_weekly_stats table requires editing ONLY
analytics.repository.ts's internals — the function signature and return
shape stay identical, meaning analytics.service.ts, the controller, the
route, AND (critically) the Day 81 frontend chart code that will consume
this endpoint NEVER need to change when that future optimization lands.
```

---

## 11. Error Handling Strategy

### New Error Codes Introduced Today

```
VALIDATION_ERROR (reused existing code, new triggering cases):
  - Unknown key in PATCH /notifications/preferences body
  - Invalid channel/type in POST /notifications/test
  - Inverted date range (from > to) on any analytics endpoint

RATE_LIMITED (reused existing code):
  - POST /notifications/test exceeding 3/60s

No NEW error CODES are introduced today — today deliberately reuses the
EXISTING error taxonomy (VALIDATION_ERROR, RATE_LIMITED) established
since Day 19/20, rather than inventing notification- or analytics-
specific error codes for situations that are already well-represented by
the existing vocabulary. This consistency is itself a design decision:
fewer distinct error codes for a client to handle, not more.
```

### Graceful Non-Error States (Explicitly NOT Thrown Errors)

```
- getPreferences with no existing row → returns DEFAULT_PREFERENCES,
  never a 404 (a user who hasn't customized anything yet is a NORMAL
  state, not a missing-resource error)
- sendTestNotification when the target channel isn't connected →
  { sent: false, reason } in a 200 response, never a 422/502 (this is an
  expected, common UI interaction — "try to test Slack before you've
  connected Slack" — and should feel like informative feedback, not an error page)
- Socket.io join:meeting mismatch → silent rejection, no error event
  emitted back to the client (per the tenant-isolation principle in
  Section 9 — revealing WHY the join failed would itself leak information)
```

---

## 12. Caching Strategy

```
KEY                                                          TTL
─────────────────────────────────────────────────────────────────
cache:user:{userId}  (invalidated, not newly created today)   300s
cache:analytics:overview:{teamId}:{periodHash}                 300s
cache:analytics:members:{teamId}:{periodHash}                  300s
cache:analytics:trends:{teamId}:{metric}:{granularity}:{periodHash} 300s

PATTERN: identical cache-aside approach used everywhere else in the
platform since Day 16 — check Redis, compute + populate on miss, delete
(never partially update) on any underlying data change. No NEW caching
PATTERN is introduced today, only new KEY NAMESPACES following the
existing convention, plus the new shared period-hash utility that makes
those new namespaces consistent with each other.
```

---

## 13. Multi-Tenant & Role-Based Isolation Design

```
NOTIFICATIONS API:
  User-scoped, not team-scoped — deliberately NO injectTenant on the
  GET/PATCH preferences routes, since a user's own notification
  preferences are personal data independent of which team context they're
  currently in (relevant for the documented future multi-team-membership
  v2 feature, where this design choice ages correctly without rework).
  POST /test DOES use injectTenant, since sending a test Slack message
  requires knowing WHICH team's Slack integration to use.

ANALYTICS API:
  Team-scoped via injectTenant on all three endpoints, PLUS the
  service-layer role-filter on the members endpoint specifically — this
  is the FIRST module in the build where "tenant isolation" (which team's
  data) and "role-based visibility" (which MEMBER's row within that team)
  are BOTH active simultaneously and must be reasoned about as two
  distinct, independently-enforced layers, not conflated into one check.

SOCKET.IO:
  Tenant isolation enforced at THREE points today: (1) handshake — a
  socket only ever joins ITS OWN team/user rooms, never an
  arbitrary/requested one, (2) opt-in meeting-room join — verified
  against the socket's own teamId before allowing the join, (3) every
  emit call site (audited in Section 7) confirmed to target a specific
  team:/user: room, never a global broadcast.
```

---

## 14. Types & Interfaces

### `notifications.types.ts`

```
NotificationPreferences        — the full, exact JSONB shape: nested
                                  email/slack/inApp boolean objects

PartialNotificationPreferences — Partial<> variant accepted by PATCH

TestNotificationRequest        — { channel: 'email'|'slack', type: NotificationType }

TestNotificationResult         — { sent: boolean, channel, type,
                                    sentAt?: string, reason?: string }
```

### `analytics.types.ts`

```
AnalyticsOverview     — the exact shape documented in Section 8

MemberAnalyticsRow    — { userId, name, avatarUrl, role, score, total,
                          fulfilled, missed, fulfillmentRate, trend }

TrendPoint            — { period, value, label, count }

TrendsResponse        — { points: TrendPoint[], summary: { average,
                          highest, lowest, trend } }

AnalyticsMetric       — 'fulfillmentRate' | 'meetingsCount'
AnalyticsGranularity  — 'week' | 'month'
```

### `socket.events.ts` Exported Constants (Typed, Not Just Strings)

```
Every constant exported as a `as const` string literal type, so any
TypeScript call site passing an event name gets compile-time checking
against the canonical registry rather than accepting an arbitrary string
— a typo'd event name becomes a TYPE ERROR at build time, not a silent
runtime mismatch discovered only when a frontend developer wonders why
an event "never fires."
```

---

## 15. Testing Plan

### Notifications API Tests

```
Test 1 — GET /notifications/preferences with no existing row → returns
  the documented default shape, confirms NO row was written to the DB
  as a side effect of this read.
Test 2 — PATCH with a valid partial update (e.g., only
  email.commitmentMissed: false) → confirms OTHER keys (slack.*, inApp.*)
  remain unchanged after the merge — a TRUE deep merge, not an overwrite.
Test 3 — PATCH with an unknown key (e.g., "emial.meetingSummary") → 422,
  confirms the malformed key never reaches the DB.
Test 4 — POST /test for channel='slack' when no Slack integration is
  connected → 200 { sent:false, reason:'SLACK_NOT_CONNECTED' }, never a
  500 or unhandled exception.
Test 5 — POST /test fired 4 times within 60 seconds → 4th request → 429.
```

### Socket.io Tests

```
Test 6 — Connect with a valid JWT → handshake succeeds, socket
  automatically lands in both its team: and user: rooms (assert via
  server-side room membership inspection).
Test 7 — Connect with an expired JWT → handshake rejected with
  TOKEN_EXPIRED, connection never established.
Test 8 — join:meeting for a meeting belonging to a DIFFERENT team →
  confirmed NOT joined (room membership check), confirmed NO error event
  sent back to the client.
Test 9 — THE DECISIVE MULTI-SERVER TEST: spin up two separate
  Socket.io-server-attached Node processes (or two instances in a test
  harness) both connected to the SAME Redis. Connect a test client to
  Server A. From a THIRD process (simulating a worker), call
  getIO().to(teamRoom).emit(...) against Server B's io instance. Assert
  the client connected to Server A receives the event. This is the test
  that PROVES the Redis adapter fan-out works, not merely assumes it
  because the code "looks right."
```

### Analytics Tests

```
Test 10 — GET /analytics/overview on a seeded team → fulfillmentRate
  matches an independently-run manual SQL calculation against the same
  seeded data (cross-check, not just "it returned something").
Test 11 — GET /analytics/members as a MEMBER role → response array has
  EXACTLY ONE row, and that row's userId matches the requester.
Test 12 — GET /analytics/members as a MANAGER role → response array has
  ALL team members, including ones with ZERO commitments in the period
  (confirms the LEFT JOIN, not an INNER JOIN, is actually in effect).
Test 13 — GET /analytics/trends?granularity=week over a 4-week range →
  exactly 4 (or 5, depending on week-boundary alignment) correctly
  bucketed points, each with a non-negative count.
Test 14 — Repeat any analytics call immediately → second call confirmed
  served from cache (response time < 10ms, or via a mock-call-count
  assertion on the repository layer showing zero second invocation).
Test 15 — Load-test style check: seed a team with 500+ commitments,
  confirm GET /analytics/overview still responds < 200ms on a cold cache hit.
```

---

## 16. End-of-Day Checklist

### Notifications API
```
[ ] PATCH /notifications/preferences → partial update merges correctly,
    unrelated keys untouched
[ ] Unknown key in PATCH body → 422, never silently dropped
[ ] POST /notifications/test → real email/Slack message arrives within seconds
[ ] Test-send on a disconnected channel → graceful { sent:false, reason },
    never a thrown error
[ ] 4th test-send within 60s → 429 confirmed
[ ] cache:user:{userId} invalidated after every successful PATCH
```

### Socket.io Server
```
[ ] Server boots without error; setIO() confirmed called BEFORE
    httpServer.listen() in the actual boot log/trace
[ ] Valid JWT → connects, auto-joins team: and user: rooms
[ ] Invalid/expired JWT → handshake rejected, no connection established
[ ] join:meeting for a cross-team meetingId → silently rejected, no leak
[ ] TWO-PROCESS Redis adapter test passes: event emitted against one
    server instance is received by a client connected to a DIFFERENT instance
[ ] Every emit call site from Days 16-20 audited: correct room, imports
    event name from socket.events.ts, wrapped against Socket.io-layer failure
[ ] Zero instances of a global/unscoped io.emit() found anywhere in the codebase
```

### Analytics API
```
[ ] GET /analytics/overview → fulfillmentRate cross-checked against
    manual SQL, matches exactly
[ ] GET /analytics/members → MEMBER sees only own row, MANAGER+ sees all,
    members with zero activity still appear (LEFT JOIN confirmed)
[ ] GET /analytics/trends?granularity=week → correctly bucketed points
    with accurate summary (average/highest/lowest/trend)
[ ] All 3 analytics endpoints respond < 200ms on a team with 500+ commitments
[ ] Second identical call to any of the 3 endpoints hits cache (< 10ms,
    or confirmed zero repository re-invocation)
[ ] team-health.service.ts (Day 16) confirmed REUSED, not reimplemented,
    inside analytics.service.getOverview
```

### Security & Architecture Sign-Off
```
[ ] socket.events.ts confirmed as the ONLY source of event-name string
    literals across the entire codebase (grep audit clean)
[ ] Socket.io CORS confirmed scoped to FRONTEND_URL, never a wildcard
[ ] JWT verification logic for the WS handshake confirmed identical
    secret/algorithm/issuer/audience to the REST requireAuth middleware
[ ] Analytics member-row role-filtering confirmed enforced in the
    SERVICE layer, independently testable without relying on route
    middleware alone
```

---

## Appendix A — Environment Variables Confirmed/Reused Today

```
# No NEW environment variables are introduced today — Day 24 is built
# entirely on top of infrastructure already configured in earlier days:

JWT_SECRET=...              (Day 6 — reused identically for WS handshake)
REDIS_URL=...               (Day 4/11 — TWO separate client instances
                              created from this SAME URL for the Socket.io
                              pub/sub adapter)
FRONTEND_URL=...            (used for Socket.io CORS origin AND already
                              used elsewhere for OAuth redirects)
DATABASE_URL=...            (Day 3 — analytics raw queries run against
                              this same connection pool)
```

## Appendix B — Quick Decision Reference

```
QUESTION                                          ANSWER
────────────────────────────────────────────────────────────────────────────
Is the test-notification sent via the queue?       No — synchronous,
                                                   immediate, same
                                                   underlying send function
Does Socket.io use a separate auth token?          No — same JWT, same
                                                   secret, same verification
                                                   as REST requireAuth
Why two Redis clients for the adapter?              Pub and Sub roles
                                                   cannot share one
                                                   connection object
Who decides default notification preferences?      A hardcoded constant
                                                   in the service, returned
                                                   on read-miss, never
                                                   written on read
Where does member-row role filtering happen?        Service layer — NOT
                                                   only route-level
                                                   requireRole
Does the trends endpoint read from a pre-computed
  table today?                                      No — live query,
                                                   contract-compatible
                                                   with a future swap
What proves the Redis adapter actually works?       A real two-process
                                                   test, not a code-review
                                                   assumption
```

---

*Document: DAY-24-PLAN-001 | Vocaply | Day 24: Notifications API + Socket.io Server + Analytics Foundations*
*Full Scalable Industry-Level Build Plan | Senior Engineer Edition*
*Making Five Days of Promised Realtime Code True · First Real Aggregation Queries · Defense-in-Depth Role Filtering*
*Security-first · Performance-optimized · Production-grade · No Code, Pure Architecture*
