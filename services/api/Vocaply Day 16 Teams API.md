# Vocaply — Day 16: Teams API
## Full Scalable Industry-Level Build Plan
> Senior Backend Engineer Edition | Production-Grade | 1M+ Users
> No Code — Pure Architecture, Logic & Security Plan
> Document: DAY-16-PLAN | Version 1.0 | June 2026

---

## Theme: The Billing Unit — Every Resource Lives Inside a Team

Auth complete hai. Ab team banao. Vocaply mein **har cheez team ke andar hoti hai** —
meetings, commitments, action items, integrations, billing. Team hi woh boundary hai
jo tenant isolation enforce karta hai. Aaj teams ka pura backend complete hoga:
create, get, update, invite, members list, role change, remove member.

---

## What We're Building Today

```
7 REST API Endpoints:
  POST   /api/v1/teams                          → Create team
  GET    /api/v1/teams/me                       → Get team + members + usage
  PATCH  /api/v1/teams/me                       → Update team settings
  POST   /api/v1/teams/me/invite                → Invite members
  GET    /api/v1/teams/me/members               → List members (paginated)
  PATCH  /api/v1/teams/me/members/:userId/role  → Change member role
  DELETE /api/v1/teams/me/members/:userId       → Remove member

2 Config Files:
  plans.config.ts       → Plan limits (FREE/STARTER/GROWTH/BUSINESS/ENTERPRISE)
  plan-limits.middleware.ts → Quota enforcement middleware

4 Service Files:
  teams.repository.ts   → All DB queries
  teams.service.ts      → All business logic
  team-health.service.ts → Team health score algorithm
  teams.validator.ts    → All Zod schemas

Supporting Files:
  teams.controller.ts   → HTTP layer only
  teams.routes.ts       → Route definitions
  teams.types.ts        → TypeScript interfaces
```

---

## File Structure

```
services/api/src/
│
├── config/
│   └── plans.config.ts                   ← Plan limits per tier
│
├── middleware/
│   └── plan-limits.middleware.ts          ← Quota enforcement
│
└── modules/
    └── teams/
        ├── teams.repository.ts            ← DB queries only
        ├── teams.service.ts               ← Business logic
        ├── team-health.service.ts         ← Health score algorithm
        ├── teams.controller.ts            ← HTTP layer (req/res only)
        ├── teams.validator.ts             ← Zod schemas
        ├── teams.routes.ts                ← Route definitions
        └── teams.types.ts                 ← TypeScript interfaces
```

---

## Architecture Pattern: Controller → Service → Repository

**GOLDEN RULE:** Every team operation follows this 3-layer pattern strictly.

```
Request → Controller (HTTP only) → Service (business logic) → Repository (DB only)
                                         ↓
                                    Redis Cache
                                    Email Service
                                    Socket.io Events
                                    Queue Jobs
```

**Why this matters at scale:**
- Controller: Never knows about DB. Only reads `req`, calls service, writes `res`.
- Service: Never knows about HTTP. Throws `AppError` subclasses. Testable in isolation.
- Repository: Never knows about business rules. Returns domain objects from Prisma.
- Each layer can be swapped, tested, or scaled independently.

---

## 1. `plans.config.ts` — Plan Limits

### What It Does
Single source of truth for all plan limits across the entire application.
Referenced by: middleware, service layer, billing API, frontend pricing page.

### Plan Limits Table

```
                   FREE    STARTER    GROWTH    BUSINESS    ENTERPRISE
meetings/month:       5         40       120         300            -1
members/team:         3         10        25          60            -1
historyDays:          7         90       365          -1            -1
integrations:         1         -1        -1          -1            -1
storageGB:            1         10        50          -1            -1
apiAccess:        false      false     false        true          true
ssoEnabled:       false      false     false       false          true

Note: -1 = unlimited
```

### Scalability Design
- All limits defined in one place — change pricing in one file
- TypeScript `as const` ensures type-safety across codebase
- `PlanType` exported type used everywhere (no magic strings)
- Limits checked via helper function: `getPlanLimit(plan, resource)`

---

## 2. `plans-limits.middleware.ts` — Quota Enforcement

### What It Does
Applied BEFORE the actual handler on quota-limited routes.
Checks current usage against plan limits BEFORE the operation.

### Routes Where Applied
```
POST /meetings            → checkMeetingLimit()
POST /teams/me/invite     → Checked inside inviteMembers service
```

### Logic Flow
```
1. Extract teamId from req.teamId (set by injectTenant middleware)
2. Redis cache check: GET cache:team:plan:{teamId}
     → Cache hit (TTL 1 hour): use cached { plan, meetingsUsed }
     → Cache miss: query PostgreSQL → cache result for 1 hour
3. Get plan limit: PLAN_LIMITS[plan].meetings
4. If limit === -1: unlimited plan → next() immediately
5. If meetingsUsed >= limit → throw PlanLimitError with:
     { used, limit, plan, upgradeUrl }
6. If under limit: next()
```

### Scalability Why
- **Redis cache (1-hour TTL):** Avoids DB hit on every meeting creation.
  At 1000 teams × 120 meetings/month = 120K quota checks/month.
  Without cache: 120K DB queries. With cache: ~1000 DB queries.
