# Vocaply — Day 21: Integrations API (OAuth Core + Jira)
## Full Scalable Industry-Level Build Plan
> Senior Backend Engineer Edition | Production-Grade | Security-First | 1M+ Users
> No Code — Pure Architecture, Logic, Security & Performance Plan
> Document: DAY-21-PLAN-001 | Version 1.0 | June 2026

---

## Table of Contents

1. [Day Overview & Strategic Importance](#1-day-overview--strategic-importance)
2. [8-Hour Time Allocation](#2-8-hour-time-allocation)
3. [File Structure to Create](#3-file-structure-to-create)
4. [Layer 1 — Shared OAuth Core (Provider-Agnostic)](#4-layer-1--shared-oauth-core-provider-agnostic)
5. [Layer 2 — Data Layer (Repository)](#5-layer-2--data-layer-repository)
6. [Layer 3 — Business Logic (Service)](#6-layer-3--business-logic-service)
7. [Layer 4 — Jira Provider Implementation](#7-layer-4--jira-provider-implementation)
8. [Layer 5 — HTTP Layer (Controller + Routes)](#8-layer-5--http-layer-controller--routes)
9. [Layer 6 — Validation Layer](#9-layer-6--validation-layer)
10. [Jira Reverse Webhook](#10-jira-reverse-webhook)
11. [Worker Upgrade — integrate.worker.ts](#11-worker-upgrade--integrateworkerts)
12. [API Endpoints — Full Specification](#12-api-endpoints--full-specification)
13. [Security Architecture](#13-security-architecture)
14. [Performance & Scalability Architecture](#14-performance--scalability-architecture)
15. [Error Handling Strategy](#15-error-handling-strategy)
16. [Caching Strategy](#16-caching-strategy)
17. [Multi-Tenant Isolation Design](#17-multi-tenant-isolation-design)
18. [Types & Interfaces](#18-types--interfaces)
19. [Testing Plan](#19-testing-plan)
20. [End-of-Day Checklist](#20-end-of-day-checklist)

---

## 1. Day Overview & Strategic Importance

### Why Today Matters More Than a Normal Feature Day

Day 21 Vocaply ki pehli "outward-facing" trust boundary banata hai. Ab tak system apne andar hi data process kar raha tha (meetings → AI → commitments). Aaj se Vocaply **third-party credentials store karta hai aur unke naam pe API calls karta hai** — yeh ek qualitatively different risk surface hai.

```
WHY THIS IS THE MOST SECURITY-CRITICAL DAY SO FAR:
  1. Hum doosri company (Atlassian) ke OAuth tokens apne DB mein rakh rahe hain.
     Agar yeh leak ho gaye, attacker customer ke Jira workspace mein tickets
     bana sakta hai, data dekh sakta hai.
  2. Aaj jo "shared OAuth core" banega, woh Day 22 ke 3 aur providers
     (Slack, Linear, Notion) bina dobara likhe reuse karenge. Agar core mein
     bug hai, woh bug 4x multiply ho jayega.
  3. Webhooks ab humein outside se commands de rahe hain ("mark this done")
     — agar trust model galat hai, koi bhi fake webhook bhej ke commitments
     ko fulfilled mark karwa sakta hai.

PRINCIPLE FOR TODAY:
  "Build the core once, build it paranoid, then every future provider
   inherits that paranoia for free."
```

### What Gets Built Today

```
✅ Shared OAuth orchestration core (provider-agnostic) — reused by Day 22
✅ AES-256-GCM token encryption wired for real (not just documented)
✅ 5 REST API endpoints (list, connect, callback, disconnect, test)
✅ Jira provider: token exchange, issue create, issue status update
✅ Jira reverse webhook (Jira → Vocaply status sync)
✅ integrate.worker.ts upgraded from Day 20's acknowledge-only scaffold
   to real Jira ticket creation/update logic
✅ Provider interface contract — the abstraction every future provider obeys
✅ Auto-disable circuit breaker after 5 consecutive sync failures
```

### Downstream Impact (Why Rushing Today Is Expensive)

```
Day 22  — Slack/Linear/Notion providers literally copy oauth-state.service.ts,
           provider.interface.ts, and the controller/routes pattern verbatim.
           A bug here = a bug in 4 providers, not 1.
Day 23  — Billing reuses the exact same "encrypted credential + webhook
           idempotency + signature verification" mental model for Stripe.
Day 41  — Settings → Integrations UI calls these 5 endpoints directly;
           any inconsistency in response shape becomes a frontend bug.
Day 58+ — Jira reverse sync (already built today) is what lets a PM close
           a Jira ticket and have Vocaply mark the action item done —
           a trust-model mistake today silently mis-attributes completions.
```

---

## 2. 8-Hour Time Allocation

```
9:00 AM  – 10:00 AM   → oauth-state.service.ts + provider.interface.ts +
                         oauth-config.ts (the shared core, built first since
                         everything else depends on it)
10:00 AM – 10:45 AM   → integrations.repository.ts (all DB queries)
10:45 AM – 12:00 PM   → integrations.service.ts (connect/callback/disconnect/test)
12:00 PM – 1:00 PM    → Lunch break
1:00 PM  – 2:15 PM    → jira.provider.ts (token exchange, createIssue,
                         updateIssueStatus, accessible-resources lookup)
2:15 PM  – 3:00 PM    → integrate.worker.ts upgrade (real Jira logic,
                         idempotency, circuit breaker)
3:00 PM  – 3:45 PM    → jira.webhook.ts (reverse sync handler)
3:45 PM  – 4:30 PM    → integrations.controller.ts + integrations.routes.ts +
                         integrations.validator.ts
4:30 PM  – 5:15 PM    → Security pass: encryption verification, CSRF state
                         flow, open-redirect check, secret hygiene audit
5:15 PM  – 5:45 PM    → Performance pass: caching, query indexing review
5:45 PM  – 6:00 PM    → Postman testing + End-of-Day checklist sign-off
```

---

## 3. File Structure to Create

```
services/api/src/
│
├── modules/integrations/
│   ├── integrations.controller.ts      ← HTTP layer ONLY — no business logic
│   ├── integrations.service.ts         ← OAuth orchestration, token lifecycle
│   ├── integrations.repository.ts      ← team_integrations DB queries ONLY
│   ├── integrations.validator.ts       ← Zod schemas for all inputs
│   ├── integrations.routes.ts          ← Route definitions + middleware chain
│   ├── integrations.types.ts           ← TypeScript interfaces for this module
│   └── providers/
│       ├── provider.interface.ts       ← Shared contract ALL providers implement
│       ├── jira.provider.ts            ← Jira-specific OAuth + REST client
│       ├── oauth-config.ts             ← Per-provider client_id/secret/scopes/urls
│       └── oauth-state.service.ts      ← Shared CSRF state generate/validate
│
├── modules/webhooks/
│   └── jira.webhook.ts                 ← Jira reverse sync handler (NEW today)
│
├── queues/workers/
│   └── integrate.worker.ts             ← UPGRADED: Day 20 scaffold → real logic
│
└── services/
    └── crypto.service.ts               ← ALREADY EXISTS (Day 11) — reused, not rebuilt
```

### Dependency Flow (No Circular Dependencies)

```
integrations.routes.ts
  └── integrations.controller.ts
        └── integrations.service.ts
              ├── integrations.repository.ts   (DB access)
              ├── providers/oauth-state.service.ts  (CSRF state)
              ├── providers/jira.provider.ts        (Jira-specific calls)
              ├── crypto.service.ts                 (encrypt/decrypt — Day 11)
              └── cache.service.ts                  (Redis — Day 11)

queues/workers/integrate.worker.ts
  ├── integrations.repository.ts        (load integration + creds)
  ├── providers/jira.provider.ts        (createIssue/updateIssueStatus)
  └── action-items.repository.ts        (already exists — Day 15/20)

modules/webhooks/jira.webhook.ts
  ├── webhooks.validator.ts             (ALREADY EXISTS — Day 18, HMAC scheme reused)
  └── action-items.repository.ts        (findByJiraIssueId)

RULE: providers/* files NEVER import from integrations.service.ts directly —
      the service calls INTO providers, providers never call back UP into
      the service. This one-directional flow is what makes the provider
      abstraction swappable without circular-import bugs.
```

---

## 4. Layer 1 — Shared OAuth Core (Provider-Agnostic)

This is built **first**, before anything Jira-specific, because Day 22's three providers will literally import these same three files unchanged.

### File: `provider.interface.ts`

**Responsibility:** Define the exact shape every integration provider must implement, so `integrations.service.ts` never needs an `if (provider === 'JIRA')` branch for generic operations.

Contract every provider exposes:
```
exchangeCodeForTokens(code: string): Promise<{ accessToken, refreshToken?, expiresIn?, workspaceMeta }>
refreshAccessToken(refreshTokenEnc: string): Promise<{ accessToken, refreshToken?, expiresIn }>
testConnection(integration): Promise<{ healthy: boolean, workspaceName?: string }>
revokeToken(integration): Promise<void>   // best-effort, never throws on failure
```
Provider-specific actions (createIssue, sendMessage, etc.) live OUTSIDE this shared interface — they belong to each provider's own file and are called directly by the worker that needs them, never through a generic dispatch. This avoids forcing unrelated providers (Slack has no "createIssue") into an artificial shared shape.

### File: `oauth-config.ts`

**Responsibility:** Single source of truth for every provider's OAuth metadata. No client ever hardcodes a URL or scope string anywhere else in the codebase.

Per-provider config object holds: `clientId`, `clientSecret` (read from env, never inline), `authUrl`, `tokenUrl`, `callbackUrl`, `scopes[]`, `extraParams` (e.g., Jira needs `audience=api.atlassian.com`, `prompt=consent`).

Design rule: this file is the ONLY place a new provider's URLs/scopes are typed in. Day 22's Slack/Linear/Notion additions are pure data — zero new logic.

### File: `oauth-state.service.ts`

**Responsibility:** Generate and validate the CSRF state parameter for ALL OAuth flows, regardless of provider.

Functions:
```
generateState(provider, teamId, userId): Promise<string>
  → 32 random bytes (256-bit entropy) hex-encoded
  → Stored in Redis: oauth:state:{state} → JSON{provider,teamId,userId} | TTL 600s
  → Returns the raw state string for the redirect URL

consumeState(state): Promise<{ provider, teamId, userId } | null>
  → Redis GET, then Redis DEL (one-time use — deleted regardless of what
    happens next in the calling code, even if downstream token exchange fails)
  → Returns null if not found/expired → caller throws OAUTH_INVALID_STATE
```

Why this is its own file and not inlined in the service: Day 23's Stripe billing flow does NOT use this pattern (Stripe has its own session-based flow), but if Vocaply ever adds another CSRF-protected redirect flow (e.g., a future SAML test connection), this is the one utility it reaches for — keeping it provider-agnostic and not buried inside `integrations.service.ts` makes that reuse obvious.

---

## 5. Layer 2 — Data Layer (Repository)

### File: `integrations.repository.ts`

**Responsibility:** All Prisma queries against `team_integrations`. Zero business logic. Never returns the raw encrypted token to anything above it without an explicit, intentional function name signaling that.

### Functions to Implement

```
findByTeamAndProvider(teamId, provider): Promise<TeamIntegration | null>
  → Used by: connect flow (check existing), test endpoint, sync worker
  → Uses the UNIQUE composite index (teamId, provider)

findAllByTeam(teamId): Promise<TeamIntegrationSummary[]>
  → SELECT only sanitized columns — provider, workspaceName, isActive,
    lastSyncedAt, connectedById, createdAt — NEVER select the encrypted
    token columns in this query at all (not just "don't return them" —
    don't even fetch them from Postgres for a list call)

upsert(teamId, provider, data): Promise<TeamIntegration>
  → The Prisma upsert used by the OAuth callback — create on first connect,
    update (re-encrypt + reactivate) on reconnect

updateTokens(integrationId, encryptedAccess, encryptedRefresh, expiresAt): Promise<void>
  → Used by the token-refresh cron (Day 22) and reactive refresh-on-401 paths

markDisconnected(integrationId, disconnectedById): Promise<void>
  → Soft-disable only: isActive=false, disconnectedAt=now() — NEVER a hard
    DELETE, since historical sync references (jiraIssueId on old action
    items) must remain explainable

incrementErrorCount(integrationId): Promise<TeamIntegration>
  → Atomic increment, returns the new count so the service/worker can
    decide whether to trip the circuit breaker at >= 5

resetErrorCount(integrationId): Promise<void>
  → Called on any successful provider call

findExpiringTokens(withinMinutes): Promise<TeamIntegration[]>
  → Scaffold today, fully used by Day 22's token-refresh cron — query
    shape: WHERE isActive AND tokenExpiresAt < NOW() + interval
```

### Query Performance Notes

- Every query includes `teamId` in the WHERE clause except `findExpiringTokens` (which is an internal cron query spanning all teams, not request-scoped).
- The unique index on `(teamId, provider)` makes `findByTeamAndProvider` and the upsert both single-row, sub-5ms operations.
- List query never does `SELECT *` — explicit `select` clause matching the sanitized shape, enforced as code-review convention.

---

## 6. Layer 3 — Business Logic (Service)

### File: `integrations.service.ts`

**Responsibility:** All OAuth orchestration, encryption calls, cache invalidation, Socket.io emission. Never touches `req`/`res`. Never imports a provider's HTTP client directly except through the provider's own exported functions.

### Function: `listIntegrations(teamId)`

```
1. Try Redis: cache:team:integrations:{teamId}
2. On miss: repo.findAllByTeam(teamId) → already sanitized at the query level
3. Cache result (TTL 300s)
4. Return array — empty array if none connected, never null/undefined
```

### Function: `initiateOAuth(provider, teamId, userId)`

```
1. Validate provider against a hardcoded allow-list array
   ['JIRA','LINEAR','SLACK','NOTION'] — reject anything else with 422
   BEFORE touching Redis or building any URL (fail fast, cheapest check first)
2. state = await oauthStateService.generateState(provider, teamId, userId)
3. config = OAUTH_CONFIGS[provider]
4. authUrl = buildAuthUrl(config, state)
5. Return { authUrl }
```

### Function: `handleOAuthCallback(provider, code, state)`

```
1. consumed = await oauthStateService.consumeState(state)
   IF !consumed → throw AppError('OAUTH_INVALID_STATE', 400)
   IF consumed.provider !== provider → throw AppError('OAUTH_PROVIDER_MISMATCH', 400)
     (defends against a state generated for Provider A being replayed
      against Provider B's callback URL)
2. providerClient = resolveProvider(provider)   // simple switch, returns the
   correct *.provider.ts module — the ONLY place a provider switch exists
3. tokenResponse = await providerClient.exchangeCodeForTokens(code)
4. encryptedAccess  = cryptoService.encrypt(tokenResponse.accessToken)
   encryptedRefresh = tokenResponse.refreshToken
     ? cryptoService.encrypt(tokenResponse.refreshToken) : null
5. integration = await repo.upsert(consumed.teamId, provider, {
     accessTokenEnc: encryptedAccess,
     refreshTokenEnc: encryptedRefresh,
     tokenExpiresAt: tokenResponse.expiresIn ? addSeconds(now, tokenResponse.expiresIn) : null,
     workspaceId: tokenResponse.workspaceMeta.id,
     workspaceName: tokenResponse.workspaceMeta.name,
     workspaceUrl: tokenResponse.workspaceMeta.url,
     isActive: true,
     consecutiveErrors: 0,
     connectedById: consumed.userId,
   })
6. await redis.del(`cache:team:integrations:${consumed.teamId}`)
7. io.to(`team:${consumed.teamId}`).emit('integration:connected', { provider, workspaceName })
8. Return a redirect target built from FRONTEND_URL constant + fixed path +
   provider query param — NEVER from any value inside the request itself
```

### Function: `disconnectIntegration(teamId, provider, requesterId)`

```
1. integration = repo.findByTeamAndProvider(teamId, provider)
   IF !integration → throw NotFoundError('Integration')
2. providerClient = resolveProvider(provider)
3. TRY: await providerClient.revokeToken(integration)   // best-effort
   CATCH: log warning, NEVER throw — revocation failure must not block
          the local disconnect, the user's intent ("disconnect this") must
          always succeed locally even if the remote revoke call fails
4. await repo.markDisconnected(integration.id, requesterId)
5. await redis.del(`cache:team:integrations:${teamId}`)
6. io.to(`team:${teamId}`).emit('integration:disconnected', { provider })
7. Return { message: 'Disconnected', provider }
```

### Function: `testConnection(teamId, provider)`

```
1. integration = repo.findByTeamAndProvider(teamId, provider)
   IF !integration || !integration.isActive → throw AppError('INTEGRATION_NOT_CONNECTED', 422)
2. providerClient = resolveProvider(provider)
3. result = await providerClient.testConnection(integration)
4. IF result.healthy → repo.resetErrorCount(integration.id)
   ELSE → repo.incrementErrorCount(integration.id)
5. Return { healthy, workspaceName, lastChecked: now() }
```

### Internal Helper: `resolveProvider(provider)`

```
The single switch statement in the entire module:
  JIRA   → jira.provider.ts exports
  LINEAR → linear.provider.ts exports (Day 22)
  SLACK  → slack.provider.ts exports (Day 22)
  NOTION → notion.provider.ts exports (Day 22)
Every other function in the service calls THROUGH this resolver — meaning
when Day 22 adds three providers, this is the ONLY line of integrations.service.ts
that changes (three more cases added to the switch).
```

---

## 7. Layer 4 — Jira Provider Implementation

### File: `jira.provider.ts`

**Responsibility:** Everything Jira-API-shaped lives here and nowhere else. If Atlassian changes their API tomorrow, this is the only file touched.

### Architectural Decisions

- Dedicated Axios instance with Jira's base URL pattern (`api.atlassian.com/ex/jira/{cloudId}`), 15-second timeout, exponential-backoff retry (3 attempts) on 429/5xx only.
- Jira's OAuth quirk: the token exchange does NOT directly tell you the site URL — a mandatory follow-up call to `accessible-resources` is required to obtain the `cloudId`. This is handled inside `exchangeCodeForTokens` itself so the rest of the system never needs to know this two-step dance exists.
- Every outbound call logged with correlation context (teamId, integrationId, endpoint, status, latency) — never the token itself.

### Functions to Implement

```
exchangeCodeForTokens(code)
  → POST to Atlassian's token endpoint with code + client credentials
  → Immediately follow with GET /oauth/token/accessible-resources using the
    fresh access token → extract cloudId + site name/url from the first
    accessible resource (multi-site accounts: today's scope picks the
    first one; multi-site selection is a documented future enhancement,
    not built today — explicitly noted in the file's header comment)
  → Returns the unified shape the service layer expects: { accessToken,
    refreshToken, expiresIn, workspaceMeta: { id: cloudId, name, url } }

refreshAccessToken(refreshTokenEnc)
  → Decrypt → POST refresh grant → re-encrypt new tokens
  → Returns same shape minus workspaceMeta (unchanged on refresh)

testConnection(integration)
  → Decrypt access token → GET /rest/api/3/myself
  → 200 → { healthy: true, workspaceName: integration.workspaceName }
  → 401 → { healthy: false } (token likely expired/revoked — does NOT
    auto-attempt a refresh here; that's the cron's job, this function
    reports ground truth only)

revokeToken(integration)
  → Best-effort call to Atlassian's token revocation endpoint
  → Wrapped so ANY failure (network, 4xx, 5xx) is swallowed after logging

createIssue(integration, actionItem)
  → Decrypt access token
  → Resolve assignee: GET /rest/api/3/user/search?query={email}
    IF no match → proceed WITHOUT an assignee rather than failing the
    whole sync (a ticket with no assignee is still useful; a failed sync
    is not)
  → POST /rest/api/3/issue with fields: project (from integration.metadata),
    summary, description (ADF document built from a small formatting
    helper — NOT raw string concatenation into Jira's rich-text format),
    assignee, duedate, priority (mapped via an explicit lookup table:
    LOW→Low, MEDIUM→Medium, HIGH→High, URGENT→Highest), labels
  → Returns { issueId, issueKey, issueUrl }

updateIssueStatus(integration, issueKey, completed)
  → Only acts when completed=true (no "reopen" flow built today —
    one-directional sync, documented limitation)
  → GET /rest/api/3/issue/{issueKey}/transitions → fuzzy-match a transition
    whose name contains "done" (case-insensitive) — workspaces customize
    workflow step names, so an exact-match assumption would silently fail
    for half of real customers
  → IF match found → POST the transition
  → IF no match → log warning and return { statusUpdated: false } — the
    caller (worker) treats this as a PARTIAL success, not a hard failure
```

---

## 8. Layer 5 — HTTP Layer (Controller + Routes)

### File: `integrations.controller.ts`

Every function follows the identical thin-translation pattern already established across every prior module (Auth, Meetings, Commitments, Action Items):

```
listIntegrationsController     → calls service.listIntegrations(teamId) → 200
connectController              → calls service.initiateOAuth(provider, teamId, userId) → 200 { authUrl }
callbackController             → calls service.handleOAuthCallback(...) → 302 redirect
disconnectController           → calls service.disconnectIntegration(...) → 200
testConnectionController       → calls service.testConnection(...) → 200
```

Zero conditional business logic in any of these five functions — if a function needs an `if`, that `if` belongs in the service, not here.

### File: `integrations.routes.ts`

```
GET    /integrations
  chain: requireAuth → injectTenant → controller

GET    /integrations/:provider/connect
  chain: requireAuth → injectTenant → requireRole('ADMIN') →
         validate(providerParamSchema) → controller

GET    /integrations/:provider/callback
  chain: validate(callbackQuerySchema) → controller
  (NO requireAuth, NO injectTenant — this route is reached by the browser
   redirecting back from Jira, there is no Vocaply session cookie/JWT
   guaranteed present on this exact request; trust comes ENTIRELY from
   the state-token validation inside the service, not from middleware)

DELETE /integrations/:provider
  chain: requireAuth → injectTenant → requireRole('ADMIN') →
         validate(providerParamSchema) → controller

POST   /integrations/:provider/test
  chain: requireAuth → injectTenant → requireRole('ADMIN') →
         validate(providerParamSchema) → controller

IMPORTANT ROUTE ORDERING NOTE:
  :provider is a path param, not a fixed segment — Express resolves these
  in registration order, so no fixed-segment route ("bot/add" style
  conflict from Day 17) risk exists here. Still, the provider value itself
  is validated against the allow-list inside validate(), never trusted
  as free text even though it's "just a route param."
```

---

## 9. Layer 6 — Validation Layer

### File: `integrations.validator.ts`

```
providerParamSchema
  provider: enum ['JIRA','LINEAR','SLACK','NOTION'] — applied to req.params.provider
  Rejects anything not in this exact list with 422 INVALID_PROVIDER,
  BEFORE the controller or service ever sees the value.

callbackQuerySchema
  code: string, required, min 1 (Jira's actual code format isn't validated
        beyond "non-empty" — its real validation IS the token exchange call)
  state: string, required, exactly 64 hex characters (matches the
        crypto.randomBytes(32).toString('hex') format generated upstream —
        malformed state is rejected before even attempting a Redis lookup)
  error: string, optional — IF present (user denied consent on Jira's
        screen), short-circuit straight to a friendly redirect WITHOUT
        attempting any token exchange
```

---

## 10. Jira Reverse Webhook

### File: `jira.webhook.ts`

**Responsibility:** Translate Jira's outbound webhook events into Vocaply state changes. This is a NEW webhook route group, following the exact raw-body-preservation and signature-verification pattern established on Day 18 for Recall.ai/Stripe — reused, not reinvented.

### Handler Logic

```
POST /webhooks/jira

1. Verify signature using the SHARED webhooks.validator.ts utility, but
   with Jira's OWN secret (JIRA_WEBHOOK_SECRET) and Jira's OWN HMAC scheme
   parameter — the shared utility supports a `scheme` argument specifically
   so each provider's signature format quirk doesn't require duplicating
   the verification function.
2. Idempotency check BEFORE any business logic:
   key = webhook:processed:jira:{issueKey}:{webhookEvent.timestamp}
   IF redis.exists(key) → log + 200 OK immediately (duplicate delivery,
   Jira retries on anything non-2xx, so this must be a true no-op, not
   a re-derived "same result" — literally skip all logic)
3. Respond 200 OK FIRST (fast-ack principle from Day 18) — actual
   processing happens before the response only if it's fast (a single
   indexed lookup + single update), which it is here; if this ever grows
   heavier, it gets pushed to a queue exactly like Recall.ai's handler.
4. Extract issueKey from payload.issue.key — this is a LOOKUP KEY ONLY,
   never a trust anchor for authorization.
5. actionItem = actionItemsRepo.findByJiraIssueId(issueKey)
   IF not found → log info-level "webhook for unknown/unlinked ticket",
   return (already responded 200) — NEVER treat this as an error, since
   it's a normal occurrence (ticket created manually in Jira, not by Vocaply)
6. teamId is read from actionItem.teamId — THIS, not anything in the
   webhook payload, is what scopes every subsequent operation.
7. IF the new Jira status fuzzy-matches "done":
     actionItemsRepo.update(actionItem.id, { completed: true, completedAt: now() })
     IF actionItem has an associated commitment via the same meeting →
       evaluate whether this also resolves that commitment (reuses the
       service-layer function already used by the REST PATCH endpoint —
       one source of truth for "what does completing this item mean,"
       two entry points: the API and this webhook)
8. io.to(`team:${teamId}`).emit('action_item:synced', { actionItemId, completed: true })
9. redis.setex(idempotencyKey, 86400, '1')   ← set AFTER successful processing,
   mirroring the Day 24 notify.worker dedup-set-after-acquire-but-before-send
   pattern adapted for webhooks: here it's set after the state change commits,
   so a crash mid-processing allows a safe retry rather than masking a failure
```

---

## 11. Worker Upgrade — `integrate.worker.ts`

### Upgrading From Day 20's Acknowledge-Only Scaffold

Day 20 ka scaffold sirf job accept karta tha aur log likhta tha. Aaj woh scaffold replaced hota hai real logic se — lekin job CONTRACT (payload shape) wahi rehta hai, isliye Day 20 mein jo bhi code is worker ko queue kar raha tha, uske andar koi change nahi karna padta.

### Full Worker Logic

```
Job payload (unchanged from Day 20's contract):
  { jobId, teamId, actionItemId, provider, idempotencyKey, attempt }

1. Idempotency re-check (defense in depth):
   acquired = redis.set(`integrate:lock:${idempotencyKey}`, '1', { NX: true, EX: 3600 })
   IF !acquired → log "already processed/in-flight", return successfully
   (a SECOND check beyond whatever the API layer already did at request
   time — protects against Bull's own at-least-once delivery semantics
   re-delivering the same job)

2. integration = integrationsRepo.findByTeamAndProvider(teamId, provider)
   IF !integration || !integration.isActive:
     THROW a NON-RETRYABLE error (INTEGRATION_NOT_CONNECTED) — Bull is
     configured so this specific error code skips remaining retry attempts
     entirely (no point retrying a connection that doesn't exist; only a
     reconnect action by the user changes this outcome)

3. actionItem = actionItemsRepo.findById(actionItemId, teamId)
   IF !actionItem → THROW non-retryable (ACTION_ITEM_NOT_FOUND — was deleted
   between enqueue and processing, a legitimate race, not a bug)

4. providerClient = resolveProvider(provider)   // same resolver pattern as
   the service layer — duplicated here intentionally rather than imported
   from integrations.service.ts, since the WORKER must never depend on
   anything that imports Express-layer concerns; this resolver is a tiny,
   pure function safely duplicated in both places without real cost

5. IF actionItem.jiraIssueId already set:
     result = await providerClient.updateIssueStatus(integration, actionItem.jiraIssueId, actionItem.completed)
   ELSE:
     result = await providerClient.createIssue(integration, actionItem)
     actionItemsRepo.update(actionItem.id, {
       jiraIssueId: result.issueKey, jiraIssueUrl: result.issueUrl,
       jiraIssueSyncedAt: now()
     })
   (This branch is WHAT MAKES RE-RUNNING SYNC SAFE — re-triggering sync on
   an item that already has a Jira ticket NEVER creates a second ticket,
   it always routes to the update path instead.)

6. ON SUCCESS:
   integrationsRepo.resetErrorCount(integration.id)
   io.to(`team:${teamId}`).emit('action_item:sync_complete', { actionItemId, provider, success: true })

7. ON FAILURE (any provider API error):
   newCount = integrationsRepo.incrementErrorCount(integration.id)
   IF newCount >= 5:
     integrationsRepo.markDisconnected(integration.id, null)  // system-initiated,
       connectedById stays as the original connector, disconnectedById is
       null to distinguish "system auto-disabled" from "admin manually disconnected"
       in any future audit view
     queue an email notification to all team ADMIN+ members (reuses the
     SAME notify queue / delivery infra as every other notification —
     never a bespoke email-sending path bolted onto this worker)
   io.to(`team:${teamId}`).emit('action_item:sync_complete', { actionItemId, provider, success: false })
   RE-THROW so Bull's retry/backoff policy for the integrate queue applies
   normally UNLESS the error was explicitly marked non-retryable in step 2/3

8. Release the idempotency lock's "in-flight" marker only on terminal
   failure (after retries exhausted) — on success, the lock is left in
   place for its full TTL specifically to prevent any late-arriving
   duplicate job for the same idempotencyKey from re-running the work.
```

---

## 12. API Endpoints — Full Specification

### `GET /api/v1/integrations` — List Connected Integrations

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | Any (MEMBER+) |
| Cache | 300s, key `cache:team:integrations:{teamId}` |
| Response | Array of `{ provider, workspaceName, isActive, lastSyncedAt, connectedBy: {id,name}, consecutiveErrors }` |

### `GET /api/v1/integrations/:provider/connect` — Initiate OAuth

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | ADMIN+ |
| Response | `200 { authUrl: string }` — frontend performs the actual browser redirect |
| Errors | `422 INVALID_PROVIDER` if not in allow-list |

### `GET /api/v1/integrations/:provider/callback` — OAuth Callback

| Aspect | Detail |
|---|---|
| Auth | None (state-token protected) |
| Success | `302` redirect to `FRONTEND_URL/settings/integrations?connected={provider}` |
| Errors | `400 OAUTH_INVALID_STATE`, `400 OAUTH_PROVIDER_MISMATCH`, `502 PROVIDER_TOKEN_EXCHANGE_FAILED` — all redirect to `FRONTEND_URL/settings/integrations?error={code}` rather than rendering a raw JSON error, since a human's browser lands here directly |

### `DELETE /api/v1/integrations/:provider` — Disconnect

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | ADMIN+ |
| Response | `200 { message, provider }` |
| Errors | `404 NOT_FOUND` if never connected |

### `POST /api/v1/integrations/:provider/test` — Test Connection

| Aspect | Detail |
|---|---|
| Auth | Required + injectTenant |
| Role | ADMIN+ |
| Rate limit | Standard user tier — this is a read-only remote call, not abuse-sensitive enough for a tighter limit |
| Response | `200 { healthy: boolean, workspaceName?, lastChecked }` |
| Errors | `422 INTEGRATION_NOT_CONNECTED` |

### HTTP Status Code Reference (Today's Module)

```
200  OK                → list, disconnect, test-connection success
302  Found             → OAuth callback (always redirects, success or error)
400  Bad Request       → invalid/expired/replayed OAuth state
402  Payment Required  → (not used today — reserved, no plan-gating on
                          integrations yet; documented as a Day 23+ decision
                          point if integrations become a paid-tier feature)
403  Forbidden         → non-ADMIN attempting connect/disconnect/test
404  Not Found         → disconnect on a never-connected provider
422  Unprocessable     → invalid provider value, integration not connected
502  Bad Gateway       → provider's OAuth/API endpoint unreachable or erroring
```

---

## 13. Security Architecture

### Token Encryption — Zero-Exception Policy

```
Every write to access_token_enc / refresh_token_enc passes through
cryptoService.encrypt() (AES-256-GCM, fresh IV per encryption, GCM auth
tag for tamper detection) — this is enforced as a CODE REVIEW GATE today:
any PR touching integrations.repository.ts's upsert/updateTokens functions
must show the encryption call inline, not several functions removed from it.

Decryption happens ONLY inside provider.ts files, at the exact moment a
token is needed for an outbound HTTP call — never decrypted "ahead of
time" and passed around in plaintext through multiple function calls.
```

### OAuth CSRF Protection

```
- 256-bit random state (crypto.randomBytes(32)) — not a sequential ID,
  not a predictable hash of teamId/timestamp.
- Redis-backed, 10-minute TTL — long enough for a slow human to complete
  Jira's consent screen, short enough that a leaked/logged state value
  has a tight exploitation window.
- ONE-TIME USE: deleted from Redis on first read, success or failure —
  a replayed state (e.g., user hits browser "back" and resubmits) always
  fails on the second attempt, by design.
- Provider-match check: the state's stored provider must equal the
  callback route's provider param — closes a cross-provider state-replay
  edge case.
```

### Open Redirect Prevention

```
The post-callback redirect is built from:
  `${FRONTEND_URL}/settings/integrations?connected=${provider}`
FRONTEND_URL is an environment constant, never request-influenced. The
`provider` value appended is itself already validated against the
allow-list earlier in the same request. No query parameter, header, or
referrer value from the incoming request EVER contributes to the redirect
target — this fully closes the open-redirect class of vulnerability for
this endpoint.
```

### Least Privilege

```
ADMIN+ required for connect/disconnect/test — a MEMBER calling any of
these three gets 403 FORBIDDEN before the service layer is even reached
(requireRole middleware runs before the controller). Listing integrations
remains MEMBER-readable since knowing "is Jira connected" is not sensitive,
but no MEMBER action can mutate the connection.
```

### Webhook Trust Model (Jira Reverse Sync)

```
The webhook payload's issue.key is used EXCLUSIVELY as a lookup key against
Vocaply's own action_items table. The team_id used for every subsequent
operation (the Socket.io room, the update's implicit tenant scope) comes
from THAT DATABASE RECORD, never from anything in the webhook body. This
means even if an attacker could forge a webhook with a valid signature
(they can't, without the shared secret) but tried to reference a real
issueKey belonging to a different team, the only thing they could do is
flip a status on data that record's OWN team owns — there is no path to
cross-tenant write through this surface.
```

### Secret Hygiene

```
JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, JIRA_WEBHOOK_SECRET:
  - Read from env only, never hardcoded, never logged
  - Added to env.ts's Zod schema TODAY so the server fails to start if
    any is missing — discovered at deploy time, never at first-real-webhook time
  - Scrubbed in Sentry's beforeSend hook alongside the existing
    Authorization/Cookie/X-Recall-Signature scrub list (one more line
    added to an already-existing list, not a new mechanism)
  - Never appear in any error message returned to a client, even in
    non-production environments (consistent behavior across envs prevents
    a "works differently in staging" security gap)
```

### Circuit Breaker as a Security Control, Not Just Reliability

```
Auto-disabling an integration after 5 consecutive failures isn't only
about not wasting retries — it also means a token that's started silently
failing (possibly because it was revoked by an attacker who compromised
the Jira side, or because Atlassian flagged it) stops being repeatedly
presented to Jira's API, reducing the blast radius of a credential that
may already be compromised on the OTHER side of the integration.
```

---

## 14. Performance & Scalability Architecture

### Caching Strategy

```
KEY                                   TTL    INVALIDATED ON
cache:team:integrations:{teamId}      300s   connect, disconnect, any
                                              consecutiveErrors update that
                                              crosses the auto-disable threshold
```

### Why the Jira "accessible-resources" CloudId Is Stored, Not Re-Fetched

```
Jira's API requires a cloudId in every single REST call's URL path. Without
caching it on the integration row at connect-time, every createIssue/
updateIssueStatus/testConnection call would need an EXTRA round-trip to
re-discover it. Storing it once in workspaceId means every subsequent
provider call is exactly one HTTP request instead of two — at scale (every
action item sync, potentially thousands per day across all teams) this
halves Jira-related outbound latency and API quota consumption.
```

### Proactive vs Reactive Token Refresh

```
Today's testConnection function deliberately does NOT attempt an automatic
refresh on a 401 — it reports ground truth. The ACTUAL refresh mechanism
is the Day 22 cron job that proactively refreshes any token expiring within
30 minutes, BEFORE any sync attempt needs it. This means the hot path
(POST /action-items/:id/sync → integrate.worker) NEVER pays a token-refresh
round-trip latency tax — by the time a sync job runs, the token is already
fresh, because the cron kept it that way ahead of time.
```

### Never-Block-The-Request-Thread Principle

```
createIssue and updateIssueStatus — both genuinely slow, genuinely
network-dependent operations — are called EXCLUSIVELY from inside
integrate.worker.ts, never from any HTTP controller. The POST /sync
endpoint (built Day 20, consumed today) only ever enqueues a job and
returns 202-style immediately. This is the same fast-ack principle from
Day 18's webhook design, applied here to a different trigger (a user
click instead of an external webhook).
```

### Horizontal Scalability of the Worker

```
integrate.worker.ts is fully stateless — the idempotency lock lives in
Redis, the integration/action-item state lives in Postgres, nothing is
held in worker process memory between jobs. This means scaling Jira sync
throughput is purely a matter of increasing the worker's concurrency
setting or running more worker replicas — zero code changes required,
consistent with the horizontal-scaling principle established across every
queue built since Day 18.
```

### Database Index Reuse (No New Indexes Needed Today)

```
findByJiraIssueId (used by both the worker's update-path check and the
reverse webhook) relies entirely on idx_ai_jira_issue, the unique partial
index already created in the Day 15/20 schema work — today's build
VERIFIES this index is being hit (via EXPLAIN ANALYZE during testing),
it does not need to create anything new, which is itself a sign the
earlier schema design anticipated this day's access pattern correctly.
```

---

## 15. Error Handling Strategy

### Integration-Specific Error Codes

```
INVALID_PROVIDER              422  → provider not in JIRA/LINEAR/SLACK/NOTION
OAUTH_INVALID_STATE           400  → state missing/expired/already consumed
OAUTH_PROVIDER_MISMATCH       400  → state's provider ≠ callback route's provider
PROVIDER_TOKEN_EXCHANGE_FAILED 502 → Jira's token endpoint rejected the code
                                      or was unreachable
INTEGRATION_NOT_CONNECTED     422  → test/sync attempted with no active
                                      integration row for that provider+team
INTEGRATION_AUTO_DISABLED     —    → not a thrown error code per se; it's a
                                      STATE the integration enters, surfaced
                                      via the list endpoint's isActive=false
                                      and a proactive email, not via a request
                                      failure (there's no request to fail —
                                      this happens inside a background worker)
JIRA_ISSUE_NOT_FOUND          —    → never surfaced to the user as an error;
                                      the webhook handler logs and 200s,
                                      since it's an expected non-error case
```

### Non-Retryable vs Retryable Failures (Worker-Specific Design)

```
NON-RETRYABLE (Bull configured to abandon immediately, no backoff wasted):
  - INTEGRATION_NOT_CONNECTED (only a human reconnecting changes this)
  - ACTION_ITEM_NOT_FOUND (deleted — retrying changes nothing)

RETRYABLE (normal exponential backoff applies):
  - Network timeout to Jira
  - 5xx from Jira
  - 429 from Jira (rate limited — backoff naturally helps here)

This distinction prevents the integrate queue from burning through retry
budget on failures that retrying can never fix, while still being resilient
to the transient failures retrying CAN fix.
```

---

## 16. Caching Strategy

```
Summarized from Section 14 for quick reference during implementation:

cache:team:integrations:{teamId}   TTL 300s   List endpoint only
(no caching of individual integration detail — every connect/disconnect/
test call reads fresh from Postgres, since these are low-frequency,
ADMIN-only actions where staleness risk outweighs the marginal latency
saving; caching the LIST is the right tradeoff because that's the
higher-frequency, lower-stakes read called by the Settings page on every
visit)
```

---

## 17. Multi-Tenant Isolation Design

```
LAYER 1 — Application:
  integrations.repository.findByTeamAndProvider ALWAYS takes teamId as an
  explicit parameter; the service NEVER calls a provider-only lookup.

LAYER 2 — Repository / Prisma Middleware:
  TeamIntegration is added to the existing TENANT_TABLES list (from the
  Day 11 Prisma middleware) TODAY — this is a one-line addition that
  retroactively protects every query against this model, including ones
  written carelessly in the future.

LAYER 3 — Database RLS:
  team_integrations already has its RLS policy defined in the DB schema
  doc (team_integrations_isolation) — today's work CONFIRMS it's enabled
  in the actual running database, not just present in a migration file.

WEBHOOK SPECIAL CASE:
  The Jira reverse webhook has NO authenticated request context (no JWT,
  no req.teamId) — its "tenant scoping" comes entirely from the looked-up
  action_item record's own teamId, as detailed in Section 13. This is the
  one place in today's build where tenant isolation is enforced through
  data lookup rather than middleware, and it's called out explicitly here
  so no future engineer assumes the standard 3-layer pattern auto-applies
  to webhook routes the same way it does to authenticated REST routes.
```

---

## 18. Types & Interfaces

### File: `integrations.types.ts`

```
ProviderType                 — 'JIRA' | 'LINEAR' | 'SLACK' | 'NOTION' union,
                                re-exported from @vocaply/types if already
                                defined there, otherwise defined here and
                                promoted to the shared package once Day 22
                                proves it's genuinely shared

TeamIntegrationSummary        — the SANITIZED shape returned by list:
                                { provider, workspaceName, isActive,
                                  lastSyncedAt, connectedBy, consecutiveErrors }

OAuthCallbackResult           — { redirectUrl: string } internal shape
                                returned by the service to the controller

ProviderTokenResponse         — the UNIFIED shape every provider.exchangeCodeForTokens
                                must return: { accessToken, refreshToken?,
                                expiresIn?, workspaceMeta: { id, name, url? } }

JiraCreateIssueResult         — { issueId, issueKey, issueUrl }

IntegrationErrorContext       — shape passed into the admin-alert email
                                template when auto-disable triggers:
                                { provider, teamId, consecutiveErrors,
                                  lastError, disconnectUrl }
```

---

## 19. Testing Plan

### OAuth Flow Tests

```
Test 1 — Happy path: GET /integrations/JIRA/connect → valid authUrl returned,
  state present in Redis with correct TTL.

Test 2 — Full round trip (mocked Jira token endpoint): hit the connect URL's
  state through the callback → 302 redirect, team_integrations row exists,
  tokens verified encrypted (not plaintext) via direct DB inspection.

Test 3 — Replayed state: consume the same state twice → second attempt
  → 400 OAUTH_INVALID_STATE.

Test 4 — Expired state (manually expire in Redis or wait out TTL in a
  fast-forwarded test clock) → 400 OAUTH_INVALID_STATE.

Test 5 — Provider mismatch: generate state for JIRA, hit /LINEAR/callback
  with it → 400 OAUTH_PROVIDER_MISMATCH.

Test 6 — User denies consent (Jira redirects with ?error=access_denied) →
  graceful redirect to settings page with an error flag, no token exchange attempted.
```

### Disconnect / Test Connection Tests

```
Test 7 — ADMIN disconnects → isActive=false, MEMBER attempting same → 403.
Test 8 — Disconnect on never-connected provider → 404 NOT_FOUND.
Test 9 — Test connection with valid token (mocked Jira /myself 200) → healthy:true.
Test 10 — Test connection with expired token (mocked 401) → healthy:false,
  consecutiveErrors incremented.
```

### Sync / Worker Tests

```
Test 11 — POST /action-items/:id/sync → job appears in integrate queue
  (verify via BullBoard or direct Redis inspection) → Jira issue created
  (mocked) → jiraIssueId persisted.

Test 12 — Re-run sync on the same action item → updateIssueStatus called
  instead of createIssue → NO second issueKey created, confirmed via mock
  call-count assertions.

Test 13 — Simulate 5 consecutive provider failures (mocked 500s) →
  integration.isActive flips to false after the 5th → admin email queued
  (verify via notify queue inspection, not a real email send).

Test 14 — INTEGRATION_NOT_CONNECTED case → job fails immediately, ZERO
  retry attempts observed (confirms the non-retryable classification works).
```

### Webhook Tests

```
Test 15 — Valid Jira webhook signature + known issueKey + status "Done"
  → action_item.completed flips to true, Socket.io event observed.

Test 16 — Invalid signature → 401/400 rejected, logged as a security event
  (not a normal error log line).

Test 17 — Duplicate webhook delivery (same issueKey + same timestamp) →
  second delivery is a confirmed no-op (mock call-count stays at 1, not 2).

Test 18 — Webhook references an issueKey with no matching action_item →
  200 OK returned (never a 404), confirmed via response status assertion.
```

### Security-Specific Tests

```
Test 19 — Attempt to pass a non-allow-listed provider string (e.g., "EVIL")
  to /connect → 422 INVALID_PROVIDER, confirmed BEFORE any Redis/DB call
  is made (verified via mock call-count of zero on downstream functions).

Test 20 — grep test fixture logs/responses for the literal encrypted token
  string or the raw access token — confirms zero leakage across the entire
  request/response cycle for every endpoint built today.
```

---

## 20. End-of-Day Checklist

### Shared OAuth Core
```
[ ] oauth-state.service.ts: generateState produces 64-char hex, stored in
    Redis with correct TTL
[ ] consumeState deletes the key on read regardless of subsequent outcome
[ ] provider.interface.ts: shape matches what jira.provider.ts actually
    implements (no drift between contract and implementation)
[ ] oauth-config.ts: zero hardcoded secrets, all pulled from env.ts validated vars
```

### Integrations API
```
[ ] GET /integrations → sanitized list, zero token data in response body
    (verified by inspecting raw JSON, not just trusting the type)
[ ] GET /integrations/JIRA/connect → 422 for MEMBER role, 200 for ADMIN
[ ] OAuth callback happy path → encrypted tokens confirmed via psql
    (raw column value is NOT human-readable plaintext)
[ ] Replayed/expired state → 400 OAUTH_INVALID_STATE
[ ] DELETE /integrations/JIRA → isActive=false in DB, row NOT deleted
[ ] POST /integrations/JIRA/test → correct healthy:true/false based on
    mocked Jira response
```

### Jira Provider + Worker
```
[ ] createIssue maps priority correctly for all 4 levels (LOW/MEDIUM/HIGH/URGENT)
[ ] Assignee resolution failure does NOT block issue creation
[ ] updateIssueStatus fuzzy-matches a "Done"-like transition name
[ ] No matching transition → logged warning, NOT a thrown error
[ ] Re-running sync on an item with an existing jiraIssueId → update path,
    confirmed no duplicate ticket
[ ] 5 consecutive failures → integration auto-disabled + admin email queued
[ ] Non-retryable errors (INTEGRATION_NOT_CONNECTED) skip Bull's retry policy entirely
```

### Jira Reverse Webhook
```
[ ] Valid signature + known issueKey + "Done"-mapped status → action_item
    flips to completed, Socket.io fires to the correct team room only
[ ] Invalid signature → rejected, logged as a security-relevant event
    distinct from a normal application error
[ ] Duplicate delivery (same idempotency key) → single side-effect confirmed
[ ] Unknown issueKey → 200 OK, no error thrown, no retry triggered by Jira
```

### Security & Performance Sign-Off
```
[ ] Every new env var (JIRA_CLIENT_ID/SECRET, JIRA_WEBHOOK_SECRET) added
    to env.ts fail-fast validation
[ ] Sentry beforeSend scrub list includes Jira-related headers
[ ] cache:team:integrations:{teamId} hit confirmed on second list call
    (< 10ms response time)
[ ] EXPLAIN ANALYZE on findByJiraIssueId confirms idx_ai_jira_issue is used,
    not a sequential scan
[ ] TeamIntegration confirmed present in Prisma's TENANT_TABLES middleware list
[ ] RLS policy `team_integrations_isolation` confirmed ACTIVE on the live database
```

---

## Appendix A — Environment Variables Required Today

```
# Jira / Atlassian OAuth (required — server fails to start without these)
JIRA_CLIENT_ID=...
JIRA_CLIENT_SECRET=...
JIRA_CALLBACK_URL=https://api.vocaply.com/api/v1/integrations/JIRA/callback
JIRA_WEBHOOK_SECRET=...

# Already set from previous days — reused, not re-declared
ENCRYPTION_KEY=...        (Day 11 crypto.service.ts)
REDIS_URL=...
DATABASE_URL=...
FRONTEND_URL=https://app.vocaply.com
```

## Appendix B — Quick Decision Reference

```
QUESTION                                          ANSWER
────────────────────────────────────────────────────────────────────────────
Where does token decryption happen?               ONLY inside provider files,
                                                   at the moment of the API call
Who can connect/disconnect an integration?        ADMIN+ only, never MEMBER
Is the OAuth callback route authenticated?         No — state token IS the auth
What's the trust anchor for the Jira webhook?      The looked-up action_item's
                                                   own teamId, never the payload
Does re-running sync ever double-create a ticket?  No — branches to update path
                                                   if jiraIssueId already exists
What happens after 5 consecutive sync failures?    Integration auto-disabled +
                                                   admin email, no more retries
Is the cloudId re-fetched on every Jira call?      No — cached on the integration
                                                   row at connect-time (workspaceId)
Does a failed token revocation block disconnect?   No — disconnect always
                                                   succeeds locally regardless
What changes when Day 22 adds 3 more providers?    Only oauth-config.ts data +
                                                   one switch-case per resolver +
                                                   each provider's own file
```

---

*Document: DAY-21-PLAN-001 | Vocaply | Day 21: Integrations API — OAuth Core + Jira*
*Full Scalable Industry-Level Build Plan | Senior Engineer Edition*
*Shared OAuth Core · Jira Provider · Reverse Webhook · Real Worker Logic · Circuit Breaker*
*Security-first · Performance-optimized · Production-grade · No Code, Pure Architecture*
