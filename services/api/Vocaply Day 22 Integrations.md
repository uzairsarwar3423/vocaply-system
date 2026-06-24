# Vocaply — Day 22: Integrations API (Slack, Linear, Notion, Google Calendar)
## Full Scalable Industry-Level Build Plan
> Senior Backend Engineer Edition | Production-Grade | Security-First | 1M+ Users
> No Code — Pure Architecture, Logic, Security & Performance Plan
> Document: DAY-22-PLAN-001 | Version 1.0 | June 2026

---

## Table of Contents

1. [Day Overview & Strategic Importance](#1-day-overview--strategic-importance)
2. [8-Hour Time Allocation](#2-8-hour-time-allocation)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — Slack Provider (OAuth + Block Kit + DMs)](#4-layer-1--slack-provider-oauth--block-kit--dms)
5. [Layer 2 — Slack Interactive Webhook](#5-layer-2--slack-interactive-webhook)
6. [Layer 3 — Linear Provider (GraphQL)](#6-layer-3--linear-provider-graphql)
7. [Layer 4 — Notion Provider (Pages/Database API)](#7-layer-4--notion-provider-pagesdatabase-api)
8. [Layer 5 — Google Calendar Provider + OAuth Callback](#8-layer-5--google-calendar-provider--oauth-callback)
9. [Layer 6 — Calendar Sync Service (Full Implementation)](#9-layer-6--calendar-sync-service-full-implementation)
10. [Layer 7 — calendar-sync.worker.ts (Cron Wiring)](#10-layer-7--calendar-syncworkerts-cron-wiring)
11. [Layer 8 — Token Refresh Cron (Team + User Integrations)](#11-layer-8--token-refresh-cron-team--user-integrations)
12. [API Endpoints — Full Specification](#12-api-endpoints--full-specification)
13. [Security Architecture](#13-security-architecture)
14. [Performance & Scalability Architecture](#14-performance--scalability-architecture)
15. [Error Handling Strategy](#15-error-handling-strategy)
16. [Caching Strategy](#16-caching-strategy)
17. [Multi-Tenant & Multi-User Isolation Design](#17-multi-tenant--multi-user-isolation-design)
18. [Types & Interfaces](#18-types--interfaces)
19. [Testing Plan](#19-testing-plan)
20. [End-of-Day Checklist](#20-end-of-day-checklist)

---

## 1. Day Overview & Strategic Importance

### Why Today Is the "Architecture Stress Test" Day

Day 21 ne ek claim ki thi: "shared OAuth core ek baar bana lo, future providers free mein milte hain." Aaj woh claim **test** hoti hai — agar `provider.interface.ts` aur `oauth-state.service.ts` sahi se design hue the, to Slack/Linear/Notion teen alag providers honge lekin koi naya security/CSRF/encryption code nahi likhna padega. Sirf data (`oauth-config.ts` entries) aur provider-specific logic (`*.provider.ts`) add hoga.

```
WHY TODAY HAS TWO VERY DIFFERENT HALVES:
  HALF 1 (Morning) — Three NEW providers (Slack, Linear, Notion).
    Risk: code duplication, inconsistent error handling across providers.
    Mitigation: every provider obeys the EXACT same interface contract
    built Day 21 — no exceptions, no "just this once" shortcuts.

  HALF 2 (Afternoon) — Calendar Sync going from scaffold to REAL.
    Risk: THIS is the day Vocaply starts creating meetings and spending
    Recall.ai bot-minutes WITHOUT a human clicking a button. A bug here
    doesn't just break a feature — it can silently rack up infrastructure
    cost (duplicate bots) or silently miss meetings (under-sync). This
    is why dedup correctness is treated as a SECURITY/COST control today,
    not just a data-quality concern.
```

### What Gets Built Today

```
✅ Slack provider: OAuth (bot token), Block Kit summary posts, DM alerts,
   rate-limited send queue, interactive webhook (button clicks)
✅ Linear provider: GraphQL client, issue creation, priority mapping,
   email→user resolution
✅ Notion provider: page creation, property mapping, formatted body blocks
✅ Google Calendar: REAL OAuth callback (completing Day 20's scaffold),
   user-level token storage
✅ calendar-sync.service.ts: REAL implementation — incremental sync via
   syncToken, 2-layer dedup, bot scheduling
✅ calendar-sync.worker.ts: hourly cron, per-user job fan-out
✅ Token-refresh cron: proactive refresh for BOTH team_integrations and
   user_integrations, every 15 minutes
```

### Downstream Impact

```
Day 23  — Billing's webhook idempotency pattern is a direct copy of the
           multi-scheme signature verification utility hardened today.
Day 24  — notify.worker's Slack rate-limited queue (built today) becomes
           the literal delivery mechanism for ALL Slack notifications,
           not just meeting summaries.
Day 56+ — The "full Calendar Sync" build mentioned in the 100-day plan's
           Phase 5 is, in practice, ALREADY substantially done today —
           that later day becomes a hardening/scale pass, not a from-zero build.
Day 60  — Slack notification templates (Block Kit) reuse the EXACT
           builder functions written today, just with different content.
```

---

## 2. 8-Hour Time Allocation

```
9:00 AM  – 9:45 AM    → oauth-config.ts entries for SLACK/LINEAR/NOTION +
                         resolveProvider() switch updated (3 new cases)
9:45 AM  – 10:45 AM   → slack.provider.ts (OAuth exchange, Block Kit builders,
                         send functions, testConnection)
10:45 AM – 11:30 AM   → slack.webhook.ts (interactive button handler)
11:30 AM – 12:00 PM   → linear.provider.ts (GraphQL client, createIssue,
                         priority mapping, findUserByEmail)
12:00 PM – 1:00 PM    → Lunch break
1:00 PM  – 1:45 PM    → notion.provider.ts (createMeetingPage, block builder,
                         workspace user-list caching)
1:45 PM  – 2:15 PM    → google-calendar.provider.ts + REAL OAuth callback
                         (completing Day 20's scaffold)
2:15 PM  – 3:30 PM    → calendar-sync.service.ts FULL implementation
                         (incremental sync, 2-layer dedup, bot scheduling)
3:30 PM  – 4:00 PM    → calendar-sync.worker.ts (cron wiring, per-user
                         job fan-out, concurrency tuning)
4:00 PM  – 4:30 PM    → Token-refresh cron (team + user integrations, 15-min)
4:30 PM  – 5:15 PM    → Security pass: per-provider signature schemes,
                         scope minimization audit, dedup correctness review
5:15 PM  – 5:45 PM    → Performance pass: Slack rate-limiter config,
                         syncToken payload-size verification
5:45 PM  – 6:00 PM    → Postman/manual testing + End-of-Day checklist sign-off
```

---

## 3. File Structure to Create

```
services/api/src/modules/integrations/providers/
├── slack.provider.ts                   ← NEW — Web API client + Block Kit builders
├── linear.provider.ts                  ← NEW — GraphQL client
├── notion.provider.ts                  ← NEW — Pages/Database API client
├── google-calendar.provider.ts         ← NEW — Calendar events client (user-level)
└── oauth-config.ts                     ← UPDATED — 3 new provider entries added

services/api/src/services/
└── calendar-sync.service.ts            ← UPGRADED — Day 17 scaffold → fully real

services/api/src/queues/
├── queue.client.ts                     ← UPDATED — calendarSyncQueue + tokenRefreshQueue
└── workers/
    └── calendar-sync.worker.ts         ← UPGRADED — Day 18 scaffold → real cron worker

services/api/src/queues/jobs/
└── calendar-sync.job.ts                ← NEW — { userId } job payload contract

services/api/src/modules/webhooks/
└── slack.webhook.ts                    ← NEW — Interactive actions (button clicks)

services/api/src/modules/auth/
└── google-calendar.routes.ts           ← UPDATED — callback now calls real service logic

services/api/src/queues/
└── scheduler.ts                        ← UPDATED — 2 new cron registrations
                                           (hourly calendar sync, 15-min token refresh)

services/api/src/modules/webhooks/
└── webhooks.validator.ts               ← UPDATED — multi-scheme signature support
                                           (Slack's v0:{ts}:{body} scheme added
                                           alongside Day 18/21's existing schemes)
```

### Dependency Flow (No Circular Dependencies)

```
calendar-sync.worker.ts (cron-triggered)
  └── calendar-sync.service.ts
        ├── user-integrations.repository.ts   (token lookup/update)
        ├── google-calendar.provider.ts       (list events, refresh token)
        ├── platform-detect.ts                (ALREADY EXISTS — Day 17, reused)
        ├── meetings.repository.ts            (ALREADY EXISTS — Day 17, reused)
        ├── recall.service.ts                 (ALREADY EXISTS — Day 17, reused)
        └── redis (dedup keys)                (ALREADY EXISTS — Day 17 pattern)

integrate.worker.ts (Day 21, unchanged contract)
  └── resolveProvider() now also returns:
        slack.provider.ts | linear.provider.ts | notion.provider.ts

slack.webhook.ts
  ├── webhooks.validator.ts (Slack HMAC scheme)
  └── commitments.service.ts (ALREADY EXISTS — Day 19, reused — ONE business
      rule, two entry points: REST API and this webhook)

RULE CARRIED FORWARD FROM DAY 21:
  Provider files NEVER import integrations.service.ts. The service calls
  INTO providers. This rule is what makes today's three new providers
  pure ADDITIONS rather than requiring any change to integrations.service.ts
  beyond the resolveProvider() switch gaining three more cases.
```

---

## 4. Layer 1 — Slack Provider (OAuth + Block Kit + DMs)

### File: `slack.provider.ts`

**Responsibility:** Everything Slack-API-shaped. Implements the SAME `provider.interface.ts` contract from Day 21 (`exchangeCodeForTokens`, `refreshAccessToken`, `testConnection`, `revokeToken`) PLUS Slack-specific send functions that live outside the shared interface (exactly as documented in Day 21's design — generic contract vs. provider-specific actions, never mixed).

### OAuth Specifics (What Makes Slack Different From Jira)

```
- Token type: BOT token, not a per-user token. This means once ANY admin
  connects Slack, the integration works for the WHOLE team forever,
  independent of that admin's own Slack account status (if they leave
  the team or get deactivated in Slack, the bot token still works —
  this is precisely why Slack's OAuth flow issues a bot token in the
  first place, and today's implementation must request it correctly,
  not accidentally store a user token instead).
- No refresh_token concept for Slack bot tokens in the standard OAuth v2
  flow — they don't expire under normal operation. refreshAccessToken()
  for Slack is therefore a NO-OP that returns the existing token
  unchanged — implemented as a real function (never skipped) so the
  shared interface contract holds, but its body does nothing.
- workspaceMeta returned from exchangeCodeForTokens includes: team.id,
  team.name, AND botUserId — botUserId is needed later for the
  interactive webhook to distinguish "the bot posted this" from "a human
  posted this" when reading Slack event payloads.
```

### Functions to Implement

```
exchangeCodeForTokens(code)
  → POST to Slack's oauth.v2.access endpoint
  → Returns the unified shape: { accessToken: botToken, refreshToken: null,
    expiresIn: null, workspaceMeta: { id: team.id, name: team.name,
    url: null, extra: { botUserId } } }
  → The `extra` field is a deliberate small extension to the Day 21 shared
    shape — documented as the pattern any FUTURE provider with a unique
    metadata need (not just id/name/url) should follow, rather than
    forcing the shared interface itself to grow provider-specific fields.

testConnection(integration)
  → Decrypt bot token → call auth.test
  → 200 with ok:true → { healthy: true, workspaceName: integration.workspaceName }
  → ok:false (revoked/invalid) → { healthy: false }

revokeToken(integration)
  → Best-effort call to auth.revoke — same "never throws" pattern as Jira's
    revokeToken from Day 21, wrapped identically

sendMeetingSummaryToChannel(integration, meeting, counts)
  → Decrypt bot token
  → Build Block Kit payload via a dedicated PURE function
    buildMeetingSummaryBlocks(meeting, counts) — header block, divider,
    a section listing each commitment (owner + due text), a divider, an
    actions block with a "View Full Summary" button linking to
    `${FRONTEND_URL}/meetings/{meeting.id}`
  → POST chat.postMessage with channel = integration.metadata.defaultChannelId
  → IF no defaultChannelId configured → return early with a documented
    no-op result (channel not yet configured is a normal state, not an error)

sendCommitmentMissedDM(integration, ownerEmail, commitment)
  → users.lookupByEmail(email) → if not found, log + return no-op (the
    Slack workspace member list and the Vocaply team member list are NOT
    guaranteed to be in sync — this mismatch must degrade gracefully, never throw)
  → conversations.open({ users: slackUserId }) → chat.postMessage with a
    DM-specific Block Kit template (shorter, more direct than the channel one)

sendDeadlineReminderDM(integration, ownerEmail, commitment)
  → Identical lookup/open/post pattern, different block template — the
    lookup+open logic is factored into a small shared internal helper
    (openDMChannel(integration, email)) so it's written ONCE and reused
    by both DM-sending functions, not copy-pasted twice
```

### Block Kit Builder Functions (Pure, Side-Effect-Free)

```
buildMeetingSummaryBlocks(meeting, counts) → Block[]
buildCommitmentMissedBlocks(commitment) → Block[]
buildDeadlineReminderBlocks(commitment) → Block[]

DESIGN RULE: these builders take plain data in, return a plain JSON
structure out — zero network calls, zero Slack SDK objects. This makes
them independently unit-testable (assert on the exact JSON shape) without
mocking any HTTP client, and reusable later by Day 60's expanded
notification templates without re-deriving the block structure from scratch.
```

### Rate Limit Handling — The Architecture Decision That Matters Most Today

```
PROBLEM: Slack Tier 2 rate limit ≈ 1 message/second PER CHANNEL. A naive
implementation that fires sendMeetingSummaryToChannel for 50 meetings
processed back-to-back would 429 almost immediately.

REJECTED APPROACH: a setTimeout(1000) sleep inside the function itself.
  WHY REJECTED: doesn't survive a worker restart mid-batch, doesn't
  coordinate across MULTIPLE worker processes/replicas (each replica
  would independently think it's "the only sender" and still collectively
  exceed the limit), and blocks the worker's event loop pointlessly.

CHOSEN APPROACH: a dedicated Bull queue (or a rate-limited "lane" within
the existing notify queue) configured with Bull's native limiter option:
  { max: 1, duration: 1100 }  // 1 job per 1.1 seconds, system-wide,
                               // honored across ALL worker replicas because
                               // the limiter state lives in Redis, not in
                               // any single process's memory
This is the SAME principle as Day 18's "queues are the scalability unit,
not in-process throttling" — applied here to a concrete, previously-vague
"Slack rate limit" requirement.
```

---

## 5. Layer 2 — Slack Interactive Webhook

### File: `slack.webhook.ts`

**Responsibility:** Translate a Slack user clicking a button (e.g., "Mark Fulfilled" inside a posted Block Kit message) into a real Vocaply state change — reusing Day 19's commitment business logic, never re-implementing it.

### Handler Logic

```
POST /webhooks/slack

1. Verify Slack's signature scheme — DIFFERENT from every other provider's:
     base_string = `v0:${timestamp}:${rawBody}`
     expected = HMAC-SHA256(base_string, SLACK_SIGNING_SECRET)
     compare against the X-Slack-Signature header (constant-time compare)
   ALSO verify the timestamp is within 5 minutes of now (Slack's own
   documented replay-protection requirement) — rejected if too old, even
   with a valid signature.
2. Slack sends interactive payloads as `application/x-www-form-urlencoded`
   with a `payload` field containing JSON — NOT a raw JSON body like every
   other webhook built so far. This parsing difference is isolated entirely
   inside this file; no other part of the system needs to know about it.
3. Idempotency check: webhook:processed:slack:{payload.actions[0].action_id}
   keyed on Slack's own action-invocation identifier (action_ts), TTL
   matching Slack's documented retry window.
4. Respond 200 OK immediately (fast-ack, identical principle to every
   prior webhook) BEFORE the business-logic call, since Slack also
   enforces a short response-time expectation and will show the user a
   "this action timed out" UI if you're slow.
5. Extract: action_id (e.g., "mark_fulfilled"), value (the commitmentId,
   embedded in the original Block Kit button's `value` field), and
   user.id / user's resolved Vocaply identity (resolved via the SAME
   email-lookup pattern used elsewhere, since Slack's user.id is a
   Slack-specific identifier, not a Vocaply userId).
6. SWITCH on action_id:
     "mark_fulfilled" → calls commitments.service.updateCommitmentStatus(
       commitmentId, { status: 'FULFILLED' }, resolvedVocaplyUser, teamId)
       — THE EXACT SAME function the REST PATCH endpoint calls. This is
       the architectural point emphasized in the source notes: one
       business rule, two entry points, zero logic duplication.
     "defer" → opens a Slack modal for date input (documented as a
       FUTURE enhancement if not fully wired today — the action_id case
       exists in the switch so adding it later is additive, not a rewrite)
7. Optionally use Slack's `response_url` to update the original message
   in-place (e.g., strike through the button, show "✅ Marked fulfilled
   by {user}") — a UX nicety, not a correctness requirement, implemented
   only if time allows within today's box.
```

---

## 6. Layer 3 — Linear Provider (GraphQL)

### File: `linear.provider.ts`

**Responsibility:** Everything Linear-shaped, via their GraphQL API (Linear has NO REST API — this is the first provider in the system where the HTTP client is a single POST endpoint with a query/mutation body, not a typical REST resource pattern).

### Architectural Decision: Why GraphQL Needs Its Own Client Pattern

```
A REST provider (Jira) maps naturally to "one function = one endpoint."
A GraphQL provider maps differently: ONE http client function
(executeGraphQL(integration, query, variables)) is built ONCE, and every
Linear operation (createIssue, findUserByEmail, testConnection) is just a
different query/mutation string passed through that same single client.
This is the correct shape for GraphQL — building five separate Axios call
sites for Linear would be fighting the protocol's own design.
```

### Functions to Implement

```
exchangeCodeForTokens(code)
  → Linear's OAuth IS REST (token exchange isn't GraphQL) — POST to
    Linear's token endpoint, returns unified shape with workspaceMeta
    from a follow-up `viewer { organization { id name } }` GraphQL query

testConnection(integration)
  → executeGraphQL(integration, `query { viewer { id name } }`)
  → 200 with a viewer object → healthy:true

findUserByEmail(integration, email)
  → executeGraphQL with `query($email: String!) { users(filter: { email:
    { eq: $email } }) { nodes { id name } } }`
  → Returns the first match or null — called once per sync job, result
    used immediately, NOT cached in Redis (deliberately, per the source
    notes: a per-job, in-memory-scoped lookup is the right cost/complexity
    tradeoff here — caching this in Redis would add invalidation
    complexity for a value that's read exactly once per job anyway)

createIssue(integration, actionItem)
  → assigneeId = findUserByEmail(...) result, or null if unmatched
    (same "proceed without assignee rather than fail" philosophy as Jira)
  → priority mapped via an EXPLICIT lookup table, not a formula:
      LOW → 4 (Linear's "Low"), MEDIUM → 3, HIGH → 2, URGENT → 1
      (Linear's own scale is inverted — 0=No priority, 1=Urgent, 4=Low —
      this inversion is exactly the kind of subtle bug a "clever formula"
      would hide; an explicit table makes it visible and unit-testable)
  → executeGraphQL with the IssueCreate mutation, variables: title, teamId
    (from integration.metadata.linearTeamId — Linear's own internal team
    concept, NOT to be confused with Vocaply's teamId, a naming collision
    handled by always fully qualifying which "team" is meant in code
    comments and variable names: linearTeamId vs vocaplyTeamId)
  → Returns { issueId, issueUrl } (Linear has no separate "issue key"
    concept the way Jira does — its UI-facing identifier IS embedded in the URL)
```

---

## 7. Layer 4 — Notion Provider (Pages/Database API)

### File: `notion.provider.ts`

**Responsibility:** Everything Notion-shaped. Notably the ONLY provider today with an explicitly documented permanent limitation (no webhook support) — that limitation is recorded IN THE CODE, not just in a planning doc, so it survives team turnover.

### Functions to Implement

```
exchangeCodeForTokens(code)
  → POST to Notion's OAuth token endpoint
  → workspaceMeta extracted directly from the token response itself
    (Notion conveniently returns workspace_id/workspace_name/workspace_icon
    inline — no Jira-style follow-up call needed here)
  → ALSO fetches the full workspace user list ONE TIME at connect (via
    `GET /v1/users`) and stores it in integration.metadata.userDirectory —
    this single fetch is what eliminates per-sync user-lookup API calls later

testConnection(integration)
  → GET /v1/users/me — 200 → healthy:true

createMeetingPage(integration, meeting, summary)
  → Resolve assignee Notion user IDs from integration.metadata.userDirectory
    (built at connect-time, NOT re-fetched here) by matching email
  → POST /v1/pages: parent={ database_id: integration.metadata.databaseId },
    properties mapped: Title (title type), Status (select type, default
    "Not Started"), Due Date (date type, nullable), Assignee (people type,
    array of resolved Notion user IDs)
  → children blocks built via a small buildNotionBlocks(meeting, summary)
    pure helper: heading_2 ("Commitments"), bulleted_list_item per
    commitment, heading_2 ("Action Items"), bulleted_list_item per item
  → Returns { pageId, pageUrl }

NO updateMeetingPage / NO reverse sync function exists in this file.
The file's header comment explicitly states: "Notion's stable public API
does not support outbound webhooks as of this build. Do not attempt to
wire a notion.webhook.ts — there is nothing on Notion's side to trigger
it. If Notion adds webhook support in the future, re-evaluate this file
before building one."
```

### Workspace User Directory — Refresh Strategy

```
integration.metadata.userDirectory is fetched ONCE at connect-time. It
goes stale if the customer's Notion workspace adds/removes members later.
TODAY'S DECISION: accept this staleness as a documented tradeoff — a
manual "Reconnect" (re-running the OAuth flow) refreshes it. A scheduled
periodic refresh of this directory is noted as a Day 22+ enhancement
opportunity, not built today, because the cost (a new cron + edge cases
around partial user-list changes) outweighs the benefit at current scale
(most workspaces' member lists change rarely).
```

---

## 8. Layer 5 — Google Calendar Provider + OAuth Callback

### File: `google-calendar.provider.ts`

**Responsibility:** Google Calendar-specific API calls. This provider is structurally different from the other three: it does NOT implement the team-level `provider.interface.ts` contract, because `user_integrations` is a separate Prisma model from `team_integrations` — calendar connection is PER PERSON, not per team. This distinction is called out explicitly so no future engineer tries to force it through `integrations.service.ts`'s team-scoped functions.

### Functions to Implement

```
exchangeCodeForTokens(code)
  → POST to Google's token endpoint
  → CRITICAL CONFIGURATION CHECK (carried over from Day 20's initiation
    step, verified again here): the AUTHORIZE request must have included
    access_type=offline AND prompt=consent — if either was missing, this
    exchange will succeed but refresh_token will be ABSENT, and the
    integration will silently die in ~1 hour with no recovery path other
    than forcing the user through OAuth again. Today's implementation
    includes an explicit guard: IF !refresh_token → log a CRITICAL-level
    warning (this should never happen if Day 20's config was correct, but
    if it does, it must be loud, not silent).

refreshAccessToken(refreshTokenEnc)
  → Standard refresh-grant POST, returns new access_token (Google does
    NOT rotate the refresh_token itself on a normal refresh — the SAME
    refresh_token remains valid and is NOT re-encrypted/re-stored unless
    Google explicitly returns a new one)

listEvents({ calendarId, timeMin, timeMax, singleEvents, syncToken? })
  → GET /calendars/{calendarId}/events
  → IF syncToken provided: pass it instead of timeMin/timeMax (Google's
    API contract: syncToken and time-range params are mutually exclusive)
  → IF Google responds 410 Gone (syncToken expired/invalid — happens after
    long sync gaps or calendar changes) → the CALLER (calendar-sync.service)
    is responsible for catching this specific status and retrying without
    a syncToken; this provider function itself just surfaces the raw
    error, it does not silently retry internally (keeps the function's
    behavior predictable and testable)

testConnection(integration) / revokeToken(integration)
  → Same pattern as every other provider, calendar.readonly scope is
    sufficient for testConnection's purposes (a cheap calendarList.list call)
```

### `GET /auth/google-calendar/callback` — Real Implementation

```
1. Validate + consume the one-time state token built Day 20 (SAME
   oauth-state.service.ts utility from Day 21 — this confirms the shared
   core's design extends correctly even to a USER-level OAuth flow, not
   just team-level ones; the state payload simply carries { userId }
   instead of { teamId, userId })
2. exchangeCodeForTokens(code) → { accessToken, refreshToken, expiresIn }
3. encryptedAccess = cryptoService.encrypt(accessToken)
   encryptedRefresh = cryptoService.encrypt(refreshToken)
4. userIntegrationRepo.upsert(userId, 'GOOGLE_CALENDAR', {
     accessTokenEnc: encryptedAccess, refreshTokenEnc: encryptedRefresh,
     tokenExpiresAt: addSeconds(now, expiresIn), calendarId: 'primary',
     syncEnabled: true
   })
5. Redirect to `${FRONTEND_URL}/onboarding/connect-calendar?connected=true`
   (allow-listed redirect target, identical open-redirect protection
   discipline as Day 21's Jira callback)
6. This is also the FIRST TIME Day 20's onboarding step 4 ("Connect
   Calendar") becomes truthfully completable end-to-end — prior to today
   it always degraded gracefully to a disabled button per Day 20's
   documented fallback, but now the real path works.
```

---

## 9. Layer 6 — Calendar Sync Service (Full Implementation)

### File: `calendar-sync.service.ts`

**Responsibility:** The single most consequential piece of business logic built today — this is the function that creates meetings and spends real money (Recall.ai bot-minutes) with zero human in the loop.

### Function: `syncUserCalendar(userId)` — Complete Logic Walkthrough

```
STEP 1 — Load & Validate Integration:
  integration = userIntegrationRepo.findActive(userId, 'GOOGLE_CALENDAR')
  IF !integration || !integration.syncEnabled → return { synced: 0, skipped: 0 }
  (a user who never connected, or who explicitly disabled sync in
  settings, is a normal no-op case, not an error)

STEP 2 — Ensure a Fresh Token (Proactive, Never Reactive):
  accessToken = await getValidAccessToken(integration)
    internally: IF integration.tokenExpiresAt - now() < 5 minutes →
      call provider.refreshAccessToken() BEFORE proceeding, persist the
      new expiry, THEN return the fresh token
    This mirrors Day 21's "never pay a refresh round-trip on the hot
    path" principle, but as a LOCAL safety net — the dedicated 15-minute
    cron (Section 11) is the PRIMARY mechanism; this check is the
    secondary defense in case a sync job runs in the gap between cron ticks.

STEP 3 — Fetch Events (Incremental When Possible):
  TRY:
    events = provider.listEvents({ calendarId, timeMin: now,
      timeMax: now+7days, singleEvents: true, syncToken: integration.nextSyncToken })
  CATCH (status === 410):
    log info "syncToken expired, falling back to full scan"
    events = provider.listEvents({ calendarId, timeMin: now,
      timeMax: now+7days, singleEvents: true })   // no syncToken this time
    integration.nextSyncToken will be REPLACED by whatever Google returns
    from this full scan, restarting the incremental chain cleanly

STEP 4 — Per-Event Processing Loop:
  FOR EACH event IN events.items:
    a. meetingUrl = extractMeetingUrl(event)
       — checks event.conferenceData.entryPoints FIRST (most reliable,
         Google Meet native), THEN event.description (regex scan for
         Zoom/Teams/Webex URL patterns), THEN event.location
       — IF none found → skip silently (most calendar events are NOT
         video meetings; this is the expected common case, not a warning)

    b. { platform, platformMeetingId } = detectPlatform(meetingUrl)
       — reuses platform-detect.ts EXACTLY as built Day 17 — zero new
         platform-detection code written today, proving that utility's
         original design was correctly forward-compatible

    c. IF !platform → skip (webinar links, unsupported tools, etc.)

    d. ── LAYER 1 DEDUP — Redis fast path ──
       redisKey = `bot:scheduled:${platform.toLowerCase()}:${platformMeetingId}`
       IF await redis.exists(redisKey) → skipped++; continue
       (THIS is the line that, at scale, prevents the classic failure
       mode: 5 team members each running their own hourly sync, all
       seeing the SAME calendar invite, all racing to create a meeting —
       only the first one through wins the Redis key)

    e. ── LAYER 2 DEDUP — Postgres authoritative ──
       user = userRepo.findById(userId)   // to get user.teamId
       existing = meetingRepo.findByPlatformId(user.teamId, platform, platformMeetingId)
       IF existing → skipped++; continue
       (catches the race-condition gap: Redis key might have expired or
       never been set due to a prior partial failure, but the DB's own
       UNIQUE constraint — idx_meetings_platform_dedup from the schema
       doc — is the FINAL backstop, exactly as documented Day 17)

    f. ── CREATE + SCHEDULE (only reached if both dedup layers pass) ──
       meeting = meetingRepo.create({
         teamId: user.teamId, title: event.summary ?? 'Untitled Meeting',
         platform, meetingUrl, platformMeetingId,
         scheduledAt: event.start.dateTime, calendarEventId: event.id,
         calendarSourceUserId: userId, status: 'SCHEDULED'
       })
       TRY:
         bot = await recallService.scheduleBot({ meetingUrl,
           joinAt: subMinutes(meeting.scheduledAt, 2) })
         meetingRepo.update(meeting.id, { recallBotId: bot.id })
       CATCH (recallError):
         meetingRepo.update(meeting.id, { status: 'FAILED',
           processingError: recallError.message })
         (the meeting record is KEPT, marked FAILED, rather than rolled
         back — this gives the team visibility that a calendar event was
         seen but bot-scheduling failed, instead of the event silently
         vanishing with no trace, which would be far more confusing to debug)
       redis.setex(redisKey, computeTTL(meeting.scheduledAt), meeting.id)
       synced++

STEP 5 — Persist Sync Watermark:
  userIntegrationRepo.update(integration.id, {
    lastSyncedAt: now(), nextSyncToken: events.nextSyncToken ?? null
  })

STEP 6 — Return Summary:
  return { synced, skipped }
  (this return value is what the worker logs per-job — useful for a
  future "sync activity" admin view without needing a separate audit table)
```

### `computeTTL(scheduledAt)` Helper

```
Returns: max(3600, secondsUntil(scheduledAt) + 4 hours of buffer)
— identical formula to Day 17's manual-bot-add path, factored into ONE
shared utility today so both entry points (calendar sync AND manual add)
compute the dedup TTL identically, rather than two slightly-different
copies of the same formula drifting apart over time.
```

---

## 10. Layer 7 — `calendar-sync.worker.ts` (Cron Wiring)

### Why a Cron-Triggered FAN-OUT, Not a Cron-Triggered LOOP

```
THE CRITICAL DESIGN DECISION OF THIS SECTION:
  The hourly cron tick does NOT call syncUserCalendar() for every eligible
  user in a sequential loop inside the cron handler itself. Instead:

  1. Cron tick fires (registered in scheduler.ts: '0 * * * *')
  2. Query: SELECT user_integrations WHERE syncEnabled=TRUE AND
     (lastSyncedAt IS NULL OR lastSyncedAt < NOW() - INTERVAL '1 hour')
  3. FOR EACH eligible row → calendarSyncQueue.add('sync-user-calendar',
     { userId }) — just an ENQUEUE, microseconds of work per user
  4. The cron handler returns almost immediately after enqueueing,
     regardless of whether there are 10 or 100,000 eligible users

WHY THIS MATTERS AT SCALE:
  If the cron handler instead awaited syncUserCalendar() in a loop, ONE
  user with a slow/hanging Google API response would delay every
  subsequent user's sync behind it — potentially by minutes. With the
  fan-out pattern, that one slow user's job sits in the queue and times
  out/retries independently; everyone else's jobs process in parallel
  across however many worker replicas/concurrency slots exist.
```

### Worker Configuration

```
calendarSyncWorker = new Worker('calendar-sync', handler, {
  connection: redis,
  concurrency: 10   // tuned HIGH relative to transcribe/extract workers,
                     // because this work is I/O-bound (waiting on Google's
                     // API) and CHEAP per-job — many of these can run
                     // concurrently without resource contention, unlike
                     // CPU/AI-bound work which needs lower concurrency
})

Per-job handler:
  TRY:
    result = await calendarSyncService.syncUserCalendar(job.data.userId)
    logger.info({ userId: job.data.userId, ...result }, 'calendar sync complete')
  CATCH (error):
    IF error indicates a revoked/invalid Google token (401 from any
    provider call surfaced up through the service):
      userIntegrationRepo.update(integration.id, { syncEnabled: false })
      queue an alert email to the user: "Your calendar connection needs
      to be reconnected" (via the SAME notify queue infra as everything else)
    ELSE (transient network/5xx error):
      THROW — let Bull's normal retry/backoff apply; this one user's
      transient failure is retried on its own schedule, never blocking
      or crashing the batch of other users' jobs
```

---

## 11. Layer 8 — Token Refresh Cron (Team + User Integrations)

### Why This Cron Is What Makes "Proactive Refresh" Real

```
Throughout Day 21's design, "proactive refresh, never reactive" was
stated as a PRINCIPLE. Today is where that principle gets an actual
implementation — without this cron, every integration (Jira from Day 21,
PLUS today's Slack/Linear/Notion/Calendar) would eventually hit its
token's natural expiry with literally nothing watching for it, and the
NEXT sync/sync attempt would be the first thing to discover the token is
dead — by which point it's already a user-facing failure instead of a
silently-prevented one.
```

### Cron Logic — `cron.schedule('*/15 * * * *', ...)`

```
STEP 1 — Team Integrations:
  expiring = SELECT * FROM team_integrations
             WHERE is_active = TRUE AND token_expires_at IS NOT NULL
             AND token_expires_at < NOW() + INTERVAL '30 minutes'
  FOR EACH:
    providerClient = resolveProvider(integration.provider)
    TRY:
      { accessToken, refreshToken, expiresIn } =
        await providerClient.refreshAccessToken(integration.refreshTokenEnc)
      repo.updateTokens(integration.id, encrypt(accessToken),
        refreshToken ? encrypt(refreshToken) : integration.refreshTokenEnc,
        addSeconds(now, expiresIn))
      repo.resetErrorCount(integration.id)
    CATCH:
      newCount = repo.incrementErrorCount(integration.id)
      IF newCount >= 5 → repo.markDisconnected(...) + admin alert email
        (THE EXACT SAME circuit-breaker threshold and behavior as Day 21's
        sync-failure circuit breaker — ONE unified "5 consecutive failures
        of ANY kind disables the integration" rule, not two separate
        thresholds for "sync failures" vs "refresh failures" that could
        drift apart and confuse whoever's debugging an alert later)

STEP 2 — User Integrations (Calendar):
  Same pattern, same query shape, against user_integrations WHERE
  sync_enabled = TRUE AND token_expires_at < NOW() + INTERVAL '30 minutes'
  On exhausted failure: syncEnabled=false + email to the individual user
  (not a team-wide admin alert, since calendar connection is personal)

STEP 3 — Logging:
  Every refresh attempt (success or failure) logged with: provider,
  integrationId (team or user), outcome, latency — feeding the SAME
  structured-logging convention established since Day 18, so this cron's
  activity is traceable in logs without any new tooling.
```

---

## 12. API Endpoints — Full Specification

> Note: Today adds ZERO new REST endpoints to `integrations.routes.ts` itself
> — the 5 endpoints built Day 21 (`list`, `connect`, `callback`, `disconnect`,
> `test`) are PROVIDER-AGNOSTIC and already fully support SLACK/LINEAR/NOTION
> simply by being called with a different `:provider` path value. This is
> the proof that yesterday's architecture decision paid off literally as
> designed. Today's NEW endpoint surface is exactly one route:

### `GET /auth/google-calendar/callback` — Now Real (Was Scaffold Since Day 20)

| Aspect | Detail |
|---|---|
| Auth | None (state-token protected, same model as Day 21's Jira callback) |
| Success | `302` redirect to `FRONTEND_URL/onboarding/connect-calendar?connected=true` |
| Errors | `400 OAUTH_INVALID_STATE`; `502 PROVIDER_TOKEN_EXCHANGE_FAILED`; both redirect with an `?error=` flag rather than raw JSON, since a human's browser lands here directly |

### `POST /webhooks/slack` — New Today

| Aspect | Detail |
|---|---|
| Auth | Slack signing-secret HMAC (NOT JWT) |
| Body format | `application/x-www-form-urlencoded` with a `payload` JSON field — different from every other webhook so far |
| Response | `200 OK` immediately (fast-ack) |
| Side effect | Calls `commitments.service.updateCommitmentStatus()` for recognized action_ids |

### Existing Endpoints Now Functionally Complete for All 5 Providers

```
GET    /api/v1/integrations                     → now lists JIRA + SLACK +
                                                    LINEAR + NOTION rows
GET    /api/v1/integrations/:provider/connect    → :provider now accepts
                                                    SLACK, LINEAR, NOTION
GET    /api/v1/integrations/:provider/callback   → resolveProvider() switch
                                                    now has 3 more cases
DELETE /api/v1/integrations/:provider            → unchanged logic, works
                                                    identically for all 4
POST   /api/v1/integrations/:provider/test       → unchanged logic, calls
                                                    each provider's own
                                                    testConnection()
```

---

## 13. Security Architecture

### Multi-Scheme Webhook Signature Verification

```
webhooks.validator.ts is upgraded today to accept a `scheme` parameter:
  - 'hmac-sha256-hex'   → Recall.ai / Jira style (Day 18/21)
  - 'slack-v0'          → v0:{timestamp}:{body} HMAC scheme, WITH the
                           additional 5-minute timestamp-tolerance check
                           that Slack's own docs mandate
  - 'stripe-sdk'        → delegated entirely to Stripe's own SDK method
                           (Day 23, not today, but the parameter slot
                           is reserved now so Day 23 is a pure addition)
This is the architectural payoff of treating signature verification as a
SHARED, parameterized utility from Day 18 onward — today proves it scales
to a THIRD distinct scheme without forking the function.
```

### Scope Minimization — Audited Per Provider

```
SLACK:   chat:write, channels:read, users:read.email, im:write — NO
         admin scopes, NO channels:manage (Vocaply never creates/deletes
         Slack channels, only posts into ones the admin already configured)
LINEAR:  issues:create, issues:read ONLY — explicitly NOT requesting
         admin:* or organization:* scopes Linear's OAuth offers, even
         though they'd be "convenient" for future features; minimum
         viable scope for TODAY'S documented functionality, full stop
NOTION:  default integration capabilities (read content, insert content)
         — NO "update content" capability requested beyond what page
         creation itself requires, since today's scope is create-only
         (no updateMeetingPage exists, so no broader write scope is needed)
GOOGLE:  calendar.readonly ONLY — this is verified not just as a design
         note but as an ACTUAL audit step today: someone manually
         inspects the literal scope string sent in the Day 20 authorize
         URL and confirms it has never drifted to calendar.events (write)
```

### Dedup as a Security/Cost Control (Elevated From "Nice to Have" to "Required")

```
Today is explicitly called out as the day the 2-layer dedup system (Redis
fast-path + Postgres authoritative) faces its FIRST real multi-user
concurrent-write scenario, because calendar sync runs UNATTENDED, hourly,
across potentially hundreds of team members simultaneously discovering
the same shared meeting in their own calendars. The test plan (Section
19) treats "5 team members, 1 shared Zoom link, exactly 1 bot created" as
a SECURITY/COST test, not merely a functional one — an uncontrolled
duplicate-bot scenario is, at scale, a real unbounded-cost vulnerability
(an attacker who could somehow get a calendar event onto many users'
calendars simultaneously could otherwise force Vocaply to spend Recall.ai
minutes proportional to however many people they targeted).
```

### Token Storage Consistency Across the Two Integration Tables

```
Even though user_integrations (Google Calendar) is a structurally
different table from team_integrations (Jira/Slack/Linear/Notion), the
ENCRYPTION DISCIPLINE from Day 21 applies identically and without
exception: every accessTokenEnc/refreshTokenEnc write on EITHER table
goes through the same cryptoService.encrypt() call, audited the same way.
There is no "calendar tokens are less sensitive" exception anywhere in
today's design — a compromised calendar refresh token is just as
dangerous (it grants ongoing read access to someone's entire calendar) as
a compromised Jira token.
```

---

## 14. Performance & Scalability Architecture

### Incremental Sync — The Single Biggest Win of the Day

```
Google's syncToken mechanism means that after the FIRST full 7-day sync
for a user, every SUBSEQUENT hourly sync only returns events that
CHANGED since the last sync — typically a handful of events instead of
potentially dozens. At scale (thousands of users, hourly cron), this is
roughly a 95% reduction in API payload size and Google API quota
consumption, which matters because Google's Calendar API has its own
per-project rate limits that Vocaply must respect across ALL its users combined.
```

### Per-User Job Fan-Out (Detailed in Section 10)

```
Restated here as a performance point: this is what makes calendar sync
throughput a pure function of worker concurrency/replica count, with
ZERO code changes needed to scale from 100 users to 100,000 users — the
cron's only job is enqueueing, and queues are inherently horizontally
scalable by the platform's established design.
```

### Slack Rate-Limiter as a Queue-Level Config, Not Application Code

```
Restated from Section 4: by encoding the 1.1s-per-message limit as a
Bull queue limiter option (Redis-backed, shared across all worker
replicas), the system gets correct rate-limiting behavior for free under
horizontal scaling — adding a second notify-worker replica does NOT
double the effective send rate and trigger 429s, because the limiter
state is centralized in Redis, not duplicated per-process.
```

### Notion Workspace Directory Caching

```
Restated from Section 7: caching the full user directory ONCE at
connect-time means createMeetingPage's assignee-resolution step is a
zero-network-call, in-memory lookup against already-fetched data — at
scale (every meeting processed for a Notion-connected team), this avoids
N additional Notion API calls per meeting where N = number of
commitments/action items needing assignee resolution.
```

### Linear's GraphQL Single-Client Pattern

```
Restated from Section 6 as a performance/maintainability point: because
ALL Linear operations funnel through one executeGraphQL() function, any
FUTURE cross-cutting concern (e.g., adding response caching, adding
request-cost tracking against Linear's GraphQL complexity-based rate
limit) is implemented in exactly one place, not scattered across five
separate REST-style call sites the way a naive port of the Jira pattern
would have produced.
```

---

## 15. Error Handling Strategy

### New Error Codes Introduced Today

```
SLACK_CHANNEL_NOT_CONFIGURED   —  not thrown as an error; documented as
                                   a silent no-op return from
                                   sendMeetingSummaryToChannel
SLACK_USER_NOT_FOUND           —  not thrown; logged + no-op from DM-send
                                   functions (Slack workspace and Vocaply
                                   team member lists may diverge — expected)
LINEAR_USER_NOT_FOUND          —  not thrown; createIssue proceeds without
                                   an assignee (same philosophy as Jira Day 21)
CALENDAR_SYNC_TOKEN_EXPIRED    —  caught INTERNALLY by calendar-sync.service
                                   (the 410 case) — never surfaces as an
                                   error to anything outside that function;
                                   it's an expected, self-healing condition
GOOGLE_TOKEN_REVOKED           —  surfaces from calendar-sync.worker's
                                   catch block → syncEnabled=false + user
                                   email, NOT a retry — a revoked token
                                   only recovers via the user reconnecting
RECALL_SCHEDULE_FAILED_DURING_SYNC — meeting kept in DB with status=FAILED
                                   and processingError populated, rather
                                   than silently dropping the calendar
                                   event detection entirely (documented in
                                   Section 9, Step 4f)
```

### Retryable vs Non-Retryable (Calendar Sync Worker)

```
NON-RETRYABLE (mark integration inactive immediately, no backoff wasted):
  - 401/invalid_grant from Google during token refresh inside a sync job
    (only a user reconnect fixes this — retrying changes nothing)

RETRYABLE (normal Bull backoff applies):
  - Network timeout to Google's API
  - 5xx from Google
  - 429 from Google (rate limited at the Google-quota level, distinct
    from Vocaply's own Slack rate-limiter — backoff naturally helps)
```

---

## 16. Caching Strategy

```
KEY                                          TTL              PURPOSE
─────────────────────────────────────────────────────────────────────────
bot:scheduled:{platform}:{platformMeetingId} max(3600, ...)   Layer-1 dedup,
                                                                shared with
                                                                Day 17's
                                                                manual-add path
(no NEW Redis cache key namespace introduced today beyond reusing the
EXACT bot:scheduled:* convention from Day 17 — deliberately, since
introducing a parallel/different dedup key scheme for calendar-sync-
originated meetings versus manually-added ones would reopen exactly the
duplicate-bot risk the whole 2-layer design exists to close)

NOTE: integration.metadata fields (Notion's userDirectory, Jira's
workspaceId/cloudId from Day 21) function as a form of CACHING TOO —
"cached on the row itself" rather than in Redis, because this data
changes only on reconnect, not on any normal request cadence; Redis
caching would add an unneeded invalidation surface for data that's
already this stable.
```

---

## 17. Multi-Tenant & Multi-User Isolation Design

```
TEAM-LEVEL PROVIDERS (Slack, Linear, Notion — joining Jira from Day 21):
  Identical 3-layer isolation as established Day 21: application-layer
  teamId parameter, Prisma TENANT_TABLES middleware (TeamIntegration
  already added Day 21, no change needed today), PostgreSQL RLS.

USER-LEVEL PROVIDER (Google Calendar) — A DIFFERENT ISOLATION SHAPE:
  user_integrations is scoped by userId, not teamId, because calendar
  access is fundamentally personal. HOWEVER, the MEETINGS this sync
  creates ARE team-scoped (every created meeting carries the user's
  teamId) — this is the precise moment personal data (one person's
  calendar) becomes team data (a shared meeting record), and today's
  design is explicit that this transition happens at exactly ONE point
  in the code: calendar-sync.service.ts's meeting-creation step, where
  user.teamId is looked up and stamped onto the new meeting. No other
  function in today's build performs this personal→team scope transition,
  keeping it auditable to a single, well-understood location.

CROSS-USER DEDUP IS INTENTIONALLY CROSS-USER:
  The Redis/Postgres dedup keys are scoped by platform+platformMeetingId
  WITHIN A TEAM, not within a user — this is BY DESIGN, since the entire
  point of today's dedup proof is that User A's and User B's independent
  calendar syncs, both seeing the same shared meeting, must collapse into
  ONE meeting record for their shared team, not two.
```

---

## 18. Types & Interfaces

### Additions to `integrations.types.ts`

```
SlackWorkspaceMeta       — { id, name, botUserId } extending the base
                            workspaceMeta shape with Slack's extra field

LinearCreateIssueResult  — { issueId, issueUrl }  (no separate "key" field,
                            unlike Jira's IssueKey concept)

NotionCreatePageResult   — { pageId, pageUrl }

CalendarSyncResult       — { synced: number, skipped: number }  — the
                            return shape of syncUserCalendar, logged by
                            the worker and potentially surfaced later in
                            an admin "sync activity" view

ExtractedMeetingUrl      — { url: string, source: 'conferenceData' |
                            'description' | 'location' }  — the source
                            field is kept (not just the URL) specifically
                            so the test plan can assert WHICH extraction
                            path succeeded for a given fixture event,
                            rather than only that some URL was found
```

---

## 19. Testing Plan

### Slack Tests

```
Test 1 — OAuth connect (mocked Slack token endpoint) → bot token stored
  encrypted, workspaceName + botUserId present in metadata.
Test 2 — sendMeetingSummaryToChannel with no defaultChannelId configured
  → confirmed no-op, zero API call attempted (mock call-count assertion).
Test 3 — sendCommitmentMissedDM with an email not found in the Slack
  workspace → logged no-op, never throws.
Test 4 — Fire 10 simulated meeting-summary sends in immediate succession
  → confirm actual delivery is spaced ≥1.1s apart (timestamp assertions
  on the mock's call log), zero 429s simulated/encountered.
Test 5 — Interactive webhook: valid signature + "mark_fulfilled" action_id
  → commitments.service.updateCommitmentStatus confirmed called with the
  correct commitmentId extracted from the button's value field.
Test 6 — Interactive webhook: invalid/stale-timestamp signature → rejected,
  logged as a security event, commitments service NEVER called.
```

### Linear Tests

```
Test 7 — createIssue with a matched assignee email → correct Linear
  numeric priority used for all 4 input priority levels (explicit
  table-driven test, one case per level).
Test 8 — createIssue with an unmatched assignee email → issue still
  created, assigneeId omitted, confirmed via the mutation variables passed
  to the mocked GraphQL client.
```

### Notion Tests

```
Test 9 — createMeetingPage → correct property shapes for Title/Status/
  Due Date/Assignee, confirmed against Notion's documented property schema.
Test 10 — Assignee resolution uses ONLY the cached userDirectory (mock
  the Notion API such that any live user-lookup call would fail the
  test if attempted) — proves zero per-sync API calls for this purpose.
```

### Google Calendar / Sync Tests

```
Test 11 — OAuth callback (mocked token endpoint, refresh_token PRESENT)
  → user_integrations row created, refreshTokenEnc populated, redirect
  to the correct onboarding URL.
Test 12 — OAuth callback where mocked response is MISSING refresh_token
  → CRITICAL-level log line confirmed emitted (regression guard against
  the access_type/prompt misconfiguration class of bug).
Test 13 — THE decisive scale test: simulate 5 different userIds, each
  with a calendar integration, each independently syncing and each
  discovering an event with the IDENTICAL meetingUrl → run all 5
  syncUserCalendar calls (sequentially or concurrently in the test) →
  assert EXACTLY ONE meeting row and ONE recallService.scheduleBot call
  resulted, with the other 4 calls counted in `skipped`.
Test 14 — Second sync run for a user reuses nextSyncToken → mocked
  Google client confirms the syncToken parameter was passed and that
  timeMin/timeMax were NOT also passed in the same call (mutual
  exclusivity contract respected).
Test 15 — Mocked 410 response on a stale syncToken → confirms graceful
  fallback to a full time-range scan, confirms the OLD syncToken is
  discarded and replaced by whatever the fallback call's response provides.
Test 16 — Recall.ai scheduleBot call mocked to fail → meeting row exists
  with status=FAILED and a populated processingError, NOT silently absent.
```

### Token Refresh Cron Tests

```
Test 17 — Manually set a team_integration's tokenExpiresAt to 20 minutes
  from now → run the cron logic → confirm a refresh call was attempted
  and tokens updated, BEFORE the natural expiry would have hit.
Test 18 — Manually set a user_integration's tokenExpiresAt similarly →
  same confirmation for the calendar-token refresh path.
Test 19 — Mock 5 consecutive refresh failures for one integration →
  confirm isActive/syncEnabled flips false and an alert is queued,
  consistent with Day 21's circuit-breaker threshold.
```

---

## 20. End-of-Day Checklist

### Slack
```
[ ] OAuth connect → bot token encrypted, workspaceName + botUserId visible
    in the sanitized list endpoint's response shape
[ ] Meeting summary posts to the configured channel with correct Block Kit
    structure (header, divider, commitment list, action button)
[ ] DM functions degrade gracefully (no throw) when email lookup misses
[ ] 10 rapid sends respect the 1.1s spacing, zero 429s encountered
[ ] Interactive webhook: valid signature + recognized action → commitment
    status updates via the SAME service function the REST API uses
[ ] Interactive webhook: invalid signature or stale timestamp → rejected
    + logged as security-relevant, never reaches business logic
```

### Linear
```
[ ] Issue created with correct numeric priority for all 4 input levels
[ ] Unmatched assignee email → issue still created, no crash
[ ] Single executeGraphQL() function confirmed as the only HTTP call site
    for every Linear operation (no duplicated client logic found in review)
```

### Notion
```
[ ] Page created with correct property types matching Notion's schema
[ ] Assignee resolution uses cached workspace directory, zero live
    per-sync API calls confirmed
[ ] File header comment documenting "no webhook support" present and accurate
```

### Google Calendar + Sync
```
[ ] OAuth callback → refresh_token present and encrypted; missing-token
    case produces a CRITICAL log line
[ ] 5-user same-meeting scale test → exactly 1 meeting + 1 bot, 4 skips
[ ] Incremental sync (2nd run) demonstrably smaller payload via syncToken
[ ] 410-expired-token fallback → full scan triggered, new syncToken stored
[ ] Failed Recall.ai scheduling during sync → meeting kept as FAILED with
    a populated error, never silently dropped
[ ] Cron fan-out confirmed: cron tick enqueues jobs and returns quickly,
    does NOT await each user's sync inline
```

### Token Refresh Cron
```
[ ] Team integration nearing expiry → refreshed within the 15-min cron window
[ ] User (calendar) integration nearing expiry → refreshed within the
    same window
[ ] 5 consecutive refresh failures → integration disabled + correct
    audience alerted (team admins for team integrations, the individual
    user for calendar)
```

### Security & Architecture Sign-Off
```
[ ] webhooks.validator.ts confirmed supporting 3 distinct signature
    schemes without forked/duplicated verification logic
[ ] Scope audit complete for all 4 new/updated providers — zero
    over-broad scopes requested anywhere
[ ] resolveProvider() switch is the ONLY place in integrations.service.ts
    that changed today — confirmed via diff review, proving the Day 21
    architecture's reuse promise held
[ ] Dedup scale test (Section 19, Test 13) treated and signed off as a
    security/cost control verification, not merely a functional pass
```

---

## Appendix A — New Environment Variables Required Today

```
# Slack OAuth + Webhooks
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
SLACK_CALLBACK_URL=https://api.vocaply.com/api/v1/integrations/SLACK/callback

# Linear OAuth
LINEAR_CLIENT_ID=...
LINEAR_CLIENT_SECRET=...
LINEAR_CALLBACK_URL=https://api.vocaply.com/api/v1/integrations/LINEAR/callback

# Notion OAuth
NOTION_CLIENT_ID=...
NOTION_CLIENT_SECRET=...
NOTION_CALLBACK_URL=https://api.vocaply.com/api/v1/integrations/NOTION/callback

# Google Calendar (client id/secret likely ALREADY set from Day 8's
# Google OAuth login — confirm reuse vs. needing a SEPARATE OAuth client
# if Google Cloud Console project scoping requires it; callback URL is
# distinct from the login callback)
GOOGLE_CALENDAR_CALLBACK_URL=https://api.vocaply.com/auth/google-calendar/callback

# All of the above added to env.ts's Zod fail-fast schema TODAY, same
# discipline as Day 21's JIRA_* additions
```

## Appendix B — Quick Decision Reference

```
QUESTION                                          ANSWER
────────────────────────────────────────────────────────────────────────────
Does Slack's bot token expire/need refresh?        No — refreshAccessToken
                                                   is a documented no-op
Where does Linear's email→user lookup get cached?  Nowhere — in-memory,
                                                   per-job scope only
Why no Notion reverse webhook?                     Notion's stable API
                                                   doesn't support one —
                                                   documented in-file
Why does the calendar cron enqueue instead of loop? One slow user must
                                                   never delay everyone
                                                   else's sync
What happens if Recall.ai fails during a sync?      Meeting kept as FAILED
                                                   with an error, not dropped
Is the dedup key scheme different for calendar-
  sync-created meetings vs manually-added ones?     No — identical
                                                   bot:scheduled:* keys, by design
What's the unified circuit-breaker threshold?       5 consecutive failures
                                                   (sync OR refresh) across
                                                   every provider, team or user
```

---

*Document: DAY-22-PLAN-001 | Vocaply | Day 22: Integrations API — Slack, Linear, Notion, Google Calendar*
*Full Scalable Industry-Level Build Plan | Senior Engineer Edition*
*Architecture Stress Test · Multi-Scheme Webhooks · Incremental Calendar Sync · Circuit Breakers*
*Security-first · Performance-optimized · Production-grade · No Code, Pure Architecture*