- **Cache invalidation:** When meetings_used increments (DB trigger on meeting DONE),
  `del cache:team:plan:{teamId}` is called by the worker. Cache stays fresh.
- **Why not check in the service?** Middleware separates cross-cutting concerns.
  Service stays focused on business logic. Middleware handles infrastructure concerns.

---

## 3. `teams.repository.ts` — Database Layer

### What It Does
**ONLY** Prisma queries. Zero business logic. Zero HTTP knowledge.
Returns raw domain objects or null. Never throws custom errors — lets Prisma errors bubble.

### Functions to Implement

**Team CRUD:**
```
findById(id)                  → Team | null
findBySlug(slug)              → Team | null (case-insensitive)
create(data)                  → Team
update(id, data)              → Team
updateSettings(id, settings)  → Team (merges JSONB, does not replace)
```

**Member Management:**
```
findMembers(teamId, filters)  → User[] (paginated, with commitment stats)
findMemberById(teamId, userId) → User | null (verifies team membership)
updateMemberRole(userId, role) → User
removeMember(userId)          → void (sets teamId=null, role='MEMBER')
```

**Invitation Management:**
```
findPendingInvite(teamId, email) → TeamInvitation | null
createInvitation(data)           → TeamInvitation
findInvitationByToken(tokenHash) → TeamInvitation | null
acceptInvitation(id)             → TeamInvitation
deleteExpiredInvitations(teamId) → count of deleted
```

**Usage:**
```
getUsage(teamId)              → { meetingsUsed, membersCount }
```

### Scalability Design
- All queries use indexed columns: `teamId`, `email`, `slug`
- `findMembers` uses OFFSET pagination (not cursor) — analytics pages need total count
- `updateSettings` uses Prisma's `update` with merge logic for JSONB
- `findPendingInvite` uses partial index on `invitations WHERE accepted_at IS NULL`

---

## 4. `teams.service.ts` — Business Logic Layer

### What It Does
All business logic, orchestration, cache invalidation, side effects.
Calls repository, cache, email, Socket.io. Throws typed AppError subclasses.

---

### Function 1: `createTeam(userId, data)`

#### Complete Logic Flow

```
INPUT:  userId, { name, slug? }

STEP 1 — Slug Processing:
  If slug provided:
    Normalize: lowercase, replace spaces with hyphens, strip non-alphanumeric-hyphen
    Validate: regex /^[a-z0-9][a-z0-9-]*[a-z0-9]$/ (no leading/trailing hyphens)
    Min length: 2, Max: 50
  If slug NOT provided:
    Auto-generate: slugify(name)
      Example: "TechFlow Engineering" → "techflow-engineering"
    Truncate to 50 chars if needed
    If auto-generated slug is taken: append random 4-char suffix
      Example: "techflow-engineering-a3f2"

STEP 2 — Uniqueness Check:
  repo.findBySlug(slug) → case-insensitive query
  If found: throw DuplicateError('SLUG_TAKEN', 'This slug is already in use',
              { suggestion: `${slug}-${randomSuffix}` })

STEP 3 — Check User Not Already in a Team:
  user = prisma.user.findUnique({ where: { id: userId } })
  if (user.teamId) → throw ForbiddenError('Already a member of a team')
  Note: In v2 multi-team support this check will be removed.
        For now: one team per user.

STEP 4 — Atomic Transaction:
  prisma.$transaction([
    createTeam: { id: cuid2(), name, slug, plan: 'FREE', settings: {} }
    updateUser:  { teamId: team.id, role: 'OWNER', onboardingCompleted: false }
    createNotifPreference: { userId, preferences: DEFAULT_PREFERENCES }
      → Creates default notification preferences for the owner
  ])

STEP 5 — Cache Invalidation:
  redis.del(`cache:user:${userId}`)
    → Next /auth/me call will fetch fresh user with teamId set

STEP 6 — Audit Log (usage event):
  prisma.usageEvent.create({ teamId, type: 'TEAM_CREATED', metadata: { userId } })

STEP 7 — Return:
  { id, name, slug, plan: 'FREE', createdAt }
  Note: DO NOT return settings or internal fields in create response.

OUTPUT: CreatedTeamResponse
```

#### Security Considerations
- Slug auto-generation uses `slugify` utility — never trust client slug as-is
- Even if client sends slug, always normalize before uniqueness check
- Transaction atomicity: team creation and user update succeed together or fail together
- If user already has a teamId, prevent creating second team (v1 business rule)

---

### Function 2: `getTeamWithMembers(teamId)`

#### Complete Logic Flow

