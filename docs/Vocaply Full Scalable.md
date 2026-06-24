# Vocaply — Full Scalable Enterprise API Design
> AI Meeting Intelligence SaaS | Production-Grade API | Version-Controlled | 1M+ Users
> Document: API-DESIGN-001 | Version: 1.0 | May 2026

---

## Table of Contents

1. [API Design Philosophy & Core Principles](#1-api-design-philosophy--core-principles)
2. [URL Structure & Versioning Strategy](#2-url-structure--versioning-strategy)
3. [Request & Response Envelope Standards](#3-request--response-envelope-standards)
4. [Advanced Enterprise API Patterns](#4-advanced-enterprise-api-patterns)
   - 4.1 Bulk Operations
   - 4.2 Batch APIs
   - 4.3 Idempotency
   - 4.4 Retry Design
   - 4.5 Async APIs & Long-Running Jobs
   - 4.6 Webhook Endpoints
   - 4.7 Real-Time Updates
   - 4.8 Polling vs WebSockets Decision Framework
5. [API Security Design](#5-api-security-design)
   - 5.1 JWT Authentication
   - 5.2 RBAC & Role Permissions
   - 5.3 Scopes Model
   - 5.4 API Keys (Machine-to-Machine)
   - 5.5 Rate Limiting & Throttling
   - 5.6 Signed Requests
   - 5.7 Security Matrix Per Endpoint Category
6. [Scalable Filtering & Query Standards](#6-scalable-filtering--query-standards)
   - 6.1 Filtering Operators
   - 6.2 Search Strategy
   - 6.3 Cursor Pagination
   - 6.4 Offset Pagination
   - 6.5 Sorting Standards
7. [API Lifecycle & Deprecation](#7-api-lifecycle--deprecation)
   - 7.1 Versioning & Sunset Flow
   - 7.2 Deprecation Headers
   - 7.3 Migration Guides
   - 7.4 Compatibility Strategy
   - 7.5 Feature Flags for APIs
8. [Complete Versioned Endpoint Catalog](#8-complete-versioned-endpoint-catalog)
9. [OpenAPI Contract & Schema Standards](#9-openapi-contract--schema-standards)
10. [Performance, Caching & Observability Standards](#10-performance-caching--observability-standards)

---

## 1. API Design Philosophy & Core Principles

### Design Tenets

Every API decision at Vocaply is evaluated against these seven tenets, in priority order:

```
TENET 1 — Predictability
  Every endpoint behaves identically regardless of caller context.
  Same input always produces the same output shape.
  No "magic" behavior based on hidden server state.

TENET 2 — Safety at Scale
  APIs must be safe to call under partial failure, network retry,
  and duplicate delivery. No mutation is applied twice for the same
  logical operation.

TENET 3 — Tenant Isolation by Default
  Every resource is scoped to a team. No API call can cross
  team boundaries unless it is explicitly the Team Transfer API.
  Security is structural, not just policy.

TENET 4 — Evolvability Without Breaking
  New fields may be added to any response at any time.
  Existing fields are never removed within a major version.
  Clients must ignore unknown fields (Postel's Law).

TENET 5 — Explicit Over Implicit
  Status codes are meaningful. Error codes are machine-readable.
  Pagination is always explicit. Defaults are always documented.

TENET 6 — Performance is a Feature
  No unbounded queries. All list endpoints are paginated.
  All heavy operations are asynchronous. No synchronous
  blocking on third-party services.

TENET 7 — Observability Built-In
  Every request receives a correlation ID.
  Every response carries timing and version metadata.
  Every error is classified and actionable.
```

### REST Conventions

```
RESOURCE NAMING:
  Plural nouns only:    /meetings   /commitments   /action-items
  Kebab-case for paths: /action-items   /team-members   /oauth-url
  camelCase for bodies: { "meetingUrl": "..." }
  No verbs in paths:    ❌ /getMeetings   ✅ GET /meetings

HTTP METHOD SEMANTICS:
  GET    → Read. Always idempotent. Never modifies state.
  POST   → Create a resource OR trigger a command.
  PUT    → Full replacement of a resource (rarely used — use PATCH).
  PATCH  → Partial update. Only provided fields are modified.
  DELETE → Remove resource. Returns 200 with deleted resource ID.

NESTING DEPTH:
  Maximum 2 levels deep:   /meetings/{id}/transcript    ✅
  Never 3+ levels deep:    /teams/{id}/meetings/{id}/commitments/{id}  ❌
  Use flat resources with filters instead:
    GET /commitments?meetingId=mtg_abc   ✅

RESOURCE IDs:
  Format: {resourcePrefix}_{cuid}   Example: mtg_clx05pqr
  Prefix table:
    usr_   Users
    team_  Teams
    mtg_   Meetings
    com_   Commitments
    ai_    Action Items
    dec_   Decisions
    blk_   Blockers
    int_   Integrations
    sub_   Subscriptions
    inv_   Invoices
    key_   API Keys
    job_   Async Jobs
```

---

## 2. URL Structure & Versioning Strategy

### URL Anatomy

```
https://api.vocaply.com / api / v1 / meetings / mtg_clx05pqr / transcript
│─────────────────────────│──────│────│──────────│─────────────│───────────│
       Base domain           Prefix  Ver  Resource    Resource ID   Sub-resource
```

### Version Namespaces

```
BASE URL:             https://api.vocaply.com
CURRENT STABLE:       https://api.vocaply.com/api/v1
NEXT (PREVIEW):       https://api.vocaply.com/api/v2   (header-gated, not default)
LEGACY (SUNSET):      https://api.vocaply.com/api/v0   (sunset: 2026-12-01)
PUBLIC SDK ALIAS:     https://api.vocaply.com/api/latest  → always points to v1 (stable)
```

### Versioning Strategy — URI Path Versioning

Vocaply uses **URI path versioning** (`/api/v1/`) as the primary strategy. This is the most visible, cache-friendly, and proxy-friendly approach.

```
DECISION: URI Path Versioning (over header versioning)

WHY NOT HEADER VERSIONING (Accept: application/vnd.vocaply.v2+json):
  ✗ Invisible in browser address bar and curl commands
  ✗ Cannot be bookmarked or tested without custom headers
  ✗ CDN/proxy caches typically ignore custom headers
  ✗ Harder to document and discover

WHY NOT QUERY PARAM (?version=2):
  ✗ Pollutes query string with non-resource concerns
  ✗ Easy to accidentally omit, creating ambiguous requests
  ✗ Harder to route at the load balancer/gateway level

WHY URI PATH VERSIONING:
  ✓ Immediately visible — /api/v1/ vs /api/v2/
  ✓ Perfectly cacheable at CDN level
  ✓ Routes cleanly at nginx/API gateway level
  ✓ Easy to test with curl, Postman, browser
  ✓ Standard across Stripe, Twilio, GitHub, Shopify
```

### Version Lifecycle

```
STAGE           LABEL       ACCESS              SLA      DEPRECATION NOTICE
──────────────────────────────────────────────────────────────────────────────
Development     v2-dev      Internal only       None     N/A
Preview         v2          Header flag only    None     N/A
                            X-Vocaply-Preview: v2
Current Stable  v1          All clients         Full     Minimum 12 months notice
Legacy          v0          Existing keys only  Best     6 months to migrate
Sunset          —           Returns 410 Gone    None     N/A

VERSION SELECTION ORDER (for a given client request):
  1. If URL path has /api/v2/  → use v2 (preview, must have preview flag)
  2. If URL path has /api/v1/  → use v1 (stable)
  3. If URL has /api/latest/   → resolve to current stable (v1)
  4. If URL has /api/v0/       → use v0 (legacy, check sunset date)
```

### Non-Breaking vs Breaking Changes

```
NON-BREAKING (safe to deploy to v1 without version bump):
  ✓ Adding new optional request fields
  ✓ Adding new response fields
  ✓ Adding new enum values to existing fields
  ✓ Adding new endpoints entirely
  ✓ Making previously required fields optional
  ✓ Adding new HTTP methods to existing resources
  ✓ Expanding rate limits (less restrictive)
  ✓ Adding new error codes

BREAKING (requires new major version — v2):
  ✗ Removing any existing field from request or response
  ✗ Renaming any field
  ✗ Changing a field's data type
  ✗ Changing HTTP status codes for existing scenarios
  ✗ Removing existing enum values
  ✗ Changing authentication method
  ✗ Changing resource ID format
  ✗ Removing endpoints
  ✗ Making optional fields required
  ✗ Changing pagination defaults that could break existing consumers

REVIEW PROCESS:
  Before any API change, an API Design Review is required:
  1. Open a GitHub PR with updated OpenAPI spec
  2. Tag @api-design-review team
  3. Automated breaking-change detector runs (openapi-diff)
  4. If breaking → proposal must describe v2 migration path
  5. Approved → merge → deploy
```

---

## 3. Request & Response Envelope Standards

### Standard Request Headers

```http
Authorization: Bearer eyJhbGci...         Required on protected routes
Content-Type: application/json             Always
Accept: application/json                   Always
X-Request-ID: req_a1b2c3d4e5f6            Optional — client-generated correlation ID
X-API-Key: vply_live_abc123...             Alternative auth for M2M (API keys)
X-Idempotency-Key: idem_uuid_v4           Required on POST mutations (see §4.3)
X-Vocaply-Preview: v2                      Required to access preview API version
Idempotency-Key: <uuid>                    Alias — accepted from Stripe-style clients
```

### Standard Response Headers

```http
Content-Type: application/json; charset=utf-8
X-Request-ID: req_a1b2c3d4e5f6           Echo of client's request ID (or server-generated)
X-Response-Time: 47ms                      Total server processing time
X-API-Version: 1.0.3                       Exact build version of the API
X-RateLimit-Limit: 200                     Requests allowed in window
X-RateLimit-Remaining: 156                 Remaining requests in window
X-RateLimit-Reset: 1716900000             Unix timestamp when window resets
X-RateLimit-Policy: 200;w=60             Policy: 200 requests per 60-second window
Deprecation: true                          Present when endpoint is deprecated
Sunset: Sat, 01 Jan 2027 00:00:00 GMT    Date endpoint will be removed
Link: <https://docs.vocaply.com/migration/v2>; rel="successor-version"
Cache-Control: private, no-cache          Default — auth data never cached by CDN
ETag: "a1b2c3d4"                          For conditional GET support
```

### Success Response Envelope

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page":       1,
    "limit":      20,
    "total":      150,
    "hasMore":    true,
    "nextCursor": "cursor_abc123",
    "prevCursor": null
  },
  "_links": {
    "self":  "https://api.vocaply.com/api/v1/meetings?page=1&limit=20",
    "next":  "https://api.vocaply.com/api/v1/meetings?cursor=cursor_abc123",
    "prev":  null
  }
}
```

### Error Response Envelope

```json
{
  "success":   false,
  "requestId": "req_a1b2c3d4e5f6",
  "timestamp": "2026-05-29T12:34:56.789Z",
  "error": {
    "code":    "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "fields": {
        "email":    "Invalid email format",
        "password": "Must contain at least one uppercase letter"
      }
    },
    "docsUrl": "https://docs.vocaply.com/errors/VALIDATION_ERROR"
  }
}
```

### Complete HTTP Status Code Registry

```
2xx — Success
  200 OK              Successful GET, PATCH, DELETE
  201 Created         Resource successfully created (POST)
  202 Accepted        Async job accepted, processing started
  204 No Content      Successful DELETE with no body
  207 Multi-Status    Partial success in batch operations

3xx — Redirection
  301 Moved Permanently  Resource permanently relocated
  304 Not Modified       ETag/conditional GET — cached response still valid
  308 Permanent Redirect API version redirect (v0 → v1)

4xx — Client Errors
  400 Bad Request        Malformed JSON or missing required fields
  401 Unauthorized       Missing, invalid, or expired authentication
  402 Payment Required   Plan limit exceeded — upgrade required
  403 Forbidden          Authenticated but insufficient permissions
  404 Not Found          Resource does not exist
  405 Method Not Allowed HTTP verb not supported on this endpoint
  408 Request Timeout    Client too slow to send request body
  409 Conflict           Duplicate resource or state conflict
  410 Gone               Endpoint permanently removed (sunset)
  412 Precondition Failed Optimistic locking failed (If-Match header)
  413 Payload Too Large  Request body exceeds size limit
  415 Unsupported Media  Content-Type not application/json
  422 Unprocessable      Syntactically valid but semantically invalid
  429 Too Many Requests  Rate limit or throttle exceeded
  451 Unavailable Legal  Data cannot be returned for legal reasons (GDPR)

5xx — Server Errors
  500 Internal Server Error Unexpected server error
  502 Bad Gateway           Upstream service (Recall.ai, Claude) returned error
  503 Service Unavailable   Planned maintenance or overload
  504 Gateway Timeout       Upstream service took too long
```

---

## 4. Advanced Enterprise API Patterns

### 4.1 Bulk Operations

Bulk operations allow clients to modify many resources in one HTTP round-trip. They are used when the client knows all the target IDs and wants a single atomic or partial-success response.

**Pattern: `POST /resource/bulk`**

```
DESIGN RULES:
  - Maximum 100 items per bulk request (enforced by validation)
  - Bulk requests use 207 Multi-Status for partial success
  - Each item response includes its own status code
  - Failed items do NOT roll back successful items (partial success by default)
  - To require all-or-nothing: pass "atomic": true in request body

ENDPOINTS:
  POST   /api/v1/commitments/bulk           — Bulk update commitment statuses
  POST   /api/v1/action-items/bulk          — Bulk complete/assign action items
  DELETE /api/v1/meetings/bulk              — Bulk delete meetings
  POST   /api/v1/team/members/bulk-invite   — Bulk invite team members
```

**Bulk Update Commitments — Request:**

```http
POST /api/v1/commitments/bulk
Authorization: Bearer {token}
Content-Type: application/json
X-Idempotency-Key: idem_bulk_abc123

{
  "atomic": false,
  "operations": [
    {
      "id":     "com_01",
      "op":     "update",
      "status": "FULFILLED",
      "note":   "Completed ahead of schedule"
    },
    {
      "id":     "com_02",
      "op":     "update",
      "status": "DEFERRED",
      "newDueDate": "2026-06-01T23:59:59Z"
    },
    {
      "id":     "com_INVALID",
      "op":     "update",
      "status": "FULFILLED"
    }
  ]
}
```

**Bulk Update Commitments — Response (207 Multi-Status):**

```http
HTTP/1.1 207 Multi-Status
Content-Type: application/json

{
  "success": true,
  "data": {
    "results": [
      {
        "id":         "com_01",
        "index":      0,
        "status":     200,
        "success":    true,
        "data":       { "id": "com_01", "status": "FULFILLED", "resolvedAt": "2026-05-29T12:00:00Z" }
      },
      {
        "id":         "com_02",
        "index":      1,
        "status":     200,
        "success":    true,
        "data":       { "id": "com_02", "status": "DEFERRED", "dueDate": "2026-06-01T23:59:59Z" }
      },
      {
        "id":         "com_INVALID",
        "index":      2,
        "status":     404,
        "success":    false,
        "error":      { "code": "NOT_FOUND", "message": "Commitment not found" }
      }
    ],
    "summary": {
      "total":     3,
      "succeeded": 2,
      "failed":    1
    }
  }
}
```

**Atomic Bulk — All-or-Nothing:**

```json
{
  "atomic": true,
  "operations": [ ... ]
}
```

When `atomic: true`:
- All operations run inside a single database transaction
- If ANY operation fails → all are rolled back → 422 returned
- All-or-nothing semantics — no 207 in atomic mode, only 200 or 4xx

---

### 4.2 Batch APIs

Batch APIs differ from bulk operations — they allow **multiple different API calls** to be made in a single HTTP request. This is useful for reducing round-trips on app startup or mobile clients on slow networks.

**Pattern: `POST /api/v1/batch`**

```http
POST /api/v1/batch
Authorization: Bearer {token}
Content-Type: application/json
X-Idempotency-Key: idem_batch_xyz789

{
  "requests": [
    {
      "id":     "req_1",
      "method": "GET",
      "path":   "/api/v1/teams/me",
      "query":  {}
    },
    {
      "id":     "req_2",
      "method": "GET",
      "path":   "/api/v1/commitments",
      "query":  { "status": "PENDING", "limit": "10" }
    },
    {
      "id":     "req_3",
      "method": "GET",
      "path":   "/api/v1/meetings",
      "query":  { "status": "DONE", "limit": "5" }
    }
  ]
}
```

**Batch Response:**

```http
HTTP/1.1 207 Multi-Status

{
  "success": true,
  "data": {
    "responses": [
      {
        "id":      "req_1",
        "status":  200,
        "headers": { "X-Response-Time": "12ms" },
        "body":    { "success": true, "data": { "id": "team_01", "name": "TechFlow" } }
      },
      {
        "id":      "req_2",
        "status":  200,
        "headers": {},
        "body":    { "success": true, "data": [...], "meta": { "total": 7 } }
      },
      {
        "id":      "req_3",
        "status":  200,
        "headers": {},
        "body":    { "success": true, "data": [...] }
      }
    ]
  }
}
```

**Batch API Constraints:**

```
MAX REQUESTS PER BATCH:     20 requests
MAX BATCH BODY SIZE:        5MB total
SUPPORTED METHODS:          GET only (mutations require individual idempotency keys)
PARALLEL EXECUTION:         All sub-requests run concurrently (no ordering guarantee)
SEQUENTIAL EXECUTION:       Pass "sequential": true to run in order (for dependency chains)
TIMEOUT:                    10 seconds total for all sub-requests in batch
AUTHENTICATION:             Single token covers all sub-requests in batch
RATE LIMIT COUNTING:        Each sub-request counts toward rate limit independently
FORBIDDEN IN BATCH:         POST /auth/*, DELETE /teams/*, POST /billing/*
```

---

### 4.3 Idempotency

Idempotency ensures that submitting the same request multiple times produces the same result as submitting it once. This is critical for any POST/PATCH mutation, especially over unreliable networks.

**How It Works:**

```
CLIENT                                   SERVER
  │                                        │
  │── POST /meetings                       │
  │   X-Idempotency-Key: idem_uuid_abc ──► │
  │                                        │── Process request
  │                                        │── Store (key → response) in Redis TTL: 24h
  │◄── 201 Created ─────────────────────── │
  │
  │  [Network failure — client unsure if request succeeded]
  │
  │── POST /meetings (RETRY)               │
  │   X-Idempotency-Key: idem_uuid_abc ──► │
  │                                        │── Key found in Redis
  │                                        │── Return CACHED response (no re-processing)
  │◄── 201 Created (cached) ─────────────── │
  │   X-Idempotency-Replayed: true         │
```

**Idempotency Key Rules:**

```
FORMAT:       Any string up to 255 characters
              Recommended: UUID v4 (idem_550e8400-e29b-41d4-a716-446655440000)
GENERATION:   Client is responsible for generating unique keys
              Keys should be unique per logical operation, not per retry
TTL:          24 hours — same key within 24h returns cached response
              After 24h — key expired, same key creates a NEW resource

WHEN REQUIRED:   All POST endpoints that create resources
                 All PATCH endpoints that trigger side effects (billing, notifications)
WHEN OPTIONAL:   GET, DELETE (naturally idempotent)
                 Read-only operations

CONFLICT DETECTION:
  Same key + SAME payload:  Return cached response (idempotent replay)
  Same key + DIFFERENT payload:  Return 422 IDEMPOTENCY_CONFLICT
    {
      "error": {
        "code":    "IDEMPOTENCY_CONFLICT",
        "message": "Idempotency key already used with a different request body",
        "details": {
          "key":          "idem_uuid_abc",
          "originalHash": "sha256_of_original_body",
          "receivedHash": "sha256_of_new_body"
        }
      }
    }
```

**Server Implementation:**

```typescript
// middleware/idempotency.middleware.ts

const IDEMPOTENCY_TTL_SECONDS = 86400  // 24 hours

export async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['x-idempotency-key'] || req.headers['idempotency-key']

  if (!key) {
    // POST mutations without idempotency key are allowed but not safe
    // Log warning for monitoring
    logger.warn({ path: req.path }, 'POST request missing idempotency key')
    return next()
  }

  if (key.length > 255) {
    return res.status(400).json(error('INVALID_IDEMPOTENCY_KEY',
      'Idempotency key must be 255 characters or less'))
  }

  const redisKey = `idempotency:${req.user?.teamId}:${key}`

  // Check for existing response
  const cached = await redis.get(redisKey)
  if (cached) {
    const { bodyHash, response, statusCode } = JSON.parse(cached)
    const currentHash = sha256(JSON.stringify(req.body))

    // Same key + different payload = conflict
    if (bodyHash !== currentHash) {
      return res.status(422).json(error('IDEMPOTENCY_CONFLICT',
        'This idempotency key was already used with a different request body',
        { key }
      ))
    }

    // Return cached response
    res.set('X-Idempotency-Replayed', 'true')
    return res.status(statusCode).json(response)
  }

  // Intercept response to cache it
  const originalJson = res.json.bind(res)
  res.json = (body) => {
    // Only cache successful responses (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      redis.setex(redisKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify({
        bodyHash:   sha256(JSON.stringify(req.body)),
        response:   body,
        statusCode: res.statusCode,
      }))
    }
    return originalJson(body)
  }

  next()
}
```

---

### 4.4 Retry Design

Vocaply's API is designed to be safely retried. This section defines what is safe to retry and how.

**Retry-Safe Endpoint Classification:**

```
SAFE TO RETRY WITHOUT IDEMPOTENCY KEY:
  GET    (all)     — Always safe, no state change
  DELETE (all)     — Returns 200 or 404; both are acceptable outcomes

SAFE TO RETRY WITH IDEMPOTENCY KEY:
  POST   /meetings                    — Creates one meeting per key
  POST   /teams/me/invite             — Sends one invite per email per key
  POST   /commitments/bulk            — Processes once per key
  POST   /billing/checkout            — Creates one session per key

NOT SAFE TO RETRY (do not retry these):
  POST   /auth/login                  — Each attempt counts toward brute-force lockout
  POST   /billing/portal              — Creates a new portal session (expensive)
  DELETE /teams/me                    — Irreversible team deletion
  POST   /auth/logout                 — Idempotent by nature but not retry-worthy
```

**Client Retry Strategy (Recommended):**

```
ALGORITHM: Exponential backoff with jitter

RETRY CONDITIONS:
  Retry:   5xx errors (server errors — may be transient)
  Retry:   408 Request Timeout
  Retry:   429 Too Many Requests (after Retry-After header delay)
  Retry:   Network errors (DNS failure, TCP reset, no response)
  NO retry: 4xx errors (client errors — fix the request)
  NO retry: 401, 403 (auth issues — re-authenticate first)

BACKOFF FORMULA:
  delay = min(base_delay × 2^attempt + jitter, max_delay)
  jitter = random(0, 0.1 × delay)  // ±10% to prevent thundering herd

DEFAULTS:
  base_delay:  1000ms (1 second)
  max_delay:   60000ms (60 seconds)
  max_retries: 5 attempts
  
TIMING:
  Attempt 1:  Immediate
  Attempt 2:  ~1s
  Attempt 3:  ~2s
  Attempt 4:  ~4s
  Attempt 5:  ~8s + jitter
  Give up after attempt 5

RETRY-AFTER HEADER (for 429):
  Server sends: Retry-After: 15   (seconds until rate limit resets)
  Client MUST wait exactly this long before retrying
```

**Server-Side Retry-After Header:**

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 15
X-RateLimit-Reset: 1716900015
Content-Type: application/json

{
  "success": false,
  "error": {
    "code":    "RATE_LIMITED",
    "message": "Rate limit exceeded. Retry after 15 seconds.",
    "details": { "retryAfterSeconds": 15 }
  }
}
```

---

### 4.5 Async APIs & Long-Running Jobs

Operations that take more than ~2 seconds are handled asynchronously. The API returns immediately with a job reference; the client polls or receives a webhook when the job completes.

**Async Job Pattern:**

```
1. Client submits request
2. Server creates job record → returns 202 Accepted + job ID
3. Server processes job asynchronously (Bull queue)
4. Client polls GET /api/v1/jobs/{jobId} OR receives webhook
5. Job completes → status: "completed" + result data
```

**Triggering an Async Operation:**

```http
POST /api/v1/meetings/mtg_01/reprocess
Authorization: Bearer {token}
X-Idempotency-Key: idem_reprocess_abc

{
  "reason": "transcript_updated"
}
```

**202 Accepted Response:**

```json
{
  "success": true,
  "data": {
    "jobId":      "job_clx09xyz",
    "type":       "MEETING_REPROCESS",
    "status":     "QUEUED",
    "resourceId": "mtg_01",
    "estimatedCompletionMs": 30000,
    "statusUrl":  "https://api.vocaply.com/api/v1/jobs/job_clx09xyz",
    "webhookUrl": null
  }
}
```

**Job Status Endpoint:**

```
GET /api/v1/jobs/{jobId}

STATES:
  QUEUED      → Job created, waiting in queue
  PROCESSING  → Worker picked up job, running
  COMPLETED   → Job finished successfully
  FAILED      → Job failed (may be retried)
  CANCELLED   → Cancelled by user

RESPONSE (in progress):
{
  "success": true,
  "data": {
    "jobId":      "job_clx09xyz",
    "type":       "MEETING_REPROCESS",
    "status":     "PROCESSING",
    "progress":   65,
    "message":    "Running AI extraction...",
    "createdAt":  "2026-05-29T12:00:00Z",
    "startedAt":  "2026-05-29T12:00:05Z",
    "completedAt": null,
    "result":     null,
    "error":      null
  }
}

RESPONSE (completed):
{
  "success": true,
  "data": {
    "jobId":       "job_clx09xyz",
    "status":      "COMPLETED",
    "progress":    100,
    "completedAt": "2026-05-29T12:00:42Z",
    "result": {
      "meetingId":       "mtg_01",
      "commitmentCount": 4,
      "actionItemCount": 6,
      "summary":         "Sprint review covered..."
    },
    "error": null
  }
}

RESPONSE (failed):
{
  "success": true,
  "data": {
    "jobId":  "job_clx09xyz",
    "status": "FAILED",
    "error": {
      "code":    "AI_PIPELINE_TIMEOUT",
      "message": "AI extraction timed out after 120s",
      "retryable": true
    },
    "retryCount": 2,
    "maxRetries": 3,
    "nextRetryAt": "2026-05-29T12:02:00Z"
  }
}
```

**Long-Running Job Registry:**

```
ENDPOINT                              JOB TYPE                EST DURATION
──────────────────────────────────────────────────────────────────────────────
POST /meetings/{id}/reprocess         MEETING_REPROCESS       20-120 seconds
POST /teams/export                    TEAM_DATA_EXPORT        30-300 seconds
POST /analytics/generate-report       ANALYTICS_REPORT        5-60 seconds
POST /integrations/jira/bulk-sync     JIRA_BULK_SYNC          10-120 seconds
DELETE /teams/me (account deletion)   TEAM_DELETE             10-60 seconds
POST /meetings/import                 MEETING_IMPORT          10-120 seconds
```

---

### 4.6 Webhook Endpoints

Webhooks allow Vocaply to push events to external systems when things happen, rather than requiring external systems to poll.

#### Outbound Webhooks (Vocaply → Customer Systems)

```
REGISTERING A WEBHOOK:
  POST /api/v1/webhooks
  {
    "url":    "https://your-app.com/webhooks/vocaply",
    "events": ["meeting.processed", "commitment.missed", "commitment.fulfilled"],
    "secret": "your_webhook_secret_32chars_min"
  }

  RESPONSE:
  {
    "id":        "whk_clx01abc",
    "url":       "https://your-app.com/webhooks/vocaply",
    "events":    ["meeting.processed", "commitment.missed"],
    "status":    "active",
    "signingKey": "whsk_abc123...",   ← Use this to verify incoming payloads
    "createdAt": "2026-05-29T12:00:00Z"
  }

WEBHOOK PAYLOAD STRUCTURE:
  {
    "id":          "evt_clx02def",    ← Unique event ID (idempotency key)
    "type":        "meeting.processed",
    "apiVersion":  "v1",
    "createdAt":   "2026-05-29T12:34:56.789Z",
    "teamId":      "team_clx02xyz",
    "data": {
      "object": { ...full resource object... }
    },
    "previousData": { ...resource before change... }  ← null for creation events
  }

WEBHOOK DELIVERY GUARANTEES:
  Delivery:      At-least-once (may deliver duplicates)
  Ordering:      Not guaranteed
  Retry policy:  5 attempts: 1m → 5m → 30m → 2h → 8h
  Timeout:       10 seconds to receive 2xx response
  After 5 fails: Webhook marked as "failing", admin email sent
  
IDEMPOTENCY:
  Each event has a unique "id" field — use it to deduplicate on your end
  Store processed event IDs for 24 hours

SIGNING + VERIFICATION:
  Every webhook payload is signed with HMAC-SHA256

  Header sent: Vocaply-Signature: t=1716900000,v1=sha256hex

  Verification (Node.js):
    const [tPart, v1Part] = header.split(',')
    const timestamp = tPart.split('=')[1]
    const signature = v1Part.split('=')[1]
    const payload   = `${timestamp}.${rawBody}`
    const expected  = createHmac('sha256', signingKey).update(payload).digest('hex')
    const isValid   = timingSafeEqual(Buffer.from(signature), Buffer.from(expected))

  REPLAY PROTECTION:
    Reject webhooks where |Date.now() - timestamp * 1000| > 5 minutes
    This prevents replay attacks with captured payloads
```

#### Complete Webhook Event Catalog

```
CATEGORY: Meetings
  meeting.scheduled       Bot has been scheduled for a meeting
  meeting.recording       Bot started recording
  meeting.processing      Meeting ended, AI extraction started
  meeting.processed       AI extraction complete, data available
  meeting.failed          Bot or extraction failed

CATEGORY: Commitments
  commitment.created      New commitment extracted
  commitment.fulfilled    Commitment marked as fulfilled
  commitment.missed       Commitment deadline passed with no update
  commitment.deferred     Commitment deadline pushed to future

CATEGORY: Team
  team.member.joined      New member joined the team
  team.member.removed     Member removed from team
  team.plan.upgraded      Team upgraded to a higher plan
  team.plan.downgraded    Team downgraded (or subscription cancelled)

CATEGORY: Action Items
  action_item.created     New action item extracted from meeting
  action_item.completed   Action item marked as complete
  action_item.synced      Action item synced to Jira/Linear
```

#### Inbound Webhooks (External Systems → Vocaply)

```
ENDPOINT                  PROVIDER        SIGNATURE METHOD
──────────────────────────────────────────────────────────────────
POST /webhooks/recall     Recall.ai       HMAC-SHA256 (X-Recall-Signature)
POST /webhooks/stripe     Stripe          HMAC-SHA256 (Stripe-Signature)
POST /webhooks/jira       Atlassian       HMAC-SHA256 (X-Hub-Signature-256)
POST /webhooks/slack      Slack           HMAC-SHA256 (X-Slack-Signature)

INBOUND WEBHOOK RULES:
  1. Verify signature FIRST — reject immediately on invalid (400)
  2. Return 200 within 100ms — do all processing asynchronously
  3. Never block on downstream operations
  4. Deduplicate by event ID using Redis (TTL: 24 hours)
  5. Log all inbound events with provider, event type, and event ID
```

---

### 4.7 Real-Time Updates

Vocaply provides two real-time update mechanisms depending on the use case.

**Socket.io (WebSocket) — For Dashboard Real-Time:**

```
PROTOCOL:     WebSocket (ws:// / wss://)
LIBRARY:      Socket.io v4 (client + server)
AUTH:         JWT passed in socket.handshake.auth.token

CONNECTION:
  const socket = io('wss://api.vocaply.com', {
    auth: { token: accessToken },
    transports: ['websocket'],
  })

ROOM ARCHITECTURE:
  team:{teamId}      All events affecting the team (all members receive)
  user:{userId}      Personal events (only this user receives)
  meeting:{meetingId} Live meeting transcript turns (granular join)

EVENTS (server → client):
  See complete event catalog in §4.6 Webhook section above
  Same events, different delivery mechanism

TOKEN REFRESH DURING CONNECTION:
  Server emits: "system:session_expired"
  Client flow:
    1. Call POST /api/auth/refresh (cookie auto-sent)
    2. Get new accessToken
    3. socket.auth = { token: newAccessToken }
    4. socket.disconnect().connect()
```

**Server-Sent Events (SSE) — For Job Progress:**

```
USE CASE: Streaming progress updates for long-running jobs
PROTOCOL: HTTP with text/event-stream Content-Type (one-directional)

GET /api/v1/jobs/{jobId}/stream
Authorization: Bearer {token}
Accept: text/event-stream

RESPONSE:
  HTTP/1.1 200 OK
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  X-Accel-Buffering: no

  id: evt_1
  event: progress
  data: {"progress":10,"message":"Starting AI extraction..."}

  id: evt_2
  event: progress
  data: {"progress":45,"message":"Processing transcript chunks..."}

  id: evt_3
  event: progress
  data: {"progress":80,"message":"Running commitment resolver..."}

  id: evt_4
  event: complete
  data: {"progress":100,"status":"COMPLETED","result":{...}}

  [Connection closed by server]

RECONNECTION:
  Browser EventSource API reconnects automatically using Last-Event-ID header
  Server resumes stream from last delivered event ID
```

---

### 4.8 Polling vs WebSockets Decision Framework

```
DECISION MATRIX:

FACTOR               USE POLLING               USE WEBSOCKETS (Socket.io)
──────────────────────────────────────────────────────────────────────────────
Update Frequency     < 1 update/minute        > 1 update/minute
Latency Requirement  > 30 seconds acceptable  < 1 second required
Client Count         < 100 concurrent         100+ concurrent
Connection Cost      Acceptable overhead      Need persistent connection
Browser Support      All browsers             All modern browsers
Infrastructure       Simple (no socket server) Requires Socket.io server
Mobile Battery       Important (save battery)  Less critical

VOCAPLY SPECIFIC DECISIONS:
  Meeting bot status    → WebSocket (updates every few seconds during recording)
  Live transcript turns → WebSocket (real-time word-by-word)
  Commitment updates    → WebSocket (team dashboard stays live)
  Score changes         → WebSocket (visible in real-time)
  Job progress          → SSE (unidirectional, progress bar)
  Analytics data        → Polling (changes at most once per minute)
  Billing status        → Polling (changes only on Stripe events)
  Calendar event sync   → Polling (hourly cron, not real-time)

POLLING BEST PRACTICES (when used):
  Always use ETag + If-None-Match:
    Client: GET /api/v1/analytics/overview
            If-None-Match: "etag_abc123"
    Server: 304 Not Modified  (no body, saves bandwidth)
         OR 200 OK + new data + new ETag

  Implement exponential backoff on errors:
    Initial: 5s, then 10s, 20s, max 60s
    Reset to 5s when user becomes active again

  Use conditional headers for efficiency:
    If-Modified-Since: Thu, 29 May 2026 10:00:00 GMT
    Server returns 304 if nothing changed
```

---

## 5. API Security Design

### 5.1 JWT Authentication

```
TOKEN ARCHITECTURE:
  Access Token:
    Format:    JWT (JSON Web Token)
    Algorithm: HS256 (HMAC-SHA256) — consider RS256 for future multi-service
    Expiry:    15 minutes
    Storage:   In-memory only (Zustand on frontend, never localStorage)
    Claims:    sub (userId), teamId, role, email, iat, exp, iss, aud

  Refresh Token:
    Format:    Opaque random string (crypto.randomBytes(32).toString('hex'))
    Storage:   SHA-256 hash stored in PostgreSQL
               Original delivered via HttpOnly, Secure, SameSite=Strict cookie
               Cookie path restricted to /auth/refresh only
    Expiry:    30 days (sliding window — refreshed on every use)
    Rotation:  Token rotated on every refresh (old token deleted, new issued)

ACCESS TOKEN CLAIMS:
  {
    "iss": "vocaply.com",           Issuer
    "aud": "vocaply-api",           Audience (prevents use on other services)
    "sub": "usr_clx01abc",          Subject (userId)
    "teamId": "team_clx02xyz",      Current team
    "role": "MANAGER",              User's role in team
    "email": "ali@techflow.com",    For logging/debugging only
    "iat": 1716900000,              Issued at
    "exp": 1716900900               Expires at (iat + 900s = 15 min)
  }

TOKEN VALIDATION STEPS (every request):
  1. Check Authorization header present + starts with "Bearer "
  2. Extract token string
  3. jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'vocaply.com', audience: 'vocaply-api' })
  4. Check exp claim > current timestamp (JWT library handles this)
  5. Check blacklist (revoked tokens stored in Redis SET, TTL = token expiry)
  6. Attach decoded payload to req.user

TOKEN BLACKLIST (for logout + password reset):
  On logout:         SET token:blacklist:{jti} EX 900  (15 min = access token TTL)
  On password reset: All refresh tokens for user deleted from DB
                     Access tokens self-expire in ≤15 min (acceptable gap)
  On account lock:   SET token:blacklist:{sub} EX 900  (user-level blacklist)
```

### 5.2 RBAC & Role Permissions

```
ROLE HIERARCHY (highest → lowest):
  OWNER    Level 4   Team creator. Only one per team. Cannot be changed.
  ADMIN    Level 3   Full team management. Can change roles, manage billing.
  MANAGER  Level 2   Can see all team data. Can close/defer anyone's commitments.
  MEMBER   Level 1   Can only manage own commitments. Limited team visibility.

ROLE INHERITANCE:
  ADMIN can do everything MANAGER can
  MANAGER can do everything MEMBER can
  Roles are additive — higher role includes all lower role permissions

PERMISSION MATRIX:
ACTION                                  MEMBER  MANAGER  ADMIN  OWNER
────────────────────────────────────────────────────────────────────────────
View own commitments                    ✓       ✓        ✓      ✓
Update own commitments (fulfill/defer)  ✓       ✓        ✓      ✓
View all team commitments               ✓       ✓        ✓      ✓
Update any team member's commitments    ✗       ✓        ✓      ✓
View team analytics                     ✗       ✓        ✓      ✓
View individual member analytics        ✗       ✓        ✓      ✓
Invite team members                     ✗       ✗        ✓      ✓
Remove team members                     ✗       ✗        ✓      ✓
Change member roles                     ✗       ✗        ✓      ✓
Connect/disconnect integrations         ✗       ✗        ✓      ✓
Manage billing (upgrade/downgrade)      ✗       ✗        ✓      ✓
View invoices                           ✗       ✗        ✓      ✓
Delete meetings                         ✗       ✗        ✓      ✓
Delete team data (bulk)                 ✗       ✗        ✗      ✓
Delete team / transfer ownership        ✗       ✗        ✗      ✓
Create API keys                         ✗       ✗        ✓      ✓
Revoke API keys                         ✗       ✗        ✓      ✓
Register webhooks                       ✗       ✗        ✓      ✓

IMPLEMENTATION:
  requireRole('ADMIN') middleware checks:
    roleHierarchy[req.user.role] >= roleHierarchy['ADMIN']
    → 403 FORBIDDEN if insufficient
  
  Resource-level ownership:
    Commitment update:
      MEMBER can update IF commitment.ownerId === req.user.id
      MANAGER+ can update ANY commitment in their team
```

### 5.3 Scopes Model

Scopes are used for API keys and OAuth grants. They define exactly what a credential is allowed to do.

```
SCOPE FORMAT:   resource:action
WILDCARD:       resource:*  (all actions on resource)
FULL ACCESS:    *  (all scopes — only for owner-generated API keys)

DEFINED SCOPES:
  meetings:read             Read meetings, transcripts
  meetings:write            Create, update, delete meetings
  meetings:bot              Control bot (add/remove)
  
  commitments:read          Read commitments and stats
  commitments:write         Update commitment statuses
  commitments:own           Update only own commitments (MEMBER default)
  
  action_items:read         Read action items
  action_items:write        Update action items
  action_items:sync         Trigger Jira/Linear sync
  
  analytics:read            Read analytics and trends
  
  team:read                 Read team info and members
  team:write                Invite/remove members, update settings
  team:roles                Change member roles
  
  integrations:read         Read integration status
  integrations:write        Connect/disconnect integrations
  
  billing:read              Read subscription and invoices
  billing:write             Upgrade/downgrade subscription
  
  webhooks:read             List registered webhooks
  webhooks:write            Create/delete webhooks
  
  notifications:read        Read notification preferences
  notifications:write       Update notification preferences

SCOPE VALIDATION:
  API Key request:   Check key.scopes.includes(requiredScope)
  JWT request:       Role → implicit scopes (no explicit scope checking)

SCOPE EXAMPLES BY INTEGRATION TYPE:
  Jira integration bot:     ["meetings:read", "action_items:read", "action_items:sync"]
  Analytics dashboard:      ["meetings:read", "commitments:read", "analytics:read"]
  Slack bot:                ["commitments:read", "notifications:write"]
  Read-only audit client:   ["meetings:read", "commitments:read", "analytics:read"]
  CI/CD meeting recorder:   ["meetings:write", "meetings:bot"]
```

### 5.4 API Keys (Machine-to-Machine)

```
FORMAT:       vply_{env}_{random_32_bytes_base62}
EXAMPLES:
  vply_live_K8x2mQ9pR7nL4vJw...    Production key
  vply_test_abc123xyz456...          Test/sandbox key

STRUCTURE:
  vply         → Vocaply prefix (identifies source)
  live/test    → Environment (live = production, test = sandbox)
  random_part  → 32 bytes encoded in base62 (URL-safe, high entropy)

STORAGE:
  Full key:       NEVER stored — shown ONCE at creation, never again
  Stored in DB:   SHA-256(key) + last 4 chars of key (for display)
  Verification:   sha256(incomingKey) === storedHash

CREATE API KEY:
  POST /api/v1/api-keys
  Authorization: Bearer {jwt}  (ADMIN role required)
  {
    "name":       "Jira Integration Bot",
    "scopes":     ["meetings:read", "action_items:read", "action_items:sync"],
    "expiresAt":  "2027-01-01T00:00:00Z"   // null = never expires
  }

  RESPONSE (key shown ONCE — never retrievable again):
  {
    "id":         "key_clx01abc",
    "name":       "Jira Integration Bot",
    "key":        "vply_live_K8x2mQ9pR7nL4vJw3A...",  ← SHOW ONCE
    "keyHint":    "...Jw3A",                            ← Displayed going forward
    "scopes":     ["meetings:read", "action_items:sync"],
    "expiresAt":  "2027-01-01T00:00:00Z",
    "createdAt":  "2026-05-29T12:00:00Z",
    "createdBy":  "ali@techflow.com"
  }

LIST API KEYS:
  GET /api/v1/api-keys
  RESPONSE: [ { id, name, keyHint, scopes, expiresAt, lastUsedAt, createdAt } ]
  Key itself is NEVER returned after creation

REVOKE API KEY:
  DELETE /api/v1/api-keys/{keyId}

USING AN API KEY:
  Option 1: Authorization header
    Authorization: Bearer vply_live_K8x2mQ9...

  Option 2: X-API-Key header
    X-API-Key: vply_live_K8x2mQ9...

  Option 3: Query parameter (not recommended, only for legacy compatibility)
    GET /api/v1/meetings?api_key=vply_live_K8x2mQ9...
    WARNING: Query params appear in server logs — avoid for sensitive systems

API KEY AUTHENTICATION MIDDLEWARE:
  1. Detect "vply_" prefix in Bearer token or X-API-Key header
  2. SHA-256 hash the incoming key
  3. Look up hash in api_keys table
  4. Check: not revoked, not expired
  5. Verify requested action is within key.scopes
  6. Attach { userId: key.createdByUserId, teamId: key.teamId, scopes: key.scopes }
  7. Update key.lastUsedAt (async, non-blocking)
```

### 5.5 Rate Limiting & Throttling

```
RATE LIMITING TIERS:

TIER 1 — IP-based (pre-authentication):
  Applies to:  All requests, including unauthenticated
  Limit:       100 requests / 60 seconds per IP
  Burst:       150 (50% burst headroom)
  Headers:     X-RateLimit-Policy: 100;w=60
  On exceed:   429 → Retry-After: 60

TIER 2 — User-based (post-authentication, JWT):
  Applies to:  All authenticated requests
  Limit:       200 requests / 60 seconds per userId
  Burst:       300
  Headers:     X-RateLimit-Policy: 200;w=60
  On exceed:   429 → Retry-After: {seconds_until_window_reset}

TIER 3 — API Key-based:
  Default key: 100 requests / 60 seconds
  Per-key override available (ADMIN can request higher limits)
  Headers:     X-RateLimit-Policy: 100;w=60

TIER 4 — Plan-based (per team per month):
  FREE plan:       5 meetings/month (hard limit, 402 on exceed)
  STARTER plan:    40 meetings/month
  GROWTH plan:     120 meetings/month
  BUSINESS plan:   300 meetings/month
  ENTERPRISE plan: Custom limits

ENDPOINT-SPECIFIC RATE LIMITS (override global):
  POST   /auth/login                5 / 15 minutes per email (brute force protection)
  POST   /auth/forgot-password      3 / 60 minutes per email
  POST   /auth/resend-verification  1 / 60 seconds per email
  POST   /api/v1/batch              10 / 60 seconds per user (batch = 20 sub-requests each)
  POST   /api/v1/webhooks           10 webhook registrations per team total
  POST   /api/v1/meetings           Plan limit applies (see TIER 4)

THROTTLING vs RATE LIMITING:
  Rate Limiting:  Hard counter — X requests per window. Exceed = 429.
  Throttling:     Soft queue — requests beyond threshold are delayed (queued),
                  not rejected. Used for non-urgent write operations.
  
  Vocaply throttling targets:
    POST /integrations/*/sync      → Throttled to 1 concurrent sync per team
    POST /meetings/*/reprocess     → Throttled to 2 concurrent reprocesses per team
    Bulk API (POST */bulk)         → Throttled to 3 concurrent bulk ops per team

RATE LIMIT IMPLEMENTATION:
  Algorithm:  Sliding window log (using Redis sorted sets)
  Storage:    Redis with ZADD/ZCARD/ZREMRANGEBYSCORE (atomic Lua script)
  Key format: ratelimit:{tier}:{identifier}
```

### 5.6 Signed Requests

Signed requests are used for high-security operations where the payload integrity must be guaranteed, and replay attacks must be prevented.

```
WHEN USED:
  - Outbound webhook verification (Vocaply → your server)
  - Inbound webhook verification (Recall.ai, Stripe → Vocaply)
  - Sensitive API operations (team deletion, bulk member removal)

SIGNING ALGORITHM: HMAC-SHA256

SIGNATURE CONSTRUCTION:
  1. Build signed_payload = "{timestamp}.{requestBody}"
  2. signature = HMAC-SHA256(signed_payload, signingKey).hexDigest()
  3. Send header: Vocaply-Signature: t={timestamp},v1={signature}

VERIFICATION:
  1. Extract timestamp and signature from header
  2. Reject if |now - timestamp| > 300 seconds (5 min replay window)
  3. Recompute: expected_sig = HMAC-SHA256("{timestamp}.{rawBody}", signingKey)
  4. timingSafeEqual(Buffer.from(signature), Buffer.from(expected_sig))
     → MUST use constant-time comparison to prevent timing oracle attacks
  5. If mismatch → 400 INVALID_SIGNATURE

CODE (Node.js verification):
  function verifySignature(header: string, rawBody: Buffer, secret: string): void {
    const parts = header.split(',')
    const timestamp = parts[0].split('=')[1]
    const receivedSig = parts[1].split('=')[1]

    // Replay protection
    if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
      throw new Error('Request timestamp too old — possible replay attack')
    }

    const payload  = `${timestamp}.${rawBody.toString('utf8')}`
    const expected = createHmac('sha256', secret).update(payload).digest('hex')

    const a = Buffer.from(receivedSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('Signature mismatch')
    }
  }
```

### 5.7 Security Matrix Per Endpoint Category

```
ENDPOINT CATEGORY         AUTH METHOD    ROLE REQUIRED   SCOPES REQUIRED    RATE LIMIT TIER
────────────────────────────────────────────────────────────────────────────────────────────────
Public (no auth)
  GET /billing/plans        None           None             None               IP only
  GET /health               None           None             None               IP only

Auth endpoints
  POST /auth/register       None           None             None               IP + email (5/15m)
  POST /auth/login          None           None             None               IP + email (5/15m)
  POST /auth/refresh        Cookie only    None             None               IP (100/60s)
  GET  /auth/google         None           None             None               IP
  GET  /auth/google/callback None          None             None               IP

Standard user (any authenticated)
  GET  /auth/me             JWT / API Key  any              team:read          User (200/60s)
  GET  /meetings            JWT / API Key  any              meetings:read      User (200/60s)
  GET  /meetings/:id        JWT / API Key  any              meetings:read      User (200/60s)
  GET  /commitments         JWT / API Key  any              commitments:read   User (200/60s)
  PATCH /commitments/:id    JWT / API Key  any (own)        commitments:write  User (200/60s)

Manager-level
  GET  /commitments/stats   JWT only       MANAGER+         analytics:read     User (200/60s)
  GET  /analytics/*         JWT only       MANAGER+         analytics:read     User (100/60s)
  PATCH /commitments/:id    JWT only       MANAGER+         commitments:write  User (200/60s)

Admin-level
  POST /teams/me/invite     JWT only       ADMIN+           team:write         User (50/60s)
  PATCH /teams/me           JWT only       ADMIN+           team:write         User (50/60s)
  POST /integrations/*/     JWT only       ADMIN+           integrations:write User (20/60s)
  POST /billing/checkout    JWT only       ADMIN+           billing:write      User (5/60s)
  POST /api-keys            JWT only       ADMIN+           —                  User (10/60s)
  POST /webhooks            JWT only       ADMIN+           webhooks:write     User (10/60s)

Webhook routes (signature auth, no JWT)
  POST /webhooks/recall     Signature      None             None               IP (unlimited*)
  POST /webhooks/stripe     Signature      None             None               IP (unlimited*)
  POST /webhooks/jira       Signature      None             None               IP (unlimited*)
    *Recall.ai/Stripe IPs can be allowlisted for higher limits

Batch & Bulk
  POST /batch               JWT / API Key  any              depends on ops     User (10/60s)
  POST /*/bulk              JWT / API Key  MANAGER+         depends on op      User (5/60s)

Async Jobs
  POST /*/reprocess         JWT only       ADMIN+           meetings:write     User (2 concurrent)
  GET  /jobs/:id            JWT / API Key  any              —                  User (200/60s)
  GET  /jobs/:id/stream     JWT only       any              —                  User (10 open SSE)
```

---

## 6. Scalable Filtering & Query Standards

### 6.1 Filtering Operators

All list endpoints support a consistent filtering DSL. Operators are expressed using bracket notation.

```
OPERATOR          SYNTAX                     DESCRIPTION
────────────────────────────────────────────────────────────────────────────────
Exact match       ?status=PENDING            Field equals value
Not equal         ?status[ne]=CANCELLED      Field does not equal value
Greater than      ?daysOverdue[gt]=0         Strictly greater than
Greater or equal  ?daysOverdue[gte]=1        Greater than or equal
Less than         ?score[lt]=50              Strictly less than
Less or equal     ?score[lte]=100            Less than or equal
In list           ?status[in]=PENDING,MISSED Field value is in the comma-list
Not in list       ?status[nin]=CANCELLED,FULFILLED
Contains (text)   ?text[contains]=login      Case-insensitive substring match
Starts with       ?title[startswith]=Monday  Prefix match
Is null           ?dueDate[null]=true        Field is null
Is not null       ?dueDate[null]=false       Field is not null
Between           ?score[between]=60,90      Inclusive range (use with gte+lte)
Exists            ?jiraIssueId[exists]=true  Field has a non-null, non-empty value

USAGE EXAMPLES:
  GET /api/v1/commitments?status[in]=PENDING,MISSED
  GET /api/v1/commitments?dueDate[lte]=2026-05-31
  GET /api/v1/commitments?confidenceScore[gte]=0.7
  GET /api/v1/meetings?platform[ne]=MANUAL
  GET /api/v1/action-items?dueDate[null]=false&completed=false
  GET /api/v1/commitments?text[contains]=login
  GET /api/v1/members?commitmentScore[between]=60,89

MULTIPLE FILTERS (AND logic by default):
  GET /api/v1/commitments?status=PENDING&ownerId=usr_01&dueDate[lte]=2026-06-01
  → Returns: PENDING commitments owned by usr_01 due before June 1

OR LOGIC (using $or parameter):
  GET /api/v1/commitments?$or[0][status]=PENDING&$or[1][status]=MISSED
  Equivalent to: WHERE status = 'PENDING' OR status = 'MISSED'
  Simpler alias: GET /api/v1/commitments?status[in]=PENDING,MISSED

FILTER VALIDATION:
  Unknown filter fields → 422 UNKNOWN_FILTER_FIELD with list of valid fields
  Invalid operator → 422 INVALID_OPERATOR
  Invalid value type → 422 FILTER_TYPE_MISMATCH (e.g., string for numeric filter)
  Too many filters → 422 TOO_MANY_FILTERS (max 10 filter conditions)
```

### 6.2 Search Strategy

```
TEXT SEARCH ENDPOINT STANDARD:
  GET /api/v1/meetings?search=standup
  GET /api/v1/commitments?search=login feature
  GET /api/v1/action-items?search=fix payment bug

SEARCH BEHAVIOR:
  - Case-insensitive by default
  - Searches across all indexed text fields for that resource
  - Minimum search term length: 2 characters (reject shorter with 422)
  - Maximum search term length: 200 characters

SEARCH INDEX PER RESOURCE:
  Meetings:     title (ILIKE)
  Commitments:  text, normalized_text (PostgreSQL ILIKE)
  Action Items: text (ILIKE)
  Transcripts:  full_text (MongoDB Atlas Search — full text index)
  Members:      name, email (ILIKE)

FULL-TEXT SEARCH (Transcripts):
  GET /api/v1/meetings/{id}/transcript?search=login feature

  Uses MongoDB Atlas Search (Lucene English analyzer):
    - Stemming: "logged" matches "login"
    - Stop words removed: "the", "a", "in"
    - Returns highlighted excerpts with matching terms

  RESPONSE includes highlight metadata:
  {
    "turns": [
      {
        "id":        "turn_42",
        "text":      "Ahmed will <em>finish the login</em> feature by Thursday",
        "highlight": "Ahmed will <em>finish the login</em> feature by Thursday",
        "startTime": 542.1,
        "relevanceScore": 0.87
      }
    ],
    "totalMatches": 3
  }

SEARCH + FILTER COMBINATION:
  GET /api/v1/commitments?search=login&status=PENDING&ownerId=usr_01
  → Text search applied first → then status and owner filters applied to results
```

### 6.3 Cursor Pagination

Cursor pagination is the recommended approach for real-time data and large datasets. It is efficient, consistent, and immune to the "missing/duplicate records" problem of offset pagination when records are inserted/deleted between pages.

```
HOW IT WORKS:
  The cursor encodes the sort field values of the last record on the current page.
  On the next request, the server fetches records "after" that position.

REQUEST:
  GET /api/v1/commitments?limit=20
  GET /api/v1/commitments?limit=20&cursor=cursor_encoded_abc123
  GET /api/v1/commitments?limit=20&cursor=cursor_encoded_xyz789&direction=prev

RESPONSE:
  {
    "success": true,
    "data": [ ...20 commitments... ],
    "meta": {
      "limit":      20,
      "hasMore":    true,
      "nextCursor": "cursor_eyJpZCI6ImNvbV8xMjMiLCJjcmVhdGVkQXQiOiIyMDI2LTA1LTI5In0=",
      "prevCursor": "cursor_eyJpZCI6ImNvbV8xMDAiLCJjcmVhdGVkQXQiOiIyMDI2LTA1LTI3In0=",
      "count":      20
    }
  }

CURSOR FORMAT (internal, not exposed to clients):
  Base64URL(JSON({ id: "com_123", createdAt: "2026-05-29T10:00:00Z" }))
  The cursor is opaque to clients — they must not parse or construct cursors.
  Clients only pass cursors received from previous responses.

SERVER IMPLEMENTATION:
  Default sort: createdAt DESC + id DESC (for tie-breaking)
  
  First page:
    WHERE team_id = $teamId AND ...filters...
    ORDER BY created_at DESC, id DESC
    LIMIT $limit + 1  (fetch one extra to determine hasMore)
  
  Next page (cursor provided):
    decodedCursor = base64url.decode(cursor) → { id, createdAt }
    
    WHERE team_id = $teamId
      AND ...filters...
      AND (created_at, id) < ($cursorCreatedAt, $cursorId)  -- for DESC order
    ORDER BY created_at DESC, id DESC
    LIMIT $limit + 1
  
  Determine hasMore:
    results = query returns $limit + 1 items
    hasMore = results.length > limit
    actualResults = results.slice(0, limit)
    nextCursor = hasMore ? encode(lastItem) : null

CURSOR PAGINATION CONSTRAINTS:
  Cursors are valid for 24 hours — after that, re-query from start
  Maximum limit: 100 items per page
  Minimum limit: 1 item per page
  Default limit: 20 items

USE CURSOR PAGINATION FOR:
  GET /commitments     (high write rate — avoid offset drift)
  GET /meetings        (new meetings added frequently)
  GET /action-items    (changes rapidly after meetings)
  GET /usage-events    (append-only time series)
  Real-time feeds in dashboard
```

### 6.4 Offset Pagination

Offset pagination is provided for analytics reports and administrative views where the total count is needed and the dataset is relatively stable.

```
REQUEST:
  GET /api/v1/analytics/members?page=2&limit=25
  GET /api/v1/billing/invoices?page=1&limit=12

RESPONSE:
  {
    "success": true,
    "data": [ ... ],
    "meta": {
      "page":    2,
      "limit":   25,
      "total":   150,
      "hasMore": true,
      "pages":   6,
      "from":    26,   ← First record index on this page (1-based)
      "to":      50    ← Last record index on this page
    },
    "_links": {
      "self":  "/api/v1/analytics/members?page=2&limit=25",
      "first": "/api/v1/analytics/members?page=1&limit=25",
      "prev":  "/api/v1/analytics/members?page=1&limit=25",
      "next":  "/api/v1/analytics/members?page=3&limit=25",
      "last":  "/api/v1/analytics/members?page=6&limit=25"
    }
  }

OFFSET CALCULATION (SQL):
  LIMIT  = $limit
  OFFSET = ($page - 1) * $limit

OFFSET PAGINATION CONSTRAINTS:
  Maximum page:  500 (OFFSET = 500 * 100 = 50,000 — deep pagination degrades performance)
  Maximum limit: 100
  Default limit: 20
  Minimum limit: 1
  Total count:   Always included (use COUNT() subquery)

USE OFFSET PAGINATION FOR:
  GET /analytics/*     (stable aggregated data, total count needed for reporting)
  GET /billing/invoices (small dataset, rarely changes)
  GET /auth/sessions   (small dataset)
  Admin export endpoints (where "page X of Y" UI is shown)

PERFORMANCE NOTE:
  For pages > 50 with large datasets, OFFSET becomes slow (PostgreSQL scans rows to skip).
  Consider switching to keyset (cursor) pagination or adding a covering index:
    CREATE INDEX idx_meetings_team_scheduled ON meetings(team_id, scheduled_at DESC, id DESC);
```

### 6.5 Sorting Standards

```
SORT SYNTAX:
  ?sort=createdAt           Ascending (default direction)
  ?sort=-createdAt          Descending (prefix with -)
  ?sort=-createdAt,name     Multi-sort: created DESC, then name ASC
  ?sortBy=createdAt&sortOrder=desc  Alternative explicit syntax (also accepted)

SORTABLE FIELDS PER RESOURCE:
  Meetings:     title, scheduledAt, createdAt, durationMinutes, status
  Commitments:  createdAt, dueDate, status, ownerName, confidenceScore
  ActionItems:  createdAt, dueDate, priority, completed, assigneeName
  Members:      name, joinedAt, commitmentScore, fulfillmentRate
  Invoices:     amount, paidAt, createdAt

SORT VALIDATION:
  Unsortable field → 422 UNSORTABLE_FIELD
  {
    "error": {
      "code":    "UNSORTABLE_FIELD",
      "message": "Field 'rawTranscript' is not sortable",
      "details": { "validSortFields": ["title", "scheduledAt", "createdAt", ...] }
    }
  }

DEFAULT SORTS (when no sort specified):
  Meetings:     scheduledAt DESC (most recent first)
  Commitments:  dueDate ASC then createdAt DESC (soonest deadline first)
  ActionItems:  priority DESC then dueDate ASC (most urgent first)
  Members:      commitmentScore DESC (best performers first)
  Invoices:     paidAt DESC (most recent invoice first)

MULTI-COLUMN SORT:
  Always append "id DESC" as the final tiebreaker:
    ORDER BY scheduled_at DESC, id DESC
  This ensures deterministic ordering even when multiple records have the same
  primary sort value — prevents cursor pagination from returning duplicate records.

SORT SECURITY:
  Never allow sorting by: passwordHash, accessToken, stripeCustomerId, encryptedFields
  These fields are excluded from sortable field whitelist
```

---

## 7. API Lifecycle & Deprecation

### 7.1 Versioning & Sunset Flow

```
LIFECYCLE STAGES:

STAGE 1 — DEVELOPMENT (Internal preview)
  Duration:     As needed
  Access:       Internal team only
  Commitment:   None — can change or remove anytime
  Headers:      No special headers

STAGE 2 — PREVIEW (Beta)
  Duration:     Minimum 60 days
  Access:       Opt-in via X-Vocaply-Preview: v2 header
  Commitment:   Endpoint contract is reasonably stable but NOT guaranteed
  Headers:      X-API-Version-Stage: preview
                Warning: 299 - "Preview API: Breaking changes may occur"
  
STAGE 3 — STABLE (GA - Generally Available)
  Duration:     Minimum 12 months before deprecation
  Access:       All clients, no special headers needed
  Commitment:   Full stability guarantee — no breaking changes
  Headers:      X-API-Version: 1
  
STAGE 4 — DEPRECATED
  Duration:     Minimum 6 months (from announcement to sunset)
  Access:       Still works, but actively discouraged
  Announcement: Email to all API consumers, docs updated, blog post
  Headers:      Deprecation: true
                Sunset: {RFC 7231 date 6 months from now}
                Link: <https://docs.vocaply.com/migration/v2>; rel="successor-version"
                Warning: 299 - "Deprecated: This endpoint will be removed on {date}"

STAGE 5 — SUNSET (Removed)
  Response:     410 Gone — endpoint permanently removed
  Headers:      Link: <https://docs.vocaply.com/migration/v2>; rel="successor-version"
  Body:
    {
      "success": false,
      "error": {
        "code":    "ENDPOINT_SUNSET",
        "message": "This API endpoint was sunset on 2027-01-01. Please migrate to v2.",
        "details": {
          "sunsetDate":  "2027-01-01",
          "migrationUrl": "https://docs.vocaply.com/migration/v2",
          "replacedBy":  "/api/v2/meetings"
        }
      }
    }
```

### 7.2 Deprecation Headers

```http
# Deprecation header (RFC 8594)
Deprecation: true

# Sunset header (RFC 8594) — ISO 8601 date when endpoint is removed
Sunset: Sat, 01 Jan 2027 00:00:00 GMT

# Link to migration guide and successor version
Link: <https://docs.vocaply.com/migration/v2>; rel="deprecation"
Link: <https://api.vocaply.com/api/v2/meetings>; rel="successor-version"

# Warning header (non-fatal advisory)
Warning: 299 api.vocaply.com "Deprecated: This endpoint will be sunset on 2027-01-01. See https://docs.vocaply.com/migration/v2"

# On the actual sunset date — 410 response with these headers:
Link: <https://docs.vocaply.com/migration/v2>; rel="successor-version"
```

**Deprecated Endpoint Response Injection (Middleware):**

```typescript
// middleware/deprecation.middleware.ts
const DEPRECATED_ENDPOINTS: Record<string, DeprecationConfig> = {
  'GET /api/v1/meetings/:id/summary': {
    sunsetDate:     '2027-01-01',
    migrationUrl:   'https://docs.vocaply.com/migration/meeting-summary',
    successorPath:  '/api/v2/meetings/:id',
    reason:         'Summary is now included directly in GET /meetings/:id response',
  },
}

export function deprecationMiddleware(req, res, next) {
  const config = DEPRECATED_ENDPOINTS[`${req.method} ${matchRoute(req.path)}`]
  if (!config) return next()

  const sunsetDate = new Date(config.sunsetDate)

  if (new Date() > sunsetDate) {
    return res.status(410).json({
      success: false,
      error: {
        code:    'ENDPOINT_SUNSET',
        message: `This endpoint was sunset on ${config.sunsetDate}`,
        details: { sunsetDate: config.sunsetDate, migrationUrl: config.migrationUrl }
      }
    })
  }

  // Still working — add deprecation headers
  res.set('Deprecation',  'true')
  res.set('Sunset',       sunsetDate.toUTCString())
  res.set('Link',         `<${config.migrationUrl}>; rel="deprecation"`)
  res.set('Warning',      `299 api.vocaply.com "Deprecated: sunset on ${config.sunsetDate}"`)

  next()
}
```

### 7.3 Migration Guides

Each major version bump produces a migration guide with this structure:

```
MIGRATION GUIDE: v1 → v2

────────────────────────────────────────────────────────────────────────────────
1. SUMMARY OF BREAKING CHANGES

  Feature        v1                          v2                    Impact
  ─────────────────────────────────────────────────────────────────────────────
  Meeting ID     mtg_clx05pqr               m_clx05pqr            Low — update parsing
  Pagination     offset-based only          cursor-based default   Medium — update clients
  Commitment     { status, resolvedAt }      { status, resolution: { at, by } }  Low
  Error format   { error.code }             { error.code, error.type }  Low — additive

────────────────────────────────────────────────────────────────────────────────
2. FIELD CHANGES

  GET /api/v2/meetings/:id
    REMOVED:   "transcriptAvailable" boolean (check transcript endpoint existence instead)
    RENAMED:   "summary" → "aiSummary" (avoids confusion with title)
    ADDED:     "processingDurationMs" (new field — ignore if not needed)
    CHANGED:   "participants" array — "speaker_tag" renamed to "speakerLabel"

────────────────────────────────────────────────────────────────────────────────
3. PAGINATION MIGRATION

  v1 offset pagination:
    GET /api/v1/meetings?page=2&limit=20

  v2 cursor pagination (recommended):
    GET /api/v2/meetings?limit=20
    → response.meta.nextCursor = "cursor_abc123"
    GET /api/v2/meetings?limit=20&cursor=cursor_abc123

  v2 offset pagination (still available for reports):
    GET /api/v2/meetings?page=2&limit=20&paginationMode=offset

────────────────────────────────────────────────────────────────────────────────
4. CLIENT MIGRATION CHECKLIST

  □ Update base URL from /api/v1/ to /api/v2/
  □ Update SDK version to ^2.0.0
  □ Handle new "processingDurationMs" field (ignore or display)
  □ Update pagination to cursor-based
  □ Update error handling for new error.type field
  □ Test against v2 preview for 2 weeks before cutover
  □ Monitor error rates after cutover

────────────────────────────────────────────────────────────────────────────────
5. PARALLEL RUNNING

  Run v1 and v2 in parallel for 2 weeks:
  - Point non-critical traffic to v2
  - Monitor error rates + latency
  - Fall back to v1 if issues detected
  - Full cutover when confidence established

────────────────────────────────────────────────────────────────────────────────
6. SUPPORT

  Migration help channel: #api-migration in customer Slack
  Office hours: Tuesdays 2pm UTC during migration period
  Email: api@vocaply.com
  SLA during migration: 4-hour response for migration-blocking issues
```

### 7.4 Compatibility Strategy

```
BACKWARD COMPATIBILITY GUARANTEES (within a major version):
  ✓ New optional request fields may be added
  ✓ New response fields will be added — clients MUST ignore unknown fields
  ✓ New enum values may be added — clients must handle UNKNOWN values gracefully
  ✓ New endpoints added — does not break existing clients
  ✓ Error messages may change — error.code is stable, error.message is NOT
  ✓ Rate limits may increase (more permissive) without notice

BACKWARD COMPATIBILITY VIOLATIONS (always triggers major version):
  ✗ Removing request or response fields
  ✗ Renaming fields
  ✗ Changing field data types
  ✗ Changing HTTP status codes
  ✗ Removing enum values
  ✗ Making optional fields required
  ✗ Changing resource ID format

CLIENT CODING STANDARDS FOR COMPATIBILITY:
  1. Always use "?" optional chaining for response fields
  2. Implement enum fallback: if (status === 'UNKNOWN_FUTURE_STATUS') { handle gracefully }
  3. Store only error.code (not error.message) for programmatic handling
  4. Use SDK — version-specific SDKs abstract breaking changes
  5. Set Accept: application/json (no version in Accept header)
```

### 7.5 Feature Flags for APIs

Feature flags allow new API behavior to be rolled out gradually without a full version bump.

```
MECHANISM: X-Vocaply-Feature header

USAGE:
  X-Vocaply-Feature: enhanced-similarity-v2
  X-Vocaply-Feature: new-scoring-algorithm,cursor-pagination-default

FEATURE FLAG TYPES:

TYPE 1 — Internal server behavior flags:
  Activated server-side based on team ID, plan, or A/B cohort
  Client is unaware — flag is set in server config
  
  Example: new-scoring-algorithm
    Enabled for 10% of teams → 25% → 50% → 100%
    Measures: score distribution change, user complaints, session activity
    
TYPE 2 — Client-requested preview features:
  Client must explicitly request via header
  Server validates: team must be on GROWTH+ plan, feature not sunset
  
  Example:
    Request:   X-Vocaply-Feature: cursor-pagination-default
    Behavior:  Pagination defaults to cursor-based instead of offset
    Response:  X-Vocaply-Feature-Active: cursor-pagination-default
    
TYPE 3 — Emergency kill switches:
  Disable a misbehaving feature without deployment
  Flip in Vercel Edge Config / LaunchDarkly → applies in <1s globally
  
  Example: disable-ai-resolution (if Claude resolver has a bug)
    → System falls back to simple extraction without cross-meeting matching
    → Teams notified via status page

FEATURE FLAG ENDPOINT:
  GET /api/v1/features
  → Returns active feature flags for the authenticated team
  {
    "features": {
      "cursorPaginationDefault":    true,
      "enhancedSimilarityV2":       false,
      "newScoringAlgorithm":        true,
      "multiLanguageSupport":       false
    }
  }
```

---

## 8. Complete Versioned Endpoint Catalog

### v1 Endpoint Registry (Current Stable)

```
#   VERSION  METHOD  PATH                                      AUTH           ROLE       IDEMPOTENT
────────────────────────────────────────────────────────────────────────────────────────────────────────

AUTH
1   v1  POST    /api/v1/auth/register                         None           —          Y (email)
2   v1  POST    /api/v1/auth/login                            None           —          N (counters)
3   v1  POST    /api/v1/auth/logout                           JWT            any        Y
4   v1  POST    /api/v1/auth/refresh                          Cookie         —          Y
5   v1  GET     /api/v1/auth/verify-email                     None           —          Y (token)
6   v1  POST    /api/v1/auth/resend-verification              None           —          N (sends email)
7   v1  POST    /api/v1/auth/forgot-password                  None           —          Y (email)
8   v1  POST    /api/v1/auth/reset-password                   None           —          Y (token)
9   v1  GET     /api/v1/auth/me                               JWT/Key        any        Y
10  v1  PATCH   /api/v1/auth/me                               JWT            any        Y
11  v1  POST    /api/v1/auth/change-password                  JWT            any        Y
12  v1  GET     /api/v1/auth/google                           None           —          N
13  v1  GET     /api/v1/auth/google/callback                  None           —          N
14  v1  GET     /api/v1/auth/github                           None           —          N
15  v1  GET     /api/v1/auth/github/callback                  None           —          N
16  v1  GET     /api/v1/auth/sessions                         JWT            any        Y
17  v1  DELETE  /api/v1/auth/sessions/:sessionId              JWT            any        Y

TEAMS
18  v1  POST    /api/v1/teams                                 JWT            any        Y (key)
19  v1  GET     /api/v1/teams/me                              JWT/Key        any        Y
20  v1  PATCH   /api/v1/teams/me                              JWT            ADMIN+     Y (key)
21  v1  POST    /api/v1/teams/me/invite                       JWT            ADMIN+     Y (key)
22  v1  GET     /api/v1/teams/me/members                      JWT/Key        any        Y
23  v1  PATCH   /api/v1/teams/me/members/:userId/role         JWT            ADMIN+     Y (key)
24  v1  DELETE  /api/v1/teams/me/members/:userId              JWT            ADMIN+     Y

MEETINGS
25  v1  POST    /api/v1/meetings                              JWT/Key        any        Y (key)
26  v1  GET     /api/v1/meetings                              JWT/Key        any        Y
27  v1  GET     /api/v1/meetings/:meetingId                   JWT/Key        any        Y
28  v1  GET     /api/v1/meetings/:meetingId/transcript        JWT/Key        any        Y
29  v1  DELETE  /api/v1/meetings/:meetingId                   JWT            ADMIN+     Y
30  v1  POST    /api/v1/meetings/bot/add                      JWT            any        Y (key)
31  v1  DELETE  /api/v1/meetings/:meetingId/bot               JWT            any        Y
32  v1  POST    /api/v1/meetings/:meetingId/reprocess         JWT            ADMIN+     Y (key) → 202

COMMITMENTS
33  v1  GET     /api/v1/commitments                           JWT/Key        any        Y
34  v1  GET     /api/v1/commitments/my                        JWT/Key        any        Y
35  v1  GET     /api/v1/commitments/stats                     JWT/Key        MANAGER+   Y
36  v1  GET     /api/v1/commitments/:commitmentId             JWT/Key        any        Y
37  v1  PATCH   /api/v1/commitments/:commitmentId/status      JWT/Key        any*       Y (key)
38  v1  POST    /api/v1/commitments/bulk                      JWT/Key        MANAGER+   Y (key)

ACTION ITEMS
39  v1  GET     /api/v1/action-items                          JWT/Key        any        Y
40  v1  PATCH   /api/v1/action-items/:actionItemId            JWT/Key        any        Y (key)
41  v1  POST    /api/v1/action-items/:actionItemId/sync       JWT/Key        any        Y (key)
42  v1  POST    /api/v1/action-items/bulk                     JWT/Key        MANAGER+   Y (key)

ANALYTICS
43  v1  GET     /api/v1/analytics/overview                    JWT/Key        MANAGER+   Y
44  v1  GET     /api/v1/analytics/members                     JWT/Key        MANAGER+   Y
45  v1  GET     /api/v1/analytics/trends                      JWT/Key        MANAGER+   Y

INTEGRATIONS
46  v1  GET     /api/v1/integrations                          JWT/Key        any        Y
47  v1  GET     /api/v1/integrations/:provider/oauth-url      JWT            ADMIN+     Y
48  v1  POST    /api/v1/integrations/:provider/callback       JWT            ADMIN+     Y (state)
49  v1  PATCH   /api/v1/integrations/:provider/settings       JWT            ADMIN+     Y (key)
50  v1  POST    /api/v1/integrations/:provider/test           JWT/Key        any        Y
51  v1  DELETE  /api/v1/integrations/:provider                JWT            ADMIN+     Y
52  v1  GET     /api/v1/integrations/calendar/events          JWT/Key        any        Y

BILLING
53  v1  GET     /api/v1/billing/plans                         None           —          Y
54  v1  GET     /api/v1/billing/subscription                  JWT/Key        any        Y
55  v1  POST    /api/v1/billing/checkout                      JWT            ADMIN+     Y (key)
56  v1  POST    /api/v1/billing/portal                        JWT            ADMIN+     Y (key)
57  v1  GET     /api/v1/billing/invoices                      JWT            ADMIN+     Y

NOTIFICATIONS
58  v1  GET     /api/v1/notifications/preferences             JWT/Key        any        Y
59  v1  PATCH   /api/v1/notifications/preferences             JWT            any        Y (key)
60  v1  POST    /api/v1/notifications/test                    JWT            any        Y (key)

API KEYS
61  v1  GET     /api/v1/api-keys                              JWT            ADMIN+     Y
62  v1  POST    /api/v1/api-keys                              JWT            ADMIN+     Y (key)
63  v1  DELETE  /api/v1/api-keys/:keyId                       JWT            ADMIN+     Y

WEBHOOKS (Outbound registration)
64  v1  GET     /api/v1/webhooks                              JWT/Key        ADMIN+     Y
65  v1  POST    /api/v1/webhooks                              JWT            ADMIN+     Y (key)
66  v1  PATCH   /api/v1/webhooks/:webhookId                   JWT            ADMIN+     Y (key)
67  v1  DELETE  /api/v1/webhooks/:webhookId                   JWT            ADMIN+     Y
68  v1  POST    /api/v1/webhooks/:webhookId/test              JWT            ADMIN+     Y (key)

ASYNC JOBS
69  v1  GET     /api/v1/jobs/:jobId                           JWT/Key        any        Y
70  v1  GET     /api/v1/jobs/:jobId/stream                    JWT            any        Y (SSE)
71  v1  DELETE  /api/v1/jobs/:jobId                           JWT            any        Y

BATCH
72  v1  POST    /api/v1/batch                                 JWT/Key        any        Y (key)

INBOUND WEBHOOKS (Signature auth — no JWT)
73  v1  POST    /webhooks/recall                              Signature      —          Y (botId)
74  v1  POST    /webhooks/stripe                              Signature      —          Y (eventId)
75  v1  POST    /webhooks/jira                                Signature      —          Y (eventId)
76  v1  POST    /webhooks/slack                               Signature      —          Y (eventId)

SYSTEM
77  v1  GET     /health                                       None           —          Y
78  v1  GET     /ready                                        None           —          Y
79  v1  GET     /api/v1/features                              JWT/Key        any        Y
────────────────────────────────────────────────────────────────────────────────────────────────────────
Total: 79 endpoints
* any = MEMBER can update own; MANAGER+ can update any
Y (key) = idempotent with X-Idempotency-Key
```

---

## 9. OpenAPI Contract & Schema Standards

### Contract-First Design Process

```
STEP 1 — Write the OpenAPI spec FIRST
  Before writing any code, the API spec is written in YAML
  using OpenAPI 3.1.0 specification.

STEP 2 — Peer review the spec
  API Design Review team reviews the spec file on GitHub PR.
  openapi-diff runs automatically to detect breaking changes.

STEP 3 — Generate server stubs
  npx @openapitools/openapi-generator-cli generate
    -i openapi.yaml
    -g nodejs-express-server
    -o services/api/src/generated

STEP 4 — Implement against stubs
  Engineers implement controller logic inside generated stub handlers.
  TypeScript types are auto-generated from the spec — never manually written.

STEP 5 — Validate against spec in CI
  express-openapi-validator runs on every test suite:
    - Request validation: every incoming request validated against spec
    - Response validation: every outgoing response validated against spec
    - Any mismatch fails CI → no drift between spec and implementation

STEP 6 — Publish to developer portal
  Spec auto-published to https://docs.vocaply.com/api on merge to main
```

### OpenAPI Spec Fragment (Example)

```yaml
# openapi.yaml (excerpt)
openapi: 3.1.0
info:
  title: Vocaply API
  version: 1.0.0
  description: AI Meeting Intelligence API
  contact:
    email: api@vocaply.com
    url:   https://docs.vocaply.com
  license:
    name: Proprietary

servers:
  - url: https://api.vocaply.com/api/v1
    description: Production
  - url: https://staging-api.vocaply.com/api/v1
    description: Staging

security:
  - BearerAuth: []
  - ApiKeyHeader: []

components:
  securitySchemes:
    BearerAuth:
      type:         http
      scheme:       bearer
      bearerFormat: JWT
    ApiKeyHeader:
      type: apiKey
      in:   header
      name: X-API-Key

  schemas:
    Commitment:
      type: object
      required: [id, teamId, meetingId, ownerId, text, status, createdAt]
      properties:
        id:
          type:    string
          pattern: "^com_[a-z0-9]+$"
          example: com_clx01abc
        text:
          type:      string
          minLength: 1
          maxLength: 2000
        status:
          type: string
          enum: [PENDING, FULFILLED, MISSED, DEFERRED, CANCELLED]
        confidenceScore:
          type:    number
          minimum: 0
          maximum: 1
        dueDate:
          type:    string
          format:  date-time
          nullable: true
        createdAt:
          type:   string
          format: date-time
          readOnly: true

    ApiError:
      type: object
      required: [success, error]
      properties:
        success:
          type: boolean
          enum: [false]
        requestId:
          type: string
        error:
          type: object
          required: [code, message]
          properties:
            code:    { type: string }
            message: { type: string }
            details: { type: object }
            docsUrl: { type: string, format: uri }

paths:
  /commitments:
    get:
      summary:     List team commitments
      operationId: listCommitments
      tags:        [Commitments]
      parameters:
        - name:   status
          in:     query
          schema:
            type: string
            enum: [PENDING, FULFILLED, MISSED, DEFERRED, CANCELLED]
        - name:   status[in]
          in:     query
          schema:
            type: string
          description: Comma-separated list of statuses (OR logic)
        - name:   dueDate[lte]
          in:     query
          schema:
            type:   string
            format: date-time
        - name:   overdue
          in:     query
          schema: { type: boolean }
        - name:   limit
          in:     query
          schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
        - name:   cursor
          in:     query
          schema: { type: string }
        - name:   sort
          in:     query
          schema: { type: string, example: "-dueDate,createdAt" }
      responses:
        '200':
          description: List of commitments
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean, enum: [true] }
                  data:
                    type:  array
                    items: { $ref: '#/components/schemas/Commitment' }
                  meta:
                    $ref: '#/components/schemas/CursorPaginationMeta'
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '429': { $ref: '#/components/responses/RateLimited' }
```

---

## 10. Performance, Caching & Observability Standards

### Response Caching Policy

```
RESOURCE TYPE           Cache-Control                       ETag    CDN Cache
────────────────────────────────────────────────────────────────────────────────
GET /billing/plans      public, max-age=3600, s-maxage=3600  No     YES (1 hour)
GET /health             public, max-age=30                   No     YES (30 sec)
GET /features           private, max-age=60                  No     No
GET /meetings (list)    private, no-cache                    Yes*   No
GET /meetings/:id       private, max-age=120                 Yes    No
GET /commitments        private, no-cache                    Yes*   No
GET /analytics          private, max-age=300                 Yes    No
POST (any)              no-store                             No     No
DELETE (any)            no-store                             No     No
Webhook endpoints       no-store                             No     No

* ETag from last-modified timestamp; 304 Not Modified on unchanged data
```

### Conditional Request Support

```http
# Client sends ETag from previous response
GET /api/v1/analytics/overview
If-None-Match: "etag_a1b2c3d4"

# Server response if unchanged (saves bandwidth)
HTTP/1.1 304 Not Modified
ETag: "etag_a1b2c3d4"

# Server response if changed
HTTP/1.1 200 OK
ETag: "etag_new_hash"
Content-Type: application/json
{ "success": true, "data": { ...updated data... } }
```

### Performance Targets Per Endpoint Category

```
CATEGORY                      P50        P95        P99        TIMEOUT
────────────────────────────────────────────────────────────────────────────
Auth (login, me)              20ms       100ms      200ms      5s
Simple reads (GET single)     15ms       80ms       150ms      5s
Paginated lists               30ms       150ms      300ms      10s
Analytics queries             50ms       500ms      1000ms     15s
AI extraction (async)         —          —          —          120s (job)
Batch API (20 sub-requests)   100ms      500ms      1000ms     10s
Webhook receipt               5ms        20ms       50ms       N/A (fire-and-forget)
SSE job stream                N/A (streaming)                  300s max stream
```

### Request Tracing Standards

```
Every request gets a correlation ID:

FLOW:
  Client sends (optional): X-Request-ID: my-req-abc123
  Server generates if absent: X-Request-ID = req_{cuid()}
  Server echoes back in response: X-Request-ID: req_abc123
  All log lines include: { "requestId": "req_abc123" }
  Sentry errors tagged with: requestId
  All downstream calls (to FastAPI, Recall.ai) pass: X-Request-ID header

STRUCTURED LOG FORMAT (every request):
  {
    "level":       "info",
    "requestId":   "req_abc123",
    "method":      "GET",
    "path":        "/api/v1/meetings",
    "statusCode":  200,
    "latencyMs":   47,
    "userId":      "usr_01",
    "teamId":      "team_01",
    "plan":        "GROWTH",
    "ip":          "103.21.4.5",
    "userAgent":   "Vocaply-SDK/1.2.0",
    "timestamp":   "2026-05-29T12:34:56.789Z"
  }

TRACE PROPAGATION HEADERS:
  X-Request-ID:    Correlation across services
  X-B3-TraceId:    Distributed tracing (OpenTelemetry compatible)
  X-B3-SpanId:     Current span
  X-B3-ParentSpanId: Parent span

API METRICS (tracked per endpoint):
  request_count{method, path, status_code, team_plan}
  request_duration_ms{method, path, p50, p95, p99}
  rate_limit_hits{endpoint, tier}
  error_count{error_code, path}
  active_websocket_connections{team_id}
  queue_depth{queue_name}
```

### API Health & Readiness Endpoints

```http
GET /health
→ 200 OK always (if process is alive)
{
  "status":    "ok",
  "timestamp": "2026-05-29T12:00:00Z",
  "version":   "1.0.3"
}

GET /ready
→ 200 OK when all dependencies are healthy
→ 503 Service Unavailable during startup or when dependencies fail
{
  "status": "ready",
  "checks": {
    "database":  { "status": "ok",   "latencyMs": 2 },
    "redis":     { "status": "ok",   "latencyMs": 1 },
    "mongodb":   { "status": "ok",   "latencyMs": 5 },
    "aiPipeline":{ "status": "ok",   "latencyMs": 12 }
  }
}

HEALTH CHECK BEHAVIOR:
  /health  → Used by load balancer (quick liveness check — no DB calls)
  /ready   → Used by Kubernetes readiness probe (full dependency check)
  
  If /ready returns 503:
    Load balancer stops routing traffic to this instance
    Kubernetes restarts the pod
    Instance excluded from pool until /ready returns 200
```

---

## Appendix A — Error Code Registry

```
CODE                      HTTP    CATEGORY        DESCRIPTION
──────────────────────────────────────────────────────────────────────────────
AUTH_REQUIRED             401     Auth            No authentication token provided
TOKEN_EXPIRED             401     Auth            JWT access token has expired
TOKEN_INVALID             401     Auth            JWT is malformed or tampered
INVALID_CREDENTIALS       401     Auth            Wrong email/password combination
EMAIL_NOT_VERIFIED        403     Auth            Account exists but email not verified
ACCOUNT_LOCKED            429     Auth            Too many failed login attempts
USE_OAUTH                 401     Auth            Account registered via OAuth — no password
FORBIDDEN                 403     Authorization   Valid token but insufficient role/scope
INSUFFICIENT_SCOPE        403     Authorization   API key missing required scope
NOT_FOUND                 404     Resource        Resource does not exist
DUPLICATE                 409     Resource        Resource already exists (unique constraint)
CONFLICT                  409     Resource        Resource state prevents the operation
VALIDATION_ERROR          422     Validation      Request body failed Zod validation
UNKNOWN_FILTER_FIELD      422     Query           Filter uses unknown field name
UNSORTABLE_FIELD          422     Query           Sort field not in sortable whitelist
INVALID_CURSOR            422     Pagination      Cursor is malformed or expired
FILTER_TYPE_MISMATCH      422     Query           Filter value wrong type for field
TOO_MANY_FILTERS          422     Query           More than 10 filter conditions
IDEMPOTENCY_CONFLICT      422     Idempotency     Same key reused with different body
PLAN_LIMIT                402     Billing         Monthly meeting or resource quota exceeded
PLAN_REQUIRED             402     Billing         Feature requires paid plan
ENDPOINT_DEPRECATED       —       Lifecycle       Deprecation warning (in header, not error)
ENDPOINT_SUNSET           410     Lifecycle       Endpoint permanently removed
RATE_LIMITED              429     Rate Limit      API rate limit exceeded
OAUTH_INVALID_STATE       400     OAuth           CSRF state parameter mismatch
OAUTH_DENIED              400     OAuth           User denied OAuth consent
WEBHOOK_INVALID           400     Webhook         Signature verification failed
IDEMPOTENCY_PROCESSING    409     Idempotency     Same idempotency key currently processing
INTEGRATION_ERROR         502     External        Third-party service returned an error
AI_PIPELINE_ERROR         502     External        AI extraction service returned an error
AI_PIPELINE_TIMEOUT       504     External        AI extraction exceeded timeout
INTERNAL_ERROR            500     Server          Unexpected server error
```

## Appendix B — SDK Design Principles

```
OFFICIAL SDKs MAINTAINED:
  @vocaply/node   — Node.js / TypeScript SDK (primary)
  @vocaply/python — Python SDK (for AI/data integrations)

SDK CONTRACT:
  - SDK versions track API versions: SDK 1.x.x → API v1
  - SDK 2.0.0 is published concurrently with API v2
  - SDK handles token refresh automatically
  - SDK retries 5xx and 429 with exponential backoff automatically
  - SDK generates idempotency keys automatically for POST mutations
  - SDK validates request objects against JSON Schema before sending
  - SDK exports full TypeScript types for all request/response shapes

USAGE EXAMPLE (Node.js SDK):
  import { VocaplyClient } from '@vocaply/node'

  const vocaply = new VocaplyClient({
    apiKey: 'vply_live_...',
  })

  // SDK handles pagination, retries, and idempotency automatically
  const meetings = await vocaply.meetings.list({
    status: 'DONE',
    limit:  20,
  })

  // Automatic idempotency key generation
  const meeting = await vocaply.meetings.create({
    title:       'Monday Standup',
    platform:    'ZOOM',
    meetingUrl:  'https://zoom.us/j/123',
    scheduledAt: new Date('2026-06-02T09:00:00Z'),
  })
  // SDK auto-attaches: X-Idempotency-Key: idem_{uuid}

  // Webhook signature verification helper
  const event = vocaply.webhooks.constructEvent(
    rawBody, signature, process.env.WEBHOOK_SECRET
  )
```

---

*Document: API-DESIGN-001 | Vocaply | Version 1.0 | May 2026*
*Full Scalable Enterprise API Design — Versioning, Security, Patterns, Lifecycle*