```
INPUT: teamId (from req.teamId — already verified by injectTenant middleware)

STEP 1 — Cache Check:
  cacheKey = `cache:team:detail:${teamId}`
  cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

STEP 2 — Database Fetch:
  team = prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        where:   { deletedAt: null },
        select:  { id, name, email, avatarUrl, role, commitmentScore,
                   createdAt, lastActiveAt, lastLoginAt }
        orderBy: ROLE_ORDER (OWNER first, then ADMIN, MANAGER, MEMBER)
      },
      _count: { select: { meetings: true } }
    }
  })
  if (!team) throw NotFoundError('Team')

STEP 3 — Build Usage Object:
  limits = PLAN_LIMITS[team.plan]
  usage = {
    meetingsUsed:     team.meetingsUsed,
    meetingsLimit:    limits.meetings,     // -1 if unlimited
    meetingsPercent:  limits.meetings === -1 ? 0 : round(used/limit * 100),
    membersCount:     team.members.length,
    membersLimit:     limits.members,
    billingCycleEnd:  team.billingCycleEnd
  }

STEP 4 — Sanitize Members:
  Never return passwordHash, totp secrets, locked status, failedAttempts
  Return: id, name, email, avatarUrl, role, commitmentScore, joinedAt, lastActiveAt

STEP 5 — Cache Result:
  redis.setex(cacheKey, 300, JSON.stringify(result))  // 5-min TTL

STEP 6 — Return:
  { ...team, usage, members (sanitized) }

OUTPUT: TeamDetailResponse
```

#### Performance Design
- **5-min cache TTL:** Team data changes rarely (members join/leave infrequently).
  Cache prevents hammering DB on every dashboard load.
- **Role ordering in DB:** Done in SQL (not in application layer) — faster.
- **Sanitize in service:** Never expose sensitive user fields even in internal API.

---

### Function 3: `updateTeamSettings(teamId, requesterId, data)`

#### Complete Logic Flow

```
INPUT: teamId, requesterId, { name?, settings? }

STEP 1 — Fetch current settings:
  team = repo.findById(teamId)
  if (!team) throw NotFoundError('Team')

STEP 2 — Merge settings (JSONB merge, not replace):
  updatedSettings = { ...team.settings, ...data.settings }
  WHY: If client sends { weeklyDigestEnabled: true }, don't overwrite
       all other settings. Only update the provided keys.
  Validate individual setting values:
    defaultTimezone: must be valid IANA timezone string
    weeklyDigestDay: must be 'MONDAY' | 'FRIDAY' | 'SUNDAY'
    weeklyDigestEnabled: must be boolean

STEP 3 — Update:
  repo.update(teamId, {
    name:     data.name     ?? team.name,
    settings: updatedSettings,
    updatedAt: new Date()
  })

STEP 4 — Cache Invalidation:
  redis.del(`cache:team:detail:${teamId}`)

STEP 5 — Return updated team

OUTPUT: UpdatedTeamResponse
```

---

### Function 4: `inviteMembers(teamId, inviterId, { emails, role })`

#### Complete Logic Flow

```
INPUT: teamId, inviterId, { emails: string[], role: UserRole }

STEP 1 — Validate Email Array:
  emails.length must be between 1 and 20
  Each email: valid format, lowercase, deduplicate duplicates

STEP 2 — Plan Member Limit Check:
  team = repo.findById(teamId) with member count
  currentCount = team.members.length
  pendingCount = repo.countPendingInvitations(teamId)
  projectedTotal = currentCount + pendingCount + emails.length
  limit = PLAN_LIMITS[team.plan].members
  if (limit !== -1 && projectedTotal > limit):
    throw PlanLimitError('Members', currentCount, limit, upgradeUrl)

STEP 3 — For Each Email:
  results = { invited: [], alreadyMember: [], alreadyInvited: [], failed: [] }

  For each email:
    a. CHECK IF ALREADY MEMBER:
         existing = prisma.user.findFirst({
           where: { email, teamId }
         })
         if (existing) → results.alreadyMember.push(email); continue

    b. CHECK IF PENDING INVITE EXISTS:
         pending = repo.findPendingInvite(teamId, email)
         if (pending && pending.expiresAt > now) → results.alreadyInvited.push(email); continue

    c. GENERATE INVITE TOKEN:
         rawToken  = crypto.randomBytes(32).toString('hex')  // 64-char hex
         tokenHash = sha256(rawToken)
         expiresAt = addDays(now, 7)

    d. CREATE INVITATION RECORD:
         teamInvitation = repo.createInvitation({
           teamId, invitedEmail: email, invitedRole: role,
           invitedById: inviterId, tokenHash, expiresAt
         })

    e. SEND INVITE EMAIL (async — don't block):
         emailService.sendTeamInvite({
           to:      email,
           teamName: team.name,
           inviterName: inviter.name,
           joinUrl: `${FRONTEND_URL}/invite/${rawToken}`,
           role,
           expiresAt
         }).catch(err => {
           logger.error({ err, email }, 'Failed to send invite email')
           results.failed.push(email)
           // Don't throw — email failure is non-fatal
         })

    f. results.invited.push(email)

STEP 4 — Build share link (for manual sharing):
  inviteLink = `${FRONTEND_URL}/invite/${teamId}-${shortCode}`
    Note: This is a general team invite link (Day 21 feature — scaffold today)

STEP 5 — Return results

OUTPUT: InviteResult { invited, alreadyMember, alreadyInvited, failed, inviteLink }
```

#### Security Design
- `rawToken` never stored — only `sha256(rawToken)` in DB
- `rawToken` lives only in the email URL, never in any response body
- Email sending is async and non-blocking — fire and forget with error logging
- Re-invitation: if pending invite exists and not expired → skip (no double-send)
- Token: 32 random bytes = 256 bits entropy — practically unguessable

---

### Function 5: `acceptInvitation(token, userId)`

#### Complete Logic Flow

```
INPUT: token (from URL), userId (from JWT — user must be logged in)

STEP 1 — Token Lookup:
  tokenHash = sha256(token)
  invitation = repo.findInvitationByToken(tokenHash)
  if (!invitation) throw AppError('TOKEN_INVALID', 400, 'Invalid or expired invite link')

STEP 2 — Expiry Check:
  if (invitation.expiresAt < now):
    throw AppError('TOKEN_EXPIRED', 410, 'This invite link has expired')

STEP 3 — Already Accepted Check:
  if (invitation.acceptedAt):
    throw AppError('TOKEN_USED', 409, 'This invite link has already been used')

STEP 4 — User Already in Different Team:
  user = prisma.user.findUnique({ where: { id: userId } })
  if (user.teamId && user.teamId !== invitation.teamId):
    throw ForbiddenError('You are already a member of a different team')

STEP 5 — Atomic Transaction:
  prisma.$transaction([
    updateUser:       { teamId: invitation.teamId, role: invitation.invitedRole }
    markAccepted:     invitation.update({ acceptedAt: now, acceptedById: userId })
    createNotifPrefs: { userId, preferences: DEFAULT_PREFERENCES }
  ])

STEP 6 — Emit Socket.io event to team:
  io.to(`team:${invitation.teamId}`).emit('member:joined', {
    user: { id, name, email, avatarUrl, role }
  })

STEP 7 — Cache Invalidation:
  redis.del(`cache:team:detail:${invitation.teamId}`)
  redis.del(`cache:user:${userId}`)

STEP 8 — Return:
  { teamId, teamName, role, message: "You've joined the team!" }
```

---

### Function 6: `changeMemberRole(teamId, requesterId, targetUserId, newRole)`

#### Complete Logic Flow

```
INPUT: teamId, requesterId, targetUserId, newRole

STEP 1 — Fetch target user:
  target = repo.findMemberById(teamId, targetUserId)
  if (!target) throw NotFoundError('Team member', targetUserId)

STEP 2 — Business Rule Guards:
  a. CANNOT change OWNER role:
       if (target.role === 'OWNER') throw ForbiddenError('Cannot change OWNER role')
  b. CANNOT assign OWNER role (must use transfer ownership — separate endpoint):
       if (newRole === 'OWNER') throw ForbiddenError('Cannot assign OWNER role directly')
  c. CANNOT change own role:
       if (targetUserId === requesterId) throw ForbiddenError('Cannot change your own role')
  d. CANNOT assign role higher than own:
       requesterLevel = ROLE_LEVELS[requester.role]  // OWNER=4, ADMIN=3, MANAGER=2, MEMBER=1
       targetNewLevel = ROLE_LEVELS[newRole]
       if (targetNewLevel >= requesterLevel):
         throw ForbiddenError('Cannot assign a role equal or higher than your own')

STEP 3 — Update:
  repo.updateMemberRole(targetUserId, newRole)

STEP 4 — Cache Invalidation:
  redis.del(`cache:user:${targetUserId}`)
  redis.del(`cache:team:members:${teamId}`)
  redis.del(`cache:team:detail:${teamId}`)

STEP 5 — Socket.io notification:
  io.to(`user:${targetUserId}`).emit('my:role_updated', {
    newRole,
    teamId,
    message: `Your role has been updated to ${newRole}`
  })

STEP 6 — Return:
  { userId: targetUserId, name, role: newRole, updatedAt }
```

#### Security: Why Rule D Matters
An ADMIN cannot promote another user to ADMIN or OWNER.
Only the OWNER can assign ADMIN role. This prevents privilege escalation:
a rogue ADMIN cannot create more ADMINs without OWNER consent.

---

### Function 7: `removeMember(teamId, requesterId, targetUserId)`

#### Complete Logic Flow

```
INPUT: teamId, requesterId, targetUserId

STEP 1 — Fetch target:
  target = repo.findMemberById(teamId, targetUserId)
  if (!target) throw NotFoundError('Team member', targetUserId)

STEP 2 — Business Rule Guards:
  a. Cannot remove OWNER:
       if (target.role === 'OWNER') throw ForbiddenError('Cannot remove team owner')
  b. Cannot remove yourself (use /leave endpoint — coming v2):
       if (targetUserId === requesterId) throw ForbiddenError('Cannot remove yourself')
  c. Cannot remove someone with higher role:
       if (ROLE_LEVELS[target.role] >= ROLE_LEVELS[requester.role]):
         throw ForbiddenError('Cannot remove a member with equal or higher role')

STEP 3 — Atomic Transaction:
  prisma.$transaction([
    updateUser: {
      teamId: null,
      role:   'MEMBER',  // Reset to default role for when they join another team
      // DO NOT clear: name, email, passwordHash, profile data
    }
    deleteRefreshTokens: prisma.refreshToken.deleteMany({
      where: { userId: targetUserId }
      // Forces immediate logout from all devices
    })
    // NOTE: Commitments and action items are NOT deleted.
    // They remain with ownerId set — historical data preserved for team analytics.
    // UI will show "Former member" label.
  ])

STEP 4 — Cache Invalidation:
  redis.del(`cache:user:${targetUserId}`)
  redis.del(`cache:team:detail:${teamId}`)
  redis.del(`cache:team:members:${teamId}`)

STEP 5 — Socket.io events:
  io.to(`user:${targetUserId}`).emit('system:removed_from_team', {
    teamId,
    message: 'You have been removed from the team'
    // This triggers logout/redirect on the client side
  })
  io.to(`team:${teamId}`).emit('member:removed', {
    userId: targetUserId
    // Dashboard updates member list in real-time
  })

STEP 6 — Audit Log:
  prisma.usageEvent.create({
    teamId, type: 'MEMBER_REMOVED',
    metadata: { removedBy: requesterId, removedUser: targetUserId }
  })

STEP 7 — Return:
  { message: 'Member removed', userId: targetUserId }
```

#### Why Refresh Tokens Are Deleted
Deleting refresh tokens forces the removed user's sessions to expire.
Their current access token (15-min TTL) will expire naturally.
After that, their `POST /auth/refresh` will fail → redirected to `/login`.
This ensures no data access after removal — security enforced at session level.

---

## 5. `team-health.service.ts` — Health Score Algorithm

### What It Does
Computes a single 0–100 score representing team accountability health.
Used on: team dashboard, analytics page, weekly digest email.

### Score Formula

```
teamHealthScore = (fulfillmentRate × 0.6) + (avgMemberScore × 0.3) + (onTimeRate × 0.1)

Where:
  fulfillmentRate = fulfilled / (fulfilled + missed) × 100
                   (last 30 days, confidence >= 0.5)

  avgMemberScore  = average of all member commitmentScore values
                   (denormalized on users table — updated after every status change)

  onTimeRate      = fulfilled_before_deadline / total_fulfilled × 100
                   (last 30 days)

Trend calculation:
  Compare this 14 days vs prior 14 days
  If diff > 5 points  → 'improving'
  If diff < -5 points → 'declining'
  Else                → 'stable'
```

### Why These Weights
- **fulfillmentRate (60%):** Primary indicator — are people keeping promises?
- **avgMemberScore (30%):** Individual accountability — rewards consistent performers
- **onTimeRate (10%):** Quality indicator — fulfilled ON TIME is better than fulfilled late

### Caching Strategy
- Result cached: `cache:team:health:{teamId}` TTL 300 seconds (5 min)
- Invalidated: when any commitment changes status in this team
- Pre-computed for weekly digest (run during Sunday midnight cron)

---

## 6. `teams.validator.ts` — Zod Schemas

### What It Does
All request body validation schemas for teams endpoints.
Shared between: route middleware and OpenAPI spec generation.

### Schemas to Define

**createTeamSchema:**
```
name: string, min:2, max:100, trim
slug: string (optional), min:2, max:50, regex: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/ or auto-generated
```

**updateTeamSchema:**
```
name: string (optional), min:2, max:100
settings: object (optional):
  defaultTimezone: string (optional), must be valid IANA timezone
  weeklyDigestEnabled: boolean (optional)
  weeklyDigestDay: 'MONDAY' | 'FRIDAY' | 'SUNDAY' (optional)
```

**inviteMembersSchema:**
```
emails: array of email strings, min:1 item, max:20 items, each email.email()
role: UserRole enum, optional, default: 'MEMBER'
      only 'MEMBER' | 'MANAGER' | 'ADMIN' allowed — cannot invite as OWNER
```

**changeMemberRoleSchema:**
```
role: 'MEMBER' | 'MANAGER' | 'ADMIN' (OWNER excluded — use transferOwnership)
```

---

## 7. `teams.controller.ts` — HTTP Layer

### What It Does
**ONLY** reads `req` objects, calls service functions, writes `res`.
Zero business logic. Zero DB knowledge. Zero cache knowledge.

### Pattern for Every Controller Function

```
export const createTeam = asyncHandler(async (req, res) => {
  const result = await teamsService.createTeam(req.user.id, req.body)
  res.status(201).json(success(result))
})
```

Every function is exactly this pattern. Any complexity lives in the service layer.

### Controller Functions
```
createTeam          → POST /teams
getMyTeam           → GET /teams/me
updateMyTeam        → PATCH /teams/me
inviteMembers       → POST /teams/me/invite
listMembers         → GET /teams/me/members
changeMemberRole    → PATCH /teams/me/members/:userId/role
removeMember        → DELETE /teams/me/members/:userId
acceptInvitation    → POST /teams/invite/:token (called from frontend invite page)
checkSlugAvailable  → GET /teams/check-slug?slug=xxx (for onboarding form)
```

---

## 8. `teams.routes.ts` — Route Definitions

### Route Architecture

```
All team routes: /api/v1/teams/...
Middleware chain (in exact order):

  Public routes (no auth):
    GET  /check-slug    → ipRateLimiter, validate(checkSlugSchema)

  Protected routes (need auth):
    POST /              → requireAuth, validate(createTeamSchema)
    GET  /me            → requireAuth, injectTenant
    PATCH /me           → requireAuth, injectTenant, requireRole('ADMIN')
    POST /me/invite     → requireAuth, injectTenant, requireRole('ADMIN'), validate(inviteSchema)
    GET  /me/members    → requireAuth, injectTenant, validate(membersQuerySchema)
    PATCH /me/members/:userId/role  → requireAuth, injectTenant, requireRole('ADMIN')
    DELETE /me/members/:userId      → requireAuth, injectTenant, requireRole('ADMIN')
    POST /invite/:token             → requireAuth (user must be logged in to accept)
```

### Why Middleware Order Matters
1. `requireAuth` first — verify token before anything else
2. `injectTenant` second — sets req.teamId from JWT (used by all subsequent middleware)
3. `requireRole` third — checks role using req.user (set by requireAuth)
4. `validate` last — only parse body after auth is confirmed (saves CPU on rejected requests)

---

## 9. Security Design

### Multi-Layer Tenant Isolation

```
LAYER 1 — Application:
  Every service function receives teamId and verifies resource.teamId === teamId
  Never trust client-provided teamId — always use req.teamId from JWT

LAYER 2 — Repository:
  Every Prisma query includes WHERE teamId = teamId
  Prisma middleware (from Day 11) auto-injects teamId on all queries

LAYER 3 — Database (RLS):
  PostgreSQL Row-Level Security policies (defined in Day 11 schema)
  Catches any bug in layers 1 or 2

WHY THREE LAYERS?
  Defense in depth — a bug in one layer doesn't expose data.
  At scale (multiple engineers), someone will forget teamId check.
  RLS at DB layer is the safety net.
```

### Slug Security
```
Problem: User can try "vocaply", "admin", "api" as team slugs
Solution:
  RESERVED_SLUGS = ['api', 'admin', 'app', 'www', 'mail', 'dev',
                    'staging', 'dashboard', 'login', 'register',
                    'vocaply', 'support', 'help', 'blog', 'pricing']
  Before uniqueness check: if RESERVED_SLUGS.includes(slug) → throw DuplicateError

Problem: SQL injection via slug parameter
Solution: Prisma parameterized queries — never raw SQL for slug lookup
```

### Role Escalation Prevention
```
Rule: A user can only assign roles BELOW their own level.
  ADMIN  (level 3) can assign: MANAGER (2), MEMBER (1)
  OWNER  (level 4) can assign: ADMIN (3), MANAGER (2), MEMBER (1)
  MANAGER/MEMBER: Cannot change roles at all (requireRole('ADMIN') blocks them)

Why this matters: Without this rule, an ADMIN could create infinite ADMINs.
```

### Invitation Token Security
```
Token generation: crypto.randomBytes(32) → 256 bits entropy
Storage:          sha256(token) only — original never stored
Transmission:     URL only (email link), never in API response body
Expiry:           7 days (hard limit — not extendable)
One-time use:     acceptedAt set on first use → second use rejected immediately
```

---

## 10. Performance Design

### Cache Strategy (Redis)

```
KEY                              TTL      INVALIDATED ON
cache:team:detail:{teamId}       300s     member join/leave, role change, settings update
cache:team:members:{teamId}      300s     member join/leave, role change
cache:team:plan:{teamId}         3600s    plan upgrade/downgrade, meeting processed
cache:user:{userId}              300s     profile update, role change, team change

PATTERN: Cache-Aside
  Read:  Check Redis → miss → query DB → write Redis → return
  Write: Update DB → delete Redis key (NOT update Redis)
         WHY delete not update: prevents stale data from race conditions

CACHE WARMING:
  After a cache miss and DB read, immediately write to cache.
  This "warm" pattern means the second request always hits cache.
```

### Database Index Strategy for Teams Queries

```
Key queries and their index usage:

GET /teams/me:
  WHERE id = $teamId → PRIMARY KEY (instant)
  JOIN users WHERE teamId = $teamId → idx_users_team_id
  ORDER BY role → idx_users_team_role (composite index: teamId + role)

GET /teams/me/members?role=MANAGER&search=ali:
  WHERE teamId = $teamId AND role = 'MANAGER' → idx_users_team_role
  AND (name ILIKE '%ali%' OR email ILIKE '%ali%')
  Note: ILIKE is not index-friendly for arbitrary searches.
  At scale (500+ members): add pg_trgm GIN index on name+email.
  For now: acceptable for < 100 members per team.

GET /teams/check-slug?slug=xxx:
  WHERE slug = $slug → UNIQUE INDEX idx_teams_slug (instant, case-insensitive)
  Note: slug stored lowercase always — no citext needed.
```

### Pagination Strategy for Member List

```
WHY OFFSET (not cursor) for members:
  Members list is an admin page — total count is needed for UI ("5 of 25 members")
  Members list is small (max 60 on BUSINESS plan, 25 on GROWTH)
  Cursor pagination's advantage (stability on inserts) doesn't matter for small sets
  OFFSET is simpler and total count is worth it at this scale

Implementation:
  Default: page=1, limit=20
  Max limit: 100 (enforced by parseOffsetParams utility)
  Total: COUNT(*) subquery (acceptable at small member counts)
```

---

## 11. Error Handling Strategy

### Expected Errors and Codes

```
OPERATION           ERROR CODE            HTTP    CONDITION
create team:        SLUG_TAKEN            409     Slug already in use
create team:        ALREADY_IN_TEAM       403     User already has a teamId
invite members:     PLAN_LIMIT            402     Member count would exceed plan limit
invite members:     VALIDATION_ERROR      422     Invalid email format in array
change role:        CANNOT_CHANGE_OWNER   403     Target is OWNER
change role:        CANNOT_CHANGE_SELF    403     Changing own role
change role:        ROLE_ESCALATION       403     Assigning role >= own level
remove member:      CANNOT_REMOVE_OWNER   403     Target is OWNER
remove member:      CANNOT_REMOVE_SELF    403     Removing yourself
accept invite:      TOKEN_INVALID         400     Token not found in DB
accept invite:      TOKEN_EXPIRED         410     Invitation expired
accept invite:      TOKEN_USED            409     Already accepted
accept invite:      WRONG_TEAM            403     Already in a different team
get/update/list:    NOT_FOUND             404     Team not found
get/update/list:    FORBIDDEN             403     No team membership (injectTenant fails)
```

### Error Response Shape (consistent across all endpoints)

```json
{
  "success": false,
  "error": {
    "code":    "SLUG_TAKEN",
    "message": "This slug is already in use",
    "details": {
      "suggestion": "techflow-engineering-a3f2"
    }
  }
}
```

---

## 12. Real-Time Events (Socket.io)

### Events Emitted Today

```
EVENT                 ROOM            PAYLOAD                   WHEN
member:joined         team:{teamId}   { user: UserSummary }     After invite accepted
member:removed        team:{teamId}   { userId: string }        After member removed
my:role_updated       user:{userId}   { newRole, teamId }       After role changed
system:removed_from_team  user:{id}   { teamId, message }       After member removed
```

### Why Socket.io for These Events
Team dashboard shows live member list. When a manager removes a member:
- **Dashboard** updates in real-time (no refresh needed)
- **Removed user** gets an event and is redirected to login

Without Socket.io: dashboard shows stale data until manual refresh.
At 1000+ concurrent users: real-time updates prevent "ghost member" display bugs.

---

## 13. Notification Side Effects

### Emails Sent Today

```
TRIGGER              EMAIL TEMPLATE    RECIPIENT
team invite sent     TeamInvite.tsx    invited email address
member removed       MemberRemoved.tsx removed member's email (optional, low priority)
```

### Email Service Pattern
Email sending is **always async and non-blocking**:
```
emailService.sendInvite(data).catch(err => {
  logger.error({ err }, 'Invite email failed')
  // Don't throw — email failure is not critical
  // Job can be retried, but invitation record is already created
})
```

This pattern prevents email provider outages from blocking API responses.

---

## 14. app.ts Integration

### New Routes to Register

```
After Day 16, app.ts registers:
  app.use('/api/v1/auth',   authRouter)    ← from Day 13-14
  app.use('/api/v1/teams',  teamsRouter)   ← NEW TODAY
```

### Middleware Execution Trace (POST /teams/me/invite)

```
incoming request
  → cors()
  → helmet()
  → express.json()
  → cookieParser()
  → requestLogger()           logs: POST /api/v1/teams/me/invite
  → ipRateLimiter()           checks: ratelimit:ip:{ip}
  → [route match: /api/v1/teams/me/invite]
  → requireAuth()             verifies JWT, sets req.user
  → injectTenant()            sets req.teamId from req.user.teamId
  → requireRole('ADMIN')      checks ROLE_LEVELS[req.user.role] >= ROLE_LEVELS['ADMIN']
  → validate(inviteSchema)    parses + validates req.body
  → teamsController.inviteMembers()
  → teamsService.inviteMembers()
  → teamsRepository.* + emailService.*
  → res.json(success(result))
  → requestLogger()           logs: 200 OK, 47ms
```

---

## 15. Testing Plan

### What to Test Manually (Postman/curl)

```
HAPPY PATH TESTS:
  1. Register user A → verify email → login
  2. POST /teams → 201 team created, user A is OWNER
  3. GET /teams/me → team + 1 member (A) + usage stats
  4. POST /teams/me/invite [userB@email.com] → 200 invited
  5. Check email inbox for invite link
  6. Register user B → verify email → GET /invite/:token → 200 joined
  7. GET /teams/me → 2 members (A: OWNER, B: MEMBER)
  8. PATCH /members/:userBId/role { role: 'MANAGER' } → 200
  9. GET /teams/me → B is now MANAGER
  10. DELETE /members/:userBId → 200
  11. GET /teams/me → 1 member (A only)

SECURITY TESTS:
  12. User B tries PATCH /members/:userId/role → 403 (not ADMIN)
  13. Change OWNER role → 403
  14. POST /teams as user who already has a team → 403
  15. Same invite link twice → 409 TOKEN_USED
  16. Invite link after 7 days (manually set expired) → 410 TOKEN_EXPIRED
  17. GET /teams/me with no teamId → 403 (injectTenant blocks)
  18. FREE plan: invite 4th member → 402 PLAN_LIMIT

PERFORMANCE TESTS:
  19. GET /teams/me twice quickly → second response in < 5ms (cache hit)
  20. After PATCH /teams/me/settings → GET /teams/me → settings updated (cache invalidated)
```

---

## Day 16 End-of-Day Checklist

```
CONFIGS:
  [ ] plans.config.ts: all 5 plans, -1 for unlimited
  [ ] PLAN_LIMITS exported type PlanType works in TypeScript

MIDDLEWARE:
  [ ] plan-limits.middleware: Redis cache hit on second call
  [ ] plan-limits.middleware: FREE plan → 6th meeting → 402 (will test Day 17)
  [ ] plan-limits.middleware: ENTERPRISE plan → always passes (-1 = unlimited)

REPOSITORY:
  [ ] All repository functions return correct types
  [ ] No business logic in repository files
  [ ] All queries use indexed columns (no full table scans)

SERVICE — CREATE TEAM:
  [ ] POST /teams → 201 with team object
  [ ] Creator role = OWNER in DB (check psql)
  [ ] Duplicate slug → 409 with suggestion in details
  [ ] Reserved slug 'admin' → 409
  [ ] Auto-slug from name: "TechFlow Eng" → "techflow-eng"
  [ ] User already in team → 403

SERVICE — GET TEAM:
  [ ] GET /teams/me → team + members + usage object
  [ ] Members sorted: OWNER first, then ADMIN, MANAGER, MEMBER
  [ ] Cache hit on second request (< 5ms response time)
  [ ] Cache invalidated after settings update

SERVICE — INVITE:
  [ ] POST /invite → invited: [], alreadyMember: [], alreadyInvited: []
  [ ] Invite email sent (check Resend dashboard)
  [ ] Token in DB: team_invitations table (check psql)
  [ ] Duplicate invite: shows in alreadyInvited[] not invited[]
  [ ] FREE plan 4th member → 402 PLAN_LIMIT

SERVICE — ACCEPT INVITE:
  [ ] POST /invite/:token → user.teamId set in DB
  [ ] Token.acceptedAt set (one-time use)
  [ ] Second use → 409 TOKEN_USED
  [ ] Socket.io: member:joined emitted to team room

SERVICE — ROLE CHANGE:
  [ ] PATCH role → 200, DB updated
  [ ] Change OWNER → 403 CANNOT_CHANGE_OWNER
  [ ] Change own role → 403 CANNOT_CHANGE_SELF
  [ ] MANAGER trying to promote to ADMIN → 403 ROLE_ESCALATION
  [ ] Socket.io: my:role_updated emitted to user's room

SERVICE — REMOVE MEMBER:
  [ ] DELETE member → 200, user.teamId = null in DB
  [ ] All refresh tokens deleted (force logout)
  [ ] Cannot remove OWNER → 403
  [ ] Cannot remove self → 403
  [ ] Socket.io: member:removed to team room
  [ ] Socket.io: system:removed_from_team to user's room

HEALTH SCORE:
  [ ] calculateTeamHealthScore() returns { score: 0-100, trend, fulfillmentRate }
  [ ] New team with no data → score returns sensible default (not NaN, not error)
  [ ] Cached for 5 minutes (Redis)
```

---

## Summary: What Gets Built on Day 16

```
BACKEND:
  7 REST API endpoints (fully functional, production-grade)
  1 plan limits middleware (Redis-cached quota enforcement)
  1 team-health algorithm (weighted scoring, trend detection)
  1 plans config (single source of truth for all plan limits)

SECURITY:
  Multi-layer tenant isolation (application + repository + RLS)
  Role escalation prevention (cannot assign role >= own level)
  Invite token security (256-bit entropy, SHA-256 stored, 7-day expiry)
  Member removal: forced logout via refresh token deletion
  Slug sanitization: reserved words blocked, always lowercase

PERFORMANCE:
  Redis caching: team detail (5 min TTL), plan limits (1 hour TTL)
  Cache-aside pattern with targeted invalidation (not TTL-based expiry)
  Indexed queries: teamId, role, slug — no full table scans
  Email sending: async, non-blocking, failure-tolerant

REAL-TIME:
  4 Socket.io events: member:joined, member:removed, my:role_updated,
                      system:removed_from_team

FOUNDATION FOR FUTURE DAYS:
  plan-limits.middleware reused on: POST /meetings (Day 17)
  team-health algorithm reused on: analytics dashboard (Day 21)
  inviteMembers logic reused by: onboarding step 3 (Day 20)
  acceptInvitation used by: invite page frontend (Day 20)
```

---

*Document: DAY-16-PLAN | Vocaply | Version 1.0 | June 2026*
*Full Scalable Industry-Level Build Plan — No Code, Pure Architecture*
*Covers: APIs · Business Logic · Security · Performance · Caching · Real-Time*
