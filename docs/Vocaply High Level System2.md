# Vocaply — High Level System Design
> Industry-Grade SaaS | AI Meeting Intelligence & Accountability Platform  
> Competing with Fireflies.ai · Otter.ai · Grain · Gong · Chorus  
> Version 1.0 | Document: HLD-001 | May 2026

---

## Table of Contents

1. [Executive Summary & Product Vision](#1-executive-summary--product-vision)
2. [Competitive Landscape & Differentiation](#2-competitive-landscape--differentiation)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Authentication & Identity System](#4-authentication--identity-system)
5. [Multi-Tenancy Architecture](#5-multi-tenancy-architecture)
6. [Meeting Intelligence Pipeline](#6-meeting-intelligence-pipeline)
7. [AI/ML Architecture](#7-aiml-architecture)
8. [Real-Time Communication Layer](#8-real-time-communication-layer)
9. [Commitment & Accountability Engine](#9-commitment--accountability-engine)
10. [Integration Architecture](#10-integration-architecture)
11. [Notification & Alert System](#11-notification--alert-system)
12. [Analytics & Reporting Engine](#12-analytics--reporting-engine)
13. [Billing & Subscription System](#13-billing--subscription-system)
14. [Data Architecture](#14-data-architecture)
15. [API Architecture](#15-api-architecture)
16. [Security Architecture](#16-security-architecture)
17. [Infrastructure & DevOps](#17-infrastructure--devops)
18. [Scalability & Performance](#18-scalability--performance)
19. [Observability & Monitoring](#19-observability--monitoring)
20. [Compliance & Privacy](#20-compliance--privacy)
21. [Disaster Recovery & Business Continuity](#21-disaster-recovery--business-continuity)
22. [System Capacity Estimates](#22-system-capacity-estimates)

---

## 1. Executive Summary & Product Vision

### What Is Vocaply

Vocaply is an AI-powered meeting intelligence and accountability SaaS platform. Unlike competitors that focus primarily on transcription and note-taking, Vocaply's core value proposition is **commitment tracking and team accountability** — the system automatically extracts every promise made in a meeting, tracks it across time, and enforces accountability through intelligent alerts, integrations, and analytics.

### Core Problem Statement

```
THE ACCOUNTABILITY GAP:
  Team standup — Monday 9AM:
    "I'll finish the login feature by Thursday."    ← Said. Forgotten by Wednesday.
    "The API docs will be done EOD Friday."         ← Said. Never delivered.
    "I'll fix the payment bug before the release."  ← Said. Released without fix.
  
  Manager's week after every standup:
    → Manual follow-up Slack messages: 2 hours
    → Re-reading meeting notes: 1 hour
    → Status update chasing: 1-2 hours
    Total: 4-5 hours/week per manager lost to manual accountability

  INDUSTRY DATA:
    70% of meeting action items are never completed on time
    Average manager spends 4.5 hours/week on manual follow-up
    Teams with structured accountability see 3x higher commitment rates
```

### Product Differentiators vs Competitors

| Feature | Vocaply | Fireflies.ai | Otter.ai | Grain |
|---|---|---|---|---|
| **Core Focus** | Accountability + AI | Transcription + Search | Notes + Collaboration | Video Clips + Highlights |
| **Commitment Tracking** | ✅ Core Feature | ❌ None | ❌ None | ❌ None |
| **Cross-Meeting Memory** | ✅ Full | ❌ None | ❌ None | ❌ None |
| **Commitment Scoring** | ✅ Per Member | ❌ None | ❌ None | ❌ None |
| **Auto Jira Tickets** | ✅ Per Meeting | ✅ Basic | ❌ None | ❌ None |
| **Manager Alerts** | ✅ Intelligent | ❌ None | ❌ None | ❌ None |
| **Team Analytics** | ✅ Deep | ✅ Basic | ❌ None | ❌ None |
| **Pricing Model** | Flat/Team | Per Seat | Per Seat | Per Seat |
| **AI Engine** | Claude (Anthropic) | Proprietary | Proprietary | Proprietary |

---

## 2. Competitive Landscape & Differentiation

### Market Positioning

```
                    HIGH ACCOUNTABILITY FOCUS
                              │
                              │
             Vocaply ◄────────┤
                              │
                              │
LOW INTELLIGENCE ─────────────┼───────────────── HIGH INTELLIGENCE
                              │
                              │    ◄── Gong / Chorus (Enterprise Sales)
                              │    ◄── Grain (Video Clips)
                              │    ◄── Fireflies (Search + Transcription)
                              │    ◄── Otter.ai (Notes + Collaboration)
                              │
                    LOW ACCOUNTABILITY FOCUS
```

### Why Vocaply Wins

1. **Accountability is the pain, not transcription.** Every team already has Slack, Notion, Jira. Nobody has automatic commitment tracking.

2. **Cross-meeting memory.** No competitor connects "Ahmed promised X on Monday" to "Ahmed mentioned X was done on Thursday." Vocaply resolves this automatically.

3. **Flat team pricing.** Per-seat pricing creates anxiety about adding team members. Flat pricing removes the barrier — the whole team uses it freely.

4. **Claude AI.** Anthropic's Claude outperforms GPT-4 on nuanced language understanding, making extraction more accurate, especially for ambiguous language like "I'll try to..." vs "I'll definitely...".

---

## 3. System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               VOCAPLY PLATFORM                                      │
│                                                                                     │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────────────┐│
│  │   CDN / Edge    │    │                  CLIENT LAYER                           ││
│  │  (Cloudflare)   │    │   Next.js 14 Web App + PWA     Mobile (React Native)   ││
│  │                 │    │   Dashboard · Landing · Onboarding                      ││
│  │  Static Assets  │    └──────────────────────┬──────────────────────────────────┘│
│  │  OG Images      │                           │                                   │
│  └─────────────────┘                     HTTPS / WSS                               │
│                                               │                                   │
│  ┌────────────────────────────────────────────▼──────────────────────────────────┐ │
│  │                           API GATEWAY / LOAD BALANCER                         │ │
│  │              Nginx · Rate Limiting · SSL Termination · Routing                │ │
│  └───────────────┬────────────────────┬───────────────────────┬───────────────────┘ │
│                  │                    │                       │                     │
│       ┌──────────▼──────────┐ ┌───────▼──────────┐ ┌────────▼──────────┐         │
│       │   Node.js API       │ │  AI Pipeline     │ │   WebSocket       │         │
│       │   (Express)         │ │  (Python FastAPI)│ │   Server          │         │
│       │                     │ │                  │ │   (Socket.io)     │         │
│       │  Auth · Teams       │ │  Claude AI       │ │                   │         │
│       │  Meetings · Billing │ │  Extraction      │ │  Real-time events │         │
│       │  Commitments · APIs │ │  Resolution      │ │  Commitment alerts│         │
│       └──────────┬──────────┘ └───────┬──────────┘ └────────┬──────────┘         │
│                  │                    │                       │                     │
│  ┌───────────────▼────────────────────▼───────────────────────▼───────────────────┐│
│  │                            MESSAGE QUEUE (Redis / Bull)                         ││
│  │   transcribe.queue · extract.queue · notify.queue · integrate.queue            ││
│  │   deadline.queue · calendar-sync.queue · integrate.queue                       ││
│  └───────────────┬────────────────────────────────────────────────────────────────┘│
│                  │                                                                  │
│  ┌───────────────▼────────────────────────────────────────────────────────────────┐│
│  │                            DATA LAYER                                           ││
│  │                                                                                 ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  ││
│  │  │  PostgreSQL  │  │   MongoDB    │  │    Redis     │  │  S3 / Object     │  ││
│  │  │  (Supabase)  │  │   (Atlas)    │  │  (Upstash)   │  │  Storage         │  ││
│  │  │              │  │              │  │              │  │                  │  ││
│  │  │ Users, Teams │  │ Transcripts  │  │ Queues       │  │ Audio/Video      │  ││
│  │  │ Commitments  │  │ AI Output    │  │ Cache        │  │ Exports          │  ││
│  │  │ Billing      │  │ Full-text    │  │ Sessions     │  │ Attachments      │  ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘  ││
│  └────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│  ┌────────────────────────────────────────────────────────────────────────────────┐│
│  │                        EXTERNAL INTEGRATIONS                                    ││
│  │  Recall.ai · Google Meet · Zoom · MS Teams · Webex                             ││
│  │  Jira · Linear · Notion · Slack · Google Calendar · Outlook                    ││
│  │  Stripe · Anthropic Claude · Resend (Email) · PostHog · Sentry                 ││
│  └────────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Service Responsibility Matrix

| Service | Responsibility | Technology | Scaling |
|---|---|---|---|
| **Next.js Web** | UI, SSR, BFF layer | Next.js 14, React | Vercel Edge |
| **Node.js API** | Business logic, CRUD, Auth | Express, TypeScript | Horizontal |
| **Python FastAPI** | AI extraction, NLP, Resolution | FastAPI, Claude SDK | Horizontal |
| **Socket.io** | Real-time events, presence | Socket.io + Redis adapter | Horizontal |
| **Bull Workers** | Async job processing | Bull, Redis | Horizontal |
| **PostgreSQL** | Primary relational data | Supabase / AWS RDS | Read replicas |
| **MongoDB** | Transcript storage, search | Atlas | Sharding |
| **Redis** | Cache, queues, sessions | Upstash / ElastiCache | Cluster |
| **S3** | File storage, exports | AWS S3 / Cloudflare R2 | Unlimited |

---

## 4. Authentication & Identity System

### Authentication Architecture Overview

Vocaply implements a layered, multi-protocol identity system supporting every enterprise authentication pattern. This is not a bolt-on — authentication is designed from day one to support SMB teams all the way to Fortune 500 enterprise customers.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    IDENTITY & AUTH LAYER                            │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │  Email/Pass  │  │   OAuth 2.0 │  │  SSO / SAML │  │  API Key │ │
│  │  (Custom)    │  │  (Social)   │  │  (Enterprise│  │  (M2M)   │ │
│  │             │  │             │  │   SAML 2.0) │  │          │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────┬─────┘ │
│         │                │                │               │       │
│         └────────────────┴────────────────┴───────────────┘       │
│                                  │                                  │
│                    ┌─────────────▼──────────────┐                  │
│                    │     Identity Resolver       │                  │
│                    │  (Normalize all auth paths) │                  │
│                    └─────────────┬──────────────┘                  │
│                                  │                                  │
│         ┌────────────────────────▼─────────────────────────┐       │
│         │              Token Issuer                         │       │
│         │   Access Token (JWT 15min) + Refresh Token (30d)  │       │
│         └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 Email + Password Authentication

**Registration Flow:**
```
1. User submits { name, email, password }
2. Zod validation: password must contain uppercase + number + special char
3. Check email uniqueness → 409 if duplicate
4. bcrypt.hash(password, 12) — 12 rounds (OWASP recommended minimum)
5. Create user record (emailVerified: false)
6. Generate: verificationToken = crypto.randomBytes(32).toString('hex')
7. Store in DB: SHA-256(verificationToken) — NEVER store plain token
8. Send verification email (Resend) with link containing original token
9. Return: { message: "Check your email" } — NO user data in response

Password Requirements:
  - Minimum 8 characters, maximum 128 characters
  - At least one uppercase letter
  - At least one number
  - At least one special character (!@#$%^&*)
  - Checked both client-side (UX) and server-side (security)
  - Breached password check via HaveIBeenPwned API (planned v2)
```

**Login Flow with Brute Force Protection:**
```
1. Receive { email, password }
2. Find user by email
   → Not found: bcrypt.compare(password, FAKE_HASH) [prevent timing attack]
   → Return IDENTICAL error as wrong password (never reveal if email exists)
3. Check: user.lockedUntil > NOW() → 429 with minutes remaining
4. Check: user.emailVerified === false → 403 EMAIL_NOT_VERIFIED
5. Check: user.passwordHash is null → 401 (OAuth-only account)
6. bcrypt.compare(password, user.passwordHash)
   → Wrong: increment failedAttempts
            if failedAttempts >= 5: lockedUntil = NOW() + 15 minutes
            Return 401 INVALID_CREDENTIALS
7. Correct: reset failedAttempts, update lastLoginAt
8. Generate accessToken (JWT, 15min) + refreshToken (32 random bytes)
9. Store SHA-256(refreshToken) in refresh_tokens table
10. Set refreshToken in HttpOnly cookie (path: /auth/refresh only)
11. Return: { accessToken, user } in body
```

**JWT Token Design:**
```json
{
  "iss": "vocaply.com",
  "aud": "vocaply-api",
  "sub": "usr_clx01abc",
  "teamId": "team_clx02xyz",
  "role": "MANAGER",
  "email": "ali@techflow.com",
  "plan": "GROWTH",
  "iat": 1716900000,
  "exp": 1716900900
}
```

**Refresh Token Rotation:**
```
Token Rotation Design (prevents theft detection):
  1. Client sends HttpOnly cookie → server gets refresh token
  2. SHA-256(received_token) → lookup in DB
  3. DELETE old token → issue NEW access + refresh tokens
  4. New cookie set with rotated refresh token
  
  Theft Detection:
    If attacker uses stolen refresh token AFTER victim refreshed:
    → Token not found in DB (already rotated by victim)
    → 401 → attacker session dead
    → Victim's NEXT refresh: their token is still valid (they rotated first)
    
  Reuse Detection:
    If attacker uses stolen refresh token BEFORE victim refreshes:
    → Token found → issue new tokens → delete old
    → Victim tries to use old token → not found → LOGOUT ALL SESSIONS
    → Security alert sent to user email
```

### 4.2 OAuth 2.0 — Social Login

**Supported Providers:**

| Provider | Use Case | Scopes Requested |
|---|---|---|
| **Google** | Primary social login, Calendar integration | `openid email profile` + `calendar.readonly` (optional) |
| **GitHub** | Developer teams | `read:user user:email` |
| **Microsoft** | Enterprise teams, Teams integration | `openid email profile` + `Calendars.Read` (optional) |

**OAuth CSRF Protection (State Parameter):**
```
CSRF Attack Prevention:
  1. Server generates: state = crypto.randomBytes(32).toString('hex')
  2. Store in Redis: SET oauth:state:{state} "1" EX 600 (10 min TTL)
  3. Redirect to provider with ?state={state}
  4. Provider redirects back with ?code=...&state={state}
  5. Server validates: GET oauth:state:{state} → must exist
  6. DEL oauth:state:{state} (one-time use)
  7. If state missing/invalid → 400 CSRF_DETECTED → reject entire request
```

**Account Linking Logic:**
```
When OAuth callback received:
  CASE 1: googleId found in DB
    → Existing Google user → update lastLoginAt → issue tokens
  
  CASE 2: googleId not found, email matches existing user
    → Link Google to existing account → issue tokens
    → User gets both email+pass AND Google login going forward
  
  CASE 3: Neither googleId nor email found
    → Create new user (emailVerified: true — Google already verified it)
    → Redirect to /onboarding (no team yet)
  
  CASE 4: User denied OAuth consent
    → error=access_denied in callback params
    → Redirect to /login?error=oauth_denied
```

### 4.3 SSO — Enterprise Single Sign-On

**Supported Protocols:**

#### SAML 2.0 (Enterprise — Okta, Azure AD, Google Workspace, OneLogin)
```
SAML Flow (Service Provider Initiated):

  1. User visits vocaply.com/login
  2. User enters work email → Vocaply detects company domain
  3. Company has SAML configured → redirect to Identity Provider (IdP)
  4. IdP authenticates user (their own MFA, password policies)
  5. IdP posts SAML Assertion to vocaply.com/auth/saml/callback
  6. Vocaply verifies assertion signature using IdP's public certificate
  7. Extract: nameID (email), attributes (name, department, role hint)
  8. Create or update user → issue Vocaply JWT + refresh token
  9. Redirect to dashboard
  
SAML Assertion Signature Verification:
  - Only accept assertions signed with IdP's registered X.509 certificate
  - Verify: NotBefore + NotOnOrAfter (replay protection)
  - Verify: InResponseTo if SP-initiated (CSRF protection)
  - Verify: AudienceRestriction matches vocaply.com entity ID
  - Clock skew tolerance: ±2 minutes

SAML Metadata Exchange:
  Vocaply SP Metadata: https://vocaply.com/auth/saml/metadata
  Admin uploads IdP metadata or provides metadata URL
  Vocaply validates metadata signature before accepting
```

#### OIDC (OpenID Connect — For Modern Enterprise IdPs)
```
OIDC Flow:
  → Standard OAuth 2.0 code flow + ID Token (JWT) from IdP
  → Vocaply validates: iss, aud, exp, nonce (CSRF), at_hash
  → User info from /userinfo endpoint or ID token claims
  → Same account linking logic as OAuth above

Supported OIDC Providers:
  - Okta (both SAML and OIDC supported)
  - Azure Active Directory / Entra ID
  - Google Workspace (for domain-wide SSO)
  - Ping Identity
  - Auth0 (for enterprises using Auth0 as their IdP)
```

#### Just-in-Time (JIT) Provisioning
```
JIT Provisioning (Enterprise):
  When a new employee authenticates via SSO for the first time:
  1. User doesn't exist in Vocaply DB
  2. SAML/OIDC assertion contains user attributes
  3. Vocaply auto-creates user account with attributes from assertion
  4. Assigns to pre-configured team (based on company domain or attribute mapping)
  5. Assigns role based on IdP attribute (e.g., department = "Engineering" → MEMBER)
  6. Sends welcome email
  7. User lands in Vocaply dashboard — zero admin intervention needed

SCIM 2.0 (Planned — Enterprise Auto-Provisioning):
  - Okta / Azure push user creates, updates, deactivates to Vocaply
  - Vocaply SCIM endpoint: POST /scim/v2/Users
  - Deactivated in IdP → immediately revoked in Vocaply
  - Group sync: IdP group membership → Vocaply team membership
```

### 4.4 API Key Authentication (Machine-to-Machine)

```
API Key Design:
  Format:  vply_{env}_{32_bytes_base62}
  Example: vply_live_K8x2mQpR7nL4vJw3A9bX...
  
  Environment prefixes:
    vply_live_ → Production
    vply_test_ → Sandbox/staging
  
Storage Security:
  → Key shown ONCE at creation (never stored in plain)
  → DB stores: SHA-256(key) + last 4 chars (for display "...Jw3A")
  → Lookup: SHA-256(incomingKey) === storedHash
  → Timing-safe comparison (timingSafeEqual)

Scopes (Fine-Grained Permissions):
  meetings:read · meetings:write · meetings:bot
  commitments:read · commitments:write
  action_items:read · action_items:write · action_items:sync
  analytics:read
  team:read · team:write
  integrations:read · integrations:write
  billing:read
  webhooks:read · webhooks:write

API Key Use Cases:
  → CI/CD pipeline: schedule bots for automated demo meetings
  → Jira integration bot: create tickets from action items
  → Internal dashboards: read analytics without user session
  → Zapier/Make automations: trigger on commitment events
  → Custom internal tools: read team commitment data
```

### 4.5 Multi-Factor Authentication (MFA)

```
MFA Levels:

LEVEL 1 — TOTP (Time-Based One-Time Password):
  → Industry standard (RFC 6238)
  → Compatible: Google Authenticator, Authy, 1Password, Bitwarden
  → User scans QR code → registers TOTP secret (AES-256 encrypted in DB)
  → On login: verify TOTP code before issuing tokens
  → Backup codes: 10 single-use codes (bcrypt hashed in DB)

LEVEL 2 — WebAuthn / FIDO2 (Planned v2):
  → Hardware security keys: YubiKey, Titan Key
  → Device biometrics: Face ID, Touch ID, Windows Hello
  → Phishing-resistant: works only on vocaply.com (origin binding)
  → Enterprise-ready: replaces TOTP for high-security teams

MFA Enforcement Rules:
  → User-level: optional (each user enables for their account)
  → Team-level: admin can REQUIRE MFA for all team members
  → Enterprise/SSO: MFA enforced by IdP (Vocaply trusts IdP's MFA)
  → Risk-based: new device / new location → step-up MFA challenge

Session Security:
  → New device fingerprint detected → email alert sent
  → Login from unusual location → step-up MFA required
  → Concurrent sessions: visible in /settings/security
  → Remote session revocation: kill specific device sessions
```

### 4.6 Password Reset & Email Verification Flow

```
Password Reset:
  Security Design:
    → Reset token: crypto.randomBytes(32).toString('hex')
    → Stored: SHA-256(token) with 1 hour TTL (NOT 24 hours — security)
    → One-time use: marked as usedAt after consumption
    → After reset: ALL existing refresh tokens for that user invalidated
    → Rate limit: max 3 reset requests per hour per email
    → Response always 200 (never reveal if email exists in system)

Email Verification:
    → Token TTL: 24 hours (longer than reset — less urgent)
    → One-time use: deleted after successful verification
    → Resend rate limit: 1 per 60 seconds per email
    → After verification: auto-login (issue JWT + refresh token)
    → Unverified accounts: can login but see "verify email" prompt
    → Unverified after 7 days: soft reminder email
    → Unverified after 30 days: account cleanup (GDPR — no data collected)
```

### 4.7 Session Management Architecture

```
Session Store Design:
  Access Token:
    → Stored: Client memory ONLY (Zustand store, never localStorage/sessionStorage)
    → TTL: 15 minutes
    → Contains: userId, teamId, role, plan (enough to avoid DB lookup per request)
    → Auto-refresh: interceptor calls /auth/refresh when token is < 2 min from expiry
  
  Refresh Token:
    → Stored: DB (SHA-256 hash) + HttpOnly cookie (original)
    → Cookie flags: HttpOnly, Secure, SameSite=Strict, path=/auth/refresh
    → TTL: 30 days (sliding — renewed on every use)
    → One per device (fingerprinted by IP + user-agent)
  
  Active Sessions (visible to user):
    → /settings/security shows: Device, Browser, Location, Last Active
    → User can revoke any session (except current)
    → Admin can revoke all team member sessions (compliance)
  
  Session Limits:
    → No hard limit on simultaneous sessions (each device gets own token)
    → But: old tokens expire after 30 days of inactivity
    → Enterprise: admin can configure max concurrent sessions

  Redis Session Cache (Performance):
    → Cache frequent /auth/me lookups: SET cache:user:{userId} {userData} EX 300
    → Invalidated on: role change, plan change, team change, password change
    → Avoids DB hit on every API request for user info
```

### 4.8 Role-Based Access Control (RBAC)

```
Role Hierarchy:
  OWNER   (4) → Team creator. One per team. Cannot be changed or removed.
  ADMIN   (3) → Full team management including billing, integrations, member removal.
  MANAGER (2) → Can see all member data, modify any commitment, view all analytics.
  MEMBER  (1) → Can only manage own commitments and see team-level (non-personal) data.

Inheritance: Higher role includes all lower role permissions.

Attribute-Based Access Control (ABAC) Overlay:
  Fine-grained rules beyond simple role check:
    → MEMBER can update commitment IF commitment.ownerId === req.user.id
    → MANAGER+ can update ANY commitment in their team
    → ADMIN can invite/remove members IF their own role is not being downgraded
    → Nobody can change OWNER role (enforced at code level, not just middleware)

Enterprise RBAC (Planned):
  → Custom role creation (e.g., "Team Lead" with specific permissions)
  → Permission groups (e.g., "Can view analytics but not billing")
  → Delegated admin (one department head manages only their team)
  → Attribute-based: role grants differ by department/project/region
```

---

## 5. Multi-Tenancy Architecture

### Tenancy Model

Vocaply uses a **shared database, shared schema** multi-tenancy model. Every table that contains team-specific data has a `team_id` column. This provides:

- Lowest cost (shared infrastructure)
- Easiest maintenance (one schema)
- Sufficient isolation for B2B SaaS
- Row-Level Security (RLS) as backup isolation layer

```
TENANCY ISOLATION LAYERS (Defense in Depth):

Layer 1 — Application Layer (Primary):
  Every API call validates: resource.teamId === req.user.teamId
  No cross-team data access possible through normal code paths

Layer 2 — ORM Layer (Secondary):
  Prisma middleware auto-injects teamId on every query:
  prisma.$use(async (params, next) => {
    const TENANT_TABLES = ['Meeting', 'Commitment', 'ActionItem', ...]
    if (TENANT_TABLES.includes(params.model)) {
      if (['findMany', 'findFirst'].includes(params.action)) {
        params.args.where = { ...params.args.where, teamId: currentTeamId }
      }
    }
    return next(params)
  })

Layer 3 — Database Layer (Tertiary — RLS):
  ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
  CREATE POLICY team_isolation ON meetings
    FOR ALL USING (team_id = current_setting('app.current_team_id')::text);
  
  SET LOCAL app.current_team_id = 'team_01'; -- Set at start of each request

Layer 4 — Cache Layer:
  All Redis cache keys include teamId:
    cache:team:members:{teamId}
    cache:team:stats:{teamId}:{period}
  TanStack Query keys on frontend include teamId:
    ['teams', teamId, 'meetings', filters]
```

### Team Switching Architecture

```
Multi-Team Membership (v2 Feature):
  → A user can belong to multiple teams (consultant use case)
  → JWT includes: activeTeamId (current team context)
  → Switching teams: POST /auth/switch-team { teamId }
    → Validates user.teamMemberships.includes(targetTeamId)
    → Issues new JWT with activeTeamId updated
    → Frontend clears ALL TanStack Query cache (prevent data bleed)
    → Redirects to /dashboard with new team context

Enterprise: Organization Hierarchy (Planned):
  Organization (top level) → Multiple Teams (departments)
  → SSO maps to Organization → user auto-assigned to their team
  → Organization-level admin can see across all teams
  → Useful for: "Company-wide commitment health dashboard"
```

---

## 6. Meeting Intelligence Pipeline

### End-to-End Pipeline Flow

```
MEETING LIFECYCLE (Full Pipeline):

PHASE 1 — DETECTION (Triggered by: Calendar sync OR manual)
  Google Calendar Sync (cron: every 60 min):
    1. Fetch calendar events for next 7 days
    2. Extract meeting URL from event description/conferenceData
    3. Detect platform: Zoom / Google Meet / Teams / Webex
    4. Dedup: check Redis bot:scheduled:{platform}:{meetingId}
    5. Dedup: check PostgreSQL for existing meeting with same URL+team
    6. If new: create Meeting record (status: SCHEDULED)
    7. Schedule Recall.ai bot (2 min before meeting start)
    8. Set Redis dedup flag (TTL: meeting end + 4 hours)

  Manual Bot Add:
    1. User submits meeting URL via dashboard
    2. Platform detection via regex patterns
    3. Same dedup checks as calendar sync
    4. Immediate bot scheduling (joins in ~30 seconds)

PHASE 2 — RECORDING (Real-time, during meeting)
  Recall.ai Bot Events (received via webhook):
    → bot.joining_call: status → BOT_JOINING
    → bot.in_waiting_room: notify user (needs host to admit)
    → bot.recording_started: status → RECORDING, set startedAt
      → Emit Socket.io: 'meeting:recording' to team room
      → Dashboard shows live "Recording..." indicator
    → bot.done: status → PROCESSING, set endedAt
      → Store transcript in MongoDB
      → Push to transcribe.queue

PHASE 3 — PROCESSING (Async, after meeting ends)
  transcribe.worker:
    1. Receive job from transcribe.queue
    2. Store raw Recall.ai transcript in MongoDB Atlas
      - raw_transcript[] with word-level timestamps
      - full_text (concatenated, for Atlas Search indexing)
      - processing_status: "pending"
    3. Update meeting: mongoTranscriptId = MongoDB _id
    4. Push to extract.queue

  extract.worker:
    1. Fetch transcript from MongoDB
    2. Fetch participants from PostgreSQL (for speaker mapping)
    3. Map Recall.ai speaker tags ("Speaker 1") → actual users
    4. Format transcript with speaker names/emails
    5. Check transcript size → chunk if > 120K tokens
    6. POST to FastAPI /extract endpoint
    7. Receive: commitments, action_items, decisions, blockers, summary
    8. POST to FastAPI /resolve endpoint (cross-meeting matching)
    9. PostgreSQL transaction:
       → Insert new commitments
       → Update resolved commitments (FULFILLED/MISSED from past)
       → Insert action_items, decisions, blockers
       → Update meeting: status=DONE, summary=aiSummary
    10. Update MongoDB: ai_extraction = results
    11. Recalculate commitment scores for affected owners
    12. Emit Socket.io: 'meeting:processed' to team room
    13. Push to notify.queue + integrate.queue
    14. Track usage: INSERT usage_events (type: MEETING_PROCESSED)
    15. Increment team.meetingsUsed (+1)

PHASE 4 — DISTRIBUTION (Async, after processing)
  notify.worker:
    → Send meeting summary to Slack channel
    → Send summary email to team (if preference enabled)
    → Personal Slack DMs for commitment owners
    
  integrate.worker:
    → Create Jira tickets for action_items (if Jira connected)
    → Create Linear issues for action_items (if Linear connected)
    → Create Notion pages for meeting notes (if Notion connected)
    → Post to Slack meeting channel summary
```

### Meeting Status State Machine

```
                    ┌──────────────┐
                    │  SCHEDULED   │ ← Default on creation
                    └──────┬───────┘
                           │ bot dispatched
              ┌────────────▼───────────────┐
              │         BOT_JOINING        │ ← Bot attempting to join
              └────────────┬───────────────┘
                           │ bot.recording_started webhook
              ┌────────────▼───────────────┐
              │          RECORDING         │ ← Bot in meeting, recording
              └────────────┬───────────────┘
                           │ bot.done webhook
              ┌────────────▼───────────────┐
              │         PROCESSING         │ ← AI extraction running
              └────────────┬───────────────┘
                           │ extraction complete
              ┌────────────▼───────────────┐
              │            DONE            │ ← Data available to users
              └────────────────────────────┘

  From any state:
    → FAILED (bot failed, extraction failed, network error)
    → CANCELLED (user cancelled before recording started)
  
  FAILED → can be reprocessed by admin (creates new SCHEDULED attempt)
  DONE   → terminal state (cannot change)
  CANCELLED → terminal state
```

### Speaker Diarization & Identity Resolution

```
Problem: Recall.ai returns "Speaker 1", "Speaker 2" — not names.

Resolution Algorithm (owner-resolver.service.ts):
  1. Recall.ai provides participant list (name, email if available)
  2. Match participant email → Vocaply user (exact match)
  3. If no email: fuzzy match participant.name → user.name
     → Levenshtein distance ≤ 2 (handles typos in meeting display name)
  4. Speaker tag "Speaker 1" mapped via Recall.ai participant ordering
     → Recall.ai provides which speaker_tag = which participant
  5. Build: speakerMap = { "Speaker 1": { userId, name, email } }
  6. Enrich transcript turns with resolved speaker info
  7. Confidence threshold: if name match confidence < 0.8 → mark as unresolved
     → Unresolved speakers shown as "External participant" in UI
  8. Admin can manually map speakers after meeting (correction UI)
```

### Recall.ai Integration Architecture

```
Bot Scheduling API:
  POST https://api.recall.ai/api/v1/bot
  {
    "meeting_url": "https://zoom.us/j/123456789",
    "join_at": "2026-05-12T08:58:00Z",  // 2 min before meeting
    "bot_name": "Vocaply",
    "transcription_options": {
      "provider": "assembly_ai",        // Best accuracy for English
      "language": "en"
    },
    "real_time_transcription": {
      "partial_results": true           // Word-by-word for live transcript
    }
  }
  
  Webhook Events from Recall.ai → Vocaply:
    POST /webhooks/recall
    Signature: X-Recall-Signature: sha256=<HMAC-SHA256>
    Events:
      bot.joining_call
      bot.in_waiting_room
      bot.recording_started
      bot.done (includes full transcript + video URL)
      bot.failed (includes reason: "meeting_ended_before_bot_joined")

Platform Limitations:
  Zoom: Bot shows as participant in participant list
  Google Meet: Bot shows as "Vocaply" participant
  Teams: Requires tenant admin approval in Microsoft 365 admin center
  Webex: Requires Webex admin to allowlist the bot (v2 feature)

Bot Retry Logic:
  bot.failed with reason "waiting_room":
    → Notify user: "Bot waiting in lobby — please admit it"
    → Wait 5 minutes → retry admission request
    → If still not admitted after 3 attempts → FAILED + alert
    
  bot.failed with reason "meeting_ended":
    → Meeting was too short or already ended → CANCELLED
    → No retry needed
    
  bot.failed with reason "network_error":
    → Retry up to 2 times (exponential backoff: 30s, 90s)
    → If all retries fail → FAILED + alert team
```

---

## 7. AI/ML Architecture

### AI Engine Design

Vocaply uses **Anthropic Claude** (claude-haiku-4-5 for extraction, claude-sonnet-4-6 for complex analysis) as its primary AI engine. This is a deliberate architectural choice over GPT-4 because:

1. Claude demonstrates superior nuanced language understanding for commitment language
2. Claude's longer context window handles 3-hour meetings without chunking
3. Anthropic's Constitutional AI training makes Claude more reliable for structured extraction
4. Claude API pricing is more cost-effective at scale for high-volume extraction

### Extraction Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI AI Pipeline                           │
│                                                                  │
│  POST /extract                                                   │
│  │                                                               │
│  ├─► transcript_processor.py                                     │
│  │     → Format: "Speaker: Ali Raza\nText: I'll finish...\n..."  │
│  │     → Chunk if > 120K tokens (overlap: 8 turns)              │
│  │     → Estimate tokens: words / 0.75                          │
│  │                                                               │
│  ├─► claude_client.py                                            │
│  │     → System prompt: extraction_system.txt                   │
│  │     → Model: claude-haiku-4-5 (fast + cheap for extraction)  │
│  │     → max_tokens: 4000                                        │
│  │     → temperature: 0.1 (low randomness for structured output) │
│  │     → Output: JSON only (no markdown wrapping)               │
│  │                                                               │
│  ├─► commitment_parser.py                                        │
│  │     → Calibrate confidence scores                            │
│  │     → Filter: confidence < 0.5 → excluded                    │
│  │     → Deduplicate within same meeting                        │
│  │                                                               │
│  ├─► date_parser.py                                              │
│  │     → "by Thursday" → 2026-05-15T23:59:59Z                   │
│  │     → "end of sprint" → look up team sprint schedule         │
│  │     → "before EOD" → meeting date 18:00:00 local timezone    │
│  │     → Ambiguous: store raw text only, dueDate = null         │
│  │                                                               │
│  └─► Response: { commitments[], action_items[], decisions[], blockers[], summary }
└──────────────────────────────────────────────────────────────────┘

POST /resolve
  │
  ├─► commitment_resolver.py
  │     → Compare new extractions against historical open commitments
  │     → Same owner only (never cross-owner matching)
  │     → Similarity score: TF-IDF cosine (70%) + Keyword overlap (30%)
  │     → Threshold: 0.65 (below = new commitment, above = same as existing)
  │
  ├─► similarity.py
  │     → normalize_text("I'll finish the login feature") → "finish login feature"
  │       Remove: I'll, will, the, by, to, make, sure (stopwords)
  │       Stem: finishing → finish, features → feature
  │       Limit to 5 tokens (prevents dilution from long sentences)
  │
  └─► resolution_detector.py
        → Stage 1 (Fast, no API cost):
          Check for completion keywords: done, finished, completed, shipped, merged...
          Check for non-completion phrases: still working, in progress, not done yet...
          If no completion language → return False immediately
        
        → Stage 2 (Claude, only if Stage 1 passes):
          claude-haiku: "Is this statement confirming the old commitment was done? YES/NO"
          max_tokens: 5 (literally just YES or NO)
          Cost: ~$0.0002 per check
```

### Prompt Engineering Architecture

```
extraction_system.txt — The Most Critical File:

DESIGN PRINCIPLES:
  1. Extraction rules are EXPLICIT, not implicit
     Bad:  "Extract commitments"
     Good: "A commitment requires: first-person pronoun (I/I'll/I'm) + specific deliverable + optional deadline"
  
  2. Confidence calibration rubric is defined in prompt
     "I'll definitely finish X" → 0.95
     "I'll try to finish X" → 0.60
     "Maybe I can finish X" → 0.35
  
  3. Anti-patterns explicitly excluded
     "We should X" → NOT a commitment (no specific owner)
     "Can you look into X?" → NOT a commitment (it's a question)
     "Let's discuss X next week" → NOT a commitment (no deliverable)
  
  4. Edge cases handled in prompt
     "Ahmed and I will both work on X" → TWO commitments (both owners)
     "I'll help Sara with X" → commitment for speaker, NOT Sara
     "I was supposed to do X but didn't" → retrospective, NOT new commitment

System Prompt Versioning:
  Prompts stored in /prompts/ directory (version controlled)
  A/B testing framework: 50% traffic to prompt v1, 50% to v2
  Evaluation metrics:
    → Precision: % of extracted items that are real commitments
    → Recall: % of real commitments that were extracted
    → F1 Score: harmonic mean of precision + recall
  Current baseline: Precision 91%, Recall 87%, F1: 89%
```

### AI Cost Architecture

```
Cost Per Meeting (Average 30-minute standup):
  Transcript tokens:      ~15,000 tokens
  Extraction prompt:      ~2,000 tokens (system)
  Extraction output:      ~500 tokens
  
  Total tokens per meeting: ~17,500 tokens
  
  claude-haiku pricing:
    Input: $0.25 / 1M tokens → 17,500 × ($0.25/1M) = $0.0044
    Output: $1.25 / 1M tokens → 500 × ($1.25/1M) = $0.0006
    Total per meeting: ~$0.005 (half a cent)
  
  Resolution check (cross-meeting):
    claude-haiku for YES/NO: ~$0.0002 per check
    Average 5 checks per meeting: $0.001
  
  TOTAL AI COST PER MEETING: ~$0.006 (less than 1 cent)

Cost Optimization Strategies:
  1. claude-haiku for extraction (fast, cheap, accurate enough)
  2. claude-sonnet only for: weekly digest generation, complex analytics summaries
  3. Resolution detector Stage 1 (keyword check) avoids 80% of Claude calls
  4. Transcript chunking only when needed (most standups fit in single context)
  5. Cache extraction results: don't re-extract same transcript (idempotent jobs)
  6. Batch processing: queue extraction during off-peak hours for cost optimization
  
At Scale (GROWTH plan — 120 meetings/month):
  Cost per team/month: 120 × $0.006 = $0.72
  Revenue per team/month: $99
  AI cost as % of revenue: 0.7% (excellent margin)
```

### AI Quality Assurance

```
Continuous Quality Monitoring:
  1. Confidence Score Tracking:
     → Average confidence per meeting type (standup vs. sprint review)
     → Alert if avg confidence drops below 0.75 (extraction model degradation)
  
  2. User Feedback Loop:
     → "Wrong commitment" button on each CommitmentCard
     → User can mark: "This is not a commitment" or "Owner is wrong"
     → Feedback stored → used for weekly prompt evaluation
  
  3. Ground Truth Dataset:
     → 500+ manually labeled meetings
     → New prompt versions tested against dataset before deployment
     → Regression threshold: F1 must not drop more than 2 points
  
  4. Extraction Audit Log:
     → Every extraction stored with: model version, prompt version, token count, latency
     → Allows debugging specific extraction failures
     → Compliance: can show exactly what AI did for each meeting
```

---

## 8. Real-Time Communication Layer

### WebSocket Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   REAL-TIME LAYER                               │
│                                                                 │
│  Socket.io Server (Node.js)                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  JWT Auth Middleware                                       │  │
│  │  → Validate token on handshake                            │  │
│  │  → TOKEN_EXPIRED → client refreshes → reconnects         │  │
│  │                                                           │  │
│  │  Room Architecture:                                       │  │
│  │    team:{teamId}     → Team-wide events (all members)    │  │
│  │    user:{userId}     → Personal events (this user only)  │  │
│  │    meeting:{meetingId} → Live transcript (opt-in)        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Redis Adapter (for horizontal scaling):                        │
│  → socket.io-redis-adapter                                      │
│  → Multiple Socket.io servers share state via Redis Pub/Sub    │
│  → Server A emits 'meeting:processed' → Redis → Server B       │
│    → Server B delivers to clients connected to it              │
│                                                                 │
│  Connection Management:                                         │
│  → Ping timeout: 20,000ms                                       │
│  → Ping interval: 25,000ms                                      │
│  → Max reconnect attempts: 10                                   │
│  → Reconnect delay: exponential 1s → 30s max                  │
└─────────────────────────────────────────────────────────────────┘
```

### Event Catalog

```
SERVER → CLIENT Events:

MEETING EVENTS (to team:{teamId} room):
  meeting:bot_joining     → { meetingId }
  meeting:recording       → { meetingId, startedAt }
  meeting:processing      → { meetingId }
  meeting:processed       → { meetingId, summary, counts: {commitments, actionItems} }
  meeting:failed          → { meetingId, reason }
  transcript:turn         → { meetingId, turn: {speaker, text, startTime} }  ← live

COMMITMENT EVENTS (to team:{teamId} room):
  commitment:created      → { commitment } (new extraction)
  commitment:fulfilled    → { commitmentId, ownerName, newScore }
  commitment:missed       → { commitmentId, ownerName, daysOverdue }
  commitment:deferred     → { commitmentId, newDueDate }

PERSONAL EVENTS (to user:{userId} room):
  my:deadline_today       → { commitmentId, text, dueDate }
  my:commitment_missed    → { commitmentId, text, daysOverdue }
  my:score_updated        → { newScore, change, reason }

TEAM EVENTS (to team:{teamId} room):
  member:joined           → { user }
  member:removed          → { userId }
  member:score_updated    → { userId, newScore, change }

SYSTEM EVENTS (to user:{userId} room):
  system:session_expired  → {}  (client must refresh token)
  system:plan_limit       → { resource, limit, upgradeUrl }

CLIENT → SERVER Events:
  join:team               → { teamId }
  leave:team              → { teamId }
  join:meeting            → { meetingId } (opt-in for live transcript)
  leave:meeting           → { meetingId }
  presence:ping           → { userId, teamId } (online presence heartbeat)
```

### Server-Sent Events (SSE) — Job Progress Streaming

```
GET /api/v1/jobs/{jobId}/stream
Content-Type: text/event-stream
Cache-Control: no-cache

SSE Event Format:
  id: evt_001
  event: progress
  data: {"progress":25,"message":"Extracting commitments..."}

  id: evt_002
  event: progress
  data: {"progress":65,"message":"Running cross-meeting resolver..."}

  id: evt_003
  event: complete
  data: {"progress":100,"status":"COMPLETED","result":{...}}

Use Cases:
  → Meeting reprocessing progress bar
  → Bulk data export progress
  → Integration sync status
  → Analytics report generation progress

Edge Runtime (Vercel):
  → SSE endpoint runs on edge for lowest latency
  → Pure HTTP streaming — no persistent connection needed
  → Auto-reconnect via EventSource API (browser built-in)
```

---

## 9. Commitment & Accountability Engine

### Commitment Lifecycle

```
STATES:
  PENDING    → Default. Commitment extracted, deadline not yet reached.
  FULFILLED  → Owner or Manager marked as done. OR AI detected completion statement.
  MISSED     → Deadline passed without update (auto-set by cron at 6 PM daily).
  DEFERRED   → Owner/Manager pushed deadline to future date (tracked, not lost).
  CANCELLED  → Removed from tracking (not missed, genuinely irrelevant).

AUTOMATIC TRANSITIONS (System-driven):
  PENDING → MISSED: Cron job runs daily at 6 PM UTC
    WHERE status = 'PENDING' AND dueDate < NOW() AND missedAlertSentAt IS NULL

  PENDING → FULFILLED: AI detects completion in subsequent meeting transcript
    resolution_detector.py identifies "I finished the login feature" in next standup
    → Mark old commitment FULFILLED, set resolvedInMeetingId

MANUAL TRANSITIONS (User-driven):
  PENDING → FULFILLED: Owner marks done, or Manager marks done
  PENDING → DEFERRED: Owner/Manager pushes due date (require new date)
  PENDING → CANCELLED: Manager removes from tracking (with required note)
  DEFERRED → FULFILLED: Same as PENDING → FULFILLED
  DEFERRED → MISSED: Same as PENDING → MISSED (auto, based on NEW due date)

INVALID TRANSITIONS:
  FULFILLED → any     (terminal — fulfilled is done)
  MISSED → PENDING    (cannot un-miss — can only DEFER or CANCEL)
  CANCELLED → any     (terminal)
```

### Commitment Scoring Algorithm

```
CommitmentScore: A numerical representation (0-100) of how reliably a 
team member keeps their promises.

INPUT DATA:
  Last 30 days of commitments for {userId} in {teamId}
  Filter: status IN ['FULFILLED', 'MISSED', 'PENDING']

CALCULATION:

  Step 1 — Base Fulfillment Rate:
    decided = fulfilled + missed  (excludes PENDING — not yet determined)
    base_rate = (fulfilled / decided) * 100
    If no decided commitments: base_rate = 100 (benefit of doubt)
  
  Step 2 — Recency Weighting:
    Last 7 days: weight = 1.0 (full weight, most recent behavior matters most)
    Prior 7–30 days: weight = 0.7 (less weight, older behavior)
    
    weighted_numerator = (recent_fulfilled * 1.0) + (older_fulfilled * 0.7)
    weighted_denominator = (recent_decided * 1.0) + (older_decided * 0.7)
    weighted_rate = (weighted_numerator / weighted_denominator) * 100
  
  Step 3 — On-Time Bonus:
    on_time_fulfilled = count(FULFILLED where resolvedAt <= dueDate)
    on_time_rate = (on_time_fulfilled / fulfilled) * 100
    time_bonus = (on_time_rate / 100) * 10  // Up to +10 points
  
  Step 4 — Final Score:
    raw_score = weighted_rate + time_bonus
    score = min(100, max(0, round(raw_score)))

TREND CALCULATION:
  current_week_rate = fulfilled_rate(last 7 days)
  previous_week_rate = fulfilled_rate(7-14 days ago)
  diff = current_week_rate - previous_week_rate
  trend = "improving" if diff > 5
          "declining" if diff < -5
          "stable" otherwise

SCORE STORAGE:
  Denormalized: users.commitment_score (updated after every status change)
  → Avoids expensive recalculation on every dashboard load
  → Recalculated: after FULFILLED/MISSED event, after scheduled recalc (midnight)
  
  Full history: NOT stored per-day (too much storage)
  → Trend data: calculated from raw commitments table (sufficient accuracy)
  → If needed in future: weekly score snapshots can be added
```

### Cross-Meeting Memory System

```
THE CORE DIFFERENTIATION:
  Fireflies, Otter, and Grain treat each meeting in isolation.
  Vocaply builds a memory across meetings for each person.

RESOLUTION PIPELINE:

  When processing Meeting B (this week's standup):
    1. Extract: Ahmed says "I finished the login feature"
    2. Query: Historical open commitments for Ahmed (PENDING status)
       → Found: "Ahmed committed to finish login feature" (Meeting A, last Monday)
    
    3. Similarity Check:
       normalize("I finished the login feature") → "finish login feature"
       normalize("finish the login feature by Thursday") → "finish login feature"
       cosine_similarity("finish login feature", "finish login feature") = 0.94
       → Match found (above 0.65 threshold)
    
    4. Resolution Detection:
       Stage 1: "finished" is in completion keywords → pass to Claude
       Stage 2: Claude: "Does 'I finished the login feature' confirm 'finish login feature by Thursday' was done? YES"
       → Confidence: high
    
    5. Update:
       Commitment from Meeting A:
         status: PENDING → FULFILLED
         resolvedAt: NOW()
         resolvedInMeetingId: Meeting B ID
    
    6. Notify:
       → Ahmed's score recalculated (+fulfilled)
       → Team notified: "Ahmed fulfilled commitment: login feature ✅"
       → Jira ticket marked as Done (if synced)
       → Socket.io: 'commitment:fulfilled' to team room

CARRY-FORWARD LOGIC:
  In Meeting B's AI-generated summary:
    "Open from last week: Ahmed → login feature (overdue 2 days)"
  This appears in the meeting brief BEFORE extraction
  Creates accountability context: team sees what was supposed to be done
  Puts gentle pressure on people to address open commitments in standup
```

### Deadline Alert System

```
CRON JOBS (running as Bull scheduled jobs):

9:00 AM DAILY — Deadline Reminders:
  SQL:
    SELECT c.*, u.email, u.name, t.settings, t.plan
    FROM commitments c
    JOIN users u ON c.owner_id = u.id
    JOIN teams t ON c.team_id = t.id
    WHERE c.status = 'PENDING'
      AND c.due_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND c.reminder_sent_at IS NULL
      AND t.plan != 'FREE'  -- notifications are paid feature
    
  For each commitment:
    → Dedup: Redis key notif:sent:DEADLINE_REMINDER:{userId}:{commitmentId} TTL 24h
    → Queue notify.job with type DEADLINE_REMINDER
    → Update: commitments.reminderSentAt = NOW()

6:00 PM DAILY — Mark Missed + Alert:
  SQL:
    SELECT c.*, u.*, t.members WHERE (role IN ('MANAGER', 'ADMIN', 'OWNER'))
    FROM commitments c
    JOIN users u ON c.owner_id = u.id
    JOIN teams t ON c.team_id = t.id
    WHERE c.status = 'PENDING'
      AND c.due_date < NOW()
      AND c.missed_alert_sent_at IS NULL
    
  BATCH UPDATE:
    UPDATE commitments SET status = 'MISSED', missed_alert_sent_at = NOW()
    WHERE id IN (collected_ids)
    -- Batch update for efficiency (not one-by-one)
  
  For each missed commitment:
    → Emit Socket.io: team:TEAMID commitment:missed
    → Emit Socket.io: user:USERID my:commitment_missed
    → Queue notify.job: email to owner + Slack DM
    → Queue notify.job: email to managers + Slack DM to managers
    → Recalculate owner's commitment score
    → Emit Socket.io: member:score_updated

MONDAY 9:00 AM — Weekly Digest:
  For each team (on GROWTH+ plan):
    → Generate weekly commitment report
    → Include: fulfillment rate, who kept promises, who missed, upcoming deadlines
    → Send to all MANAGER+ roles via email
    → Post summary to team Slack channel (if configured)
    → Dedup: Redis notif:sent:WEEKLY_DIGEST:{teamId} TTL 7 days

SUNDAY MIDNIGHT — Score Recalculation:
  → Recalculate ALL team members' commitment scores (full recalc, not incremental)
  → Catches any drift from incremental updates during the week
  → Stores weekly score snapshot for trend analysis
```

---

## 10. Integration Architecture

### Integration Layer Design

```
┌─────────────────────────────────────────────────────────────────┐
│                   INTEGRATION LAYER                             │
│                                                                 │
│  Team-Level Integrations (one per provider per team):          │
│    JIRA · LINEAR · SLACK · NOTION                              │
│                                                                 │
│  User-Level Integrations (per user):                           │
│    GOOGLE_CALENDAR · OUTLOOK_CALENDAR                          │
│                                                                 │
│  Platform Integrations (bot-level, via Recall.ai):             │
│    ZOOM · GOOGLE_MEET · MICROSOFT_TEAMS · WEBEX                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           OAuth Token Management                        │   │
│  │                                                         │   │
│  │  Storage:   AES-256-GCM encrypted in PostgreSQL         │   │
│  │  Rotation:  Proactive refresh when expires < 30 min    │   │
│  │  Cron:      Check expiring tokens every 15 minutes      │   │
│  │  Fallback:  If refresh fails → mark inactive → alert   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Jira Integration (Deep Dive)

```
OAuth 2.0 (3LO) Setup:
  → User clicks "Connect Jira" → redirect to Atlassian OAuth
  → Scopes: read:jira-work, write:jira-work, read:jira-user
  → Callback: POST /integrations/JIRA/callback
  → Store: encrypted access_token + refresh_token in team_integrations

Outbound Sync (Vocaply → Jira):
  Action Item Extracted from Meeting:
    1. integrate.worker receives job
    2. GET decrypted Jira access_token
    3. Look up Jira project config (projectKey, defaultIssueType, defaultPriority)
    4. Map Vocaply data to Jira fields:
       → summary: action_item.text
       → description: "Extracted from meeting: {meetingTitle} on {date}\nContext: {transcript excerpt}"
       → assignee: look up Jira user by email (match to Vocaply user email)
       → duedate: action_item.dueDate (if present)
       → priority: map HIGH → "High", URGENT → "Highest"
       → labels: ["vocaply", "meeting-action-item"]
    5. POST https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/issue
    6. Store: action_items.jiraIssueId, action_items.jiraIssueUrl
    7. Emit Socket.io: action_item:synced

Inbound Sync (Jira → Vocaply — Reverse):
  Jira Webhook (registered when Jira connected):
    POST /webhooks/jira
    Event: jira:issue_updated
    
    Handling:
      1. Verify Jira webhook secret (HMAC-SHA256)
      2. Extract issue key from payload
      3. Find action_item WHERE jiraIssueId = issueKey
      4. If Jira status = "Done" → mark action_item.completed = true
      5. If action item linked to commitment → evaluate: FULFILLED?
      6. Emit Socket.io: updates to dashboard

Error Handling:
  → 401 (token expired): auto-refresh using refresh_token → retry once
  → 403 (permissions): alert admin, mark integration needs reauth
  → 502 (Jira down): retry with exponential backoff (15s, 60s, 300s)
  → After 5 failures: mark integration inactive, send email alert to admin
```

### Slack Integration (Deep Dive)

```
OAuth Setup:
  → Scopes: chat:write, channels:read, users:read.email, im:write (DMs)
  → Bot token stored (not user token — bot persists without specific user)
  → Workspace ID + bot user ID stored

Meeting Summary Message (Block Kit):
  {
    "blocks": [
      { "type": "header", "text": { "text": "📋 Monday Standup — Summary" } },
      { "type": "section", "text": { "text": "Duration: 28 min · 5 participants" } },
      { "type": "divider" },
      { "type": "section", "text": { "text": "✅ *3 Commitments Extracted*" } },
      { "type": "section", "text": {
        "text": "• *Ahmed Hassan* — Finish login feature by Thursday\n• *Sara Khan* — Send design file by Wednesday\n• *Ali Raza* — Review PRs before EOD"
      }},
      { "type": "divider" },
      { "type": "section", "text": { "text": "⚠️ *2 Open from Last Week*" } },
      { "type": "actions", "elements": [
        { "type": "button", "text": "View Full Summary", "url": "https://app.vocaply.com/meetings/mtg_01" }
      ]}
    ]
  }

Personal DM Alerts:
  → Deadline reminder: sent to individual user via im.open + chat.postMessage
  → Commitment missed: sent to owner + all team managers separately
  → Achievement: "🏆 Your commitment rate hit 90% this month!"

Slack Channel Routing:
  → Team admin configures: default channel for meeting summaries
  → Per-meeting override: "Post to #sprint-updates" (from meeting settings)
  → Fallback: if channel archived → post to general or alert admin

Rate Limits:
  Slack API: 1 message per second per channel (Tier 2)
  → notify.worker: process Slack notifications sequentially with 1.1s delay
  → Queue order: critical alerts (missed) > summaries > digests
```

### Google Calendar Integration

```
Scopes:
  → User-level: calendar.readonly (read events, extract meeting URLs)
  → Do NOT request calendar.events (write) unless scheduling feature added

Sync Architecture:
  calendar-sync.worker (cron: every 60 minutes):
    For each user with active Google Calendar integration:
      1. Get valid access_token (refresh if expiring < 30 min)
      2. GET https://www.googleapis.com/calendar/v3/calendars/primary/events
         timeMin=NOW(), timeMax=NOW()+7days, singleEvents=true
      3. For each event:
         → Extract meeting URL from description, location, conferenceData
         → Detect platform: regex match (zoom.us, meet.google.com, teams.microsoft.com)
         → Dedup: Redis bot:scheduled:{platform}:{meetingId}
         → Dedup: DB check for existing meeting with same URL+team
         → If new: create Meeting + schedule Recall.ai bot

Event URL Extraction:
  Priority 1: event.conferenceData.entryPoints (official Google Meet link)
  Priority 2: Regex scan of event.description (Zoom links embedded in text)
  Priority 3: event.location (sometimes contains meeting URL)
  Priority 4: event.attachments (sometimes meeting details in attachment)

Conflict Handling:
  → Multiple team members have same meeting in their calendar
  → Redis dedup key prevents scheduling 2 bots for same meeting
  → First person's calendar event wins (earliest sync wins)
  → Other team members see the same meeting (deduplicated via platformMeetingId)
```

### Linear, Notion, Outlook (Brief Architecture)

```
Linear:
  → GraphQL API (not REST)
  → Create Issue mutation: { title, description, assigneeId, dueDate, teamId, stateId }
  → Find Linear user by email: users(filter: { email: { eq: userEmail } })
  → Webhooks: issue.update → mark action_item complete
  → Map priority: HIGH → "High" in Linear priority enum

Notion:
  → Create page in configured database
  → Properties mapped: Title, Status (Select), Due Date (Date), Assignee (Person)
  → Meeting notes as full page content (formatted transcript summary)
  → Blocks API for rich content: headings, bullets, code blocks
  → No webhook back to Vocaply (Notion webhooks limited in beta)

Outlook Calendar:
  → Microsoft Graph API: GET /me/calendarView
  → MSAL (Microsoft Authentication Library) for OAuth
  → Same sync architecture as Google Calendar
  → Teams meeting URLs extracted from onlineMeeting.joinUrl property
```

---

## 11. Notification & Alert System

### Notification Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  NOTIFICATION SYSTEM                            │
│                                                                 │
│  Event Sources:                                                 │
│    Meeting processed → notify.queue                            │
│    Commitment missed → notify.queue                            │
│    Deadline today → deadline.queue → notify.queue              │
│    Weekly digest → scheduled cron → notify.queue               │
│    Payment failed → Stripe webhook → notify.queue              │
│                                                                 │
│  notify.worker (processes notify.queue):                       │
│    1. Load user notification preferences                        │
│    2. Load team integrations (Slack connected?)                │
│    3. Dedup check (Redis — prevent double-sending)             │
│    4. Route to channels:                                        │
│       → Email (Resend)                                          │
│       → Slack (Web API)                                         │
│       → In-app (Socket.io)                                      │
│       → Push (future: web push / mobile push)                  │
│    5. Set dedup flag in Redis (TTL: 1-24 hours per type)       │
└─────────────────────────────────────────────────────────────────┘
```

### Email System (Resend)

```
Email Provider: Resend (transactional email)
  → React Email templates (JSX → HTML)
  → Custom domain: notifications@vocaply.com
  → Deliverability: SPF, DKIM, DMARC configured
  → Suppression list: handle bounces and unsubscribes

Email Templates (React Email):
  1. VerifyEmail.tsx — Account verification with token link
  2. PasswordReset.tsx — Password reset with expiry countdown
  3. TeamInvite.tsx — Team invitation with role and team name
  4. MeetingSummary.tsx — Post-meeting digest with commitment list
  5. DeadlineReminder.tsx — "Your deadline is tomorrow" with action buttons
  6. CommitmentMissed.tsx — "You missed a commitment" with context
  7. ManagerAlert.tsx — "{Name} missed a commitment" for managers
  8. WeeklyDigest.tsx — Manager weekly report with charts (embedded SVG)
  9. PaymentFailed.tsx — Billing alert with retry link
  10. PlanLimit.tsx — "You've hit your meeting limit" with upgrade CTA

Email Rate Limiting:
  → Max 3 emails per user per day (prevent spam)
  → Meeting summaries: one per meeting (never batched)
  → Digests: one per week per team (deduplicated in Redis)
  → Alerts: individual, time-limited dedup (1 hour per alert type per commitment)

Unsubscribe Architecture:
  → One-click unsubscribe header: List-Unsubscribe: <https://api.vocaply.com/unsubscribe?token=...>
  → Unsubscribe from specific notification type (not all email)
  → Preferences stored: users.notification_preferences JSONB
  → GDPR: unsubscribe honored within 24 hours maximum
```

### Notification Preferences System

```
Per-user preferences (stored as JSONB):
  {
    "email": {
      "meetingSummary":    true,
      "deadlineReminder":  true,
      "commitmentMissed":  true,
      "weeklyDigest":      true,
      "paymentAlerts":     true
    },
    "slack": {
      "meetingSummary":    true,
      "deadlineReminder":  true,
      "commitmentMissed":  true,
      "dailyDigest":       false,
      "personalDMs":       true
    },
    "inApp": {
      "all": true
    }
  }

Notification Hierarchy (what overrides what):
  1. User opt-out → always respected (GDPR, CAN-SPAM)
  2. Team admin can enable/disable specific notification types team-wide
  3. Plan restriction: Free plan → no email/Slack alerts (in-app only)
  4. Enterprise: SSO identity provider controls notification policy

Test Notification:
  POST /api/v1/notifications/test
  Sends a sample notification to verify channel is configured correctly
  Used: after setting up Slack integration, after adding custom email domain
```

---

## 12. Analytics & Reporting Engine

### Analytics Architecture

```
QUERY STRATEGY:
  Real-time Dashboard:  PostgreSQL + Redis cache (5-min TTL)
  Historical Reports:   PostgreSQL aggregation queries
  Trend Charts:         Pre-computed weekly buckets (stored in JSONB column)
  Export Reports:       Background job → S3 CSV → presigned download URL
  
  NOT using: Separate analytics DB (BigQuery, Redshift) — not needed at current scale
  PLANNED at 10M+ meetings: ClickHouse for time-series analytics

CACHING STRATEGY:
  cache:team:stats:{teamId}:{from}:{to}    TTL: 300s (5 min)
  cache:team:members:{teamId}              TTL: 300s (5 min)
  cache:analytics:overview:{teamId}        TTL: 300s (5 min)
  
  Cache invalidation: PATCH/DELETE to commitments → del cache:team:stats:{teamId}:*
  Background refresh: before TTL expires, warm cache proactively (SWR pattern)
```

### Key Metrics & Computations

```
TEAM HEALTH SCORE (0-100):
  fulfillment_rate × 0.6 +    // 60% weight: % commitments fulfilled
  avg_member_score × 0.3 +    // 30% weight: average of all member scores
  on_time_rate × 0.1          // 10% weight: % fulfilled before deadline

  health_trend: compare current 14 days vs prior 14 days
    → "improving" if diff > 5 points
    → "declining" if diff < -5 points
    → "stable" otherwise

MEMBER ANALYTICS:
  Per member, per time period:
    total_commitments, fulfilled, missed, pending, deferred
    fulfillment_rate = fulfilled / (fulfilled + missed)
    on_time_rate = on_time_fulfilled / fulfilled
    commitment_score = weighted algorithm (see §9)
    trend = improving | stable | declining

MEETING ANALYTICS:
  meetings_per_week (grouped by scheduledAt week)
  avg_duration_minutes (computed from startedAt - endedAt)
  platform_breakdown: { ZOOM: 60%, GOOGLE_MEET: 35%, TEAMS: 5% }
  commitments_per_meeting (avg + distribution)
  meetings_with_0_commitments (flag for review)

TREND DATA FORMAT:
  {
    "metric": "fulfillmentRate",
    "granularity": "week",
    "points": [
      { "period": "2026-W14", "value": 72, "label": "Apr 1-7", "count": 18 },
      { "period": "2026-W15", "value": 78, "label": "Apr 8-14", "count": 21 },
      ...
    ],
    "summary": { "average": 78, "highest": 89, "lowest": 65, "trend": "improving" }
  }
```

### Analytics Query Optimization

```
INDEXES FOR ANALYTICS:
  idx_commitments_team_status: (team_id, status)
  idx_commitments_overdue: (due_date) WHERE status='PENDING' AND due_date IS NOT NULL
  idx_commitments_team_period: (team_id, created_at DESC)
  idx_usage_team_time: (team_id, occurred_at DESC)

EXAMPLE OPTIMIZED QUERY — Monthly Commitment Rate:
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'FULFILLED') AS fulfilled,
    COUNT(*) FILTER (WHERE status = 'MISSED') AS missed,
    ROUND(
      COUNT(*) FILTER (WHERE status = 'FULFILLED')::NUMERIC
      / NULLIF(COUNT(*) FILTER (WHERE status IN ('FULFILLED','MISSED')), 0) * 100
    , 0) AS fulfillment_rate
  FROM commitments
  WHERE team_id = $1
    AND created_at >= DATE_TRUNC('month', NOW())
    AND created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
  
  Execution: < 10ms with proper index (team_id + created_at index)
  Cache: store result for 5 minutes in Redis

WEEKLY PRE-COMPUTATION (Background Job — Sunday Midnight):
  → Compute weekly fulfillment rate for all teams
  → Store in team_weekly_stats table
  → Dashboard trend charts read from pre-computed table (< 1ms)
  → Avoids expensive aggregation on each chart load
```

---

## 13. Billing & Subscription System

### Billing Architecture

```
Payment Provider: Stripe
  → Stripe handles: PCI DSS compliance, card tokenization, fraud detection
  → Vocaply never touches raw card data
  → Stripe Customer Portal: let users manage billing without custom UI

Subscription Model: Flat Team Pricing
  FREE:     $0     → 5 meetings/mo, 3 members, 1 integration
  STARTER:  $49/mo → 40 meetings/mo, 10 members, all integrations
  GROWTH:   $99/mo → 120 meetings/mo, 25 members, advanced analytics
  BUSINESS: $199/mo → 300 meetings/mo, 60 members, API access, multiple workspaces
  ENTERPRISE: Custom → Unlimited, SSO, SAML, SCIM, SLA

Annual Discount: 20% off (e.g., GROWTH: $99/mo → $79/mo billed annually)
```

### Billing Flows

```
UPGRADE FLOW (Stripe Checkout):
  1. Admin clicks "Upgrade to Growth"
  2. POST /billing/checkout { planId: "growth", interval: "month", successUrl, cancelUrl }
  3. Create Stripe Checkout Session
  4. Redirect user to Stripe's hosted checkout page
  5. User enters card details (Stripe handles, Vocaply never sees)
  6. Stripe redirects to successUrl on payment
  7. Stripe webhook: checkout.session.completed
  8. Update team.plan = "GROWTH" in DB
  9. Update team.meetingsUsed = 0 (reset counter at start of new cycle)
  10. Clear Redis cache: del cache:team:plan:{teamId}
  11. Send confirmation email

WEBHOOK HANDLERS:
  checkout.session.completed → activate subscription
  customer.subscription.created → update team plan
  customer.subscription.updated → plan change (upgrade/downgrade)
  customer.subscription.deleted → downgrade to FREE
  invoice.payment_succeeded → send receipt email, update subscription period
  invoice.payment_failed → send warning email, retry logic
    → attempt_count >= 3 → suspend account, email admin

PLAN LIMIT ENFORCEMENT:
  Meeting Creation (POST /meetings):
    1. Load from Redis: cache:team:plan:{teamId} (TTL 1 hour)
    2. Cache miss: query team.plan + team.meetingsUsed from DB → cache
    3. Check: meetingsUsed >= PLAN_LIMITS[plan].meetings
    4. If limit reached → 402 PLAN_LIMIT with upgrade URL
    5. If not: proceed, after meeting processed increment meetingsUsed

  Member Invitation (POST /teams/me/invite):
    1. Count current team members
    2. Check: current_count >= PLAN_LIMITS[plan].members
    3. If limit reached → 402 PLAN_LIMIT
```

### Usage Tracking Architecture

```
usage_events Table:
  → Append-only log of all billable events
  → type: MEETING_PROCESSED | AI_EXTRACTION | INTEGRATION_SYNC
  → Used for: monthly billing, quota checks, customer usage analytics
  → Cleaned up: events older than 2 years archived to S3

teams.meetings_used:
  → Denormalized counter for fast quota checks
  → Incremented: when meeting status → DONE
  → Reset: on billing cycle renewal (Stripe webhook)
  → Why denormalized: quota check is on critical path (every meeting creation)
    → Single Redis lookup << COUNT(*) query against usage_events

Metered Billing (Planned v2):
  → Current: flat limit (hard stop at 120 meetings)
  → Future: soft limit + overage pricing ($1.50 per extra meeting)
  → Stripe Billing usage records API for metered billing
```

---

## 14. Data Architecture

### Database Selection Rationale

```
PostgreSQL (Supabase):
  WHY:
    → ACID compliance for critical data (commitments, billing, users)
    → Relational integrity (commitments always linked to valid meetings and users)
    → Complex JOINs for analytics (member stats + commitment data + team data)
    → Row-Level Security for multi-tenant isolation
    → Full-text search on smaller text fields (commitment text)
    → JSON/JSONB columns for flexible settings data
    → Mature ecosystem (Prisma ORM, migrations, tooling)
  
  USE FOR: All structured, relational, transactional data

MongoDB (Atlas):
  WHY:
    → Transcripts are variable-length documents (30min standup: 20KB, 3hr all-hands: 500KB)
    → No fixed schema needed — transcript format evolves with Recall.ai updates
    → Atlas Full-Text Search (Lucene) for cross-meeting transcript search
    → Horizontal scaling via sharding by team_id (when needed at scale)
    → Document model matches transcript structure naturally
  
  USE FOR: Meeting transcripts, AI extraction output, full-text search

Redis (Upstash):
  WHY:
    → Sub-millisecond latency for cache lookups
    → Native data structures: sorted sets (rate limiting), lists (queues), sets (dedup)
    → TTL-first design: ephemeral data (sessions, rate limits, dedup keys)
    → Bull queues require Redis natively
    → Pub/Sub for Socket.io multi-server coordination
  
  USE FOR: Caching, job queues, rate limiting, real-time pub/sub, session data

S3 / Object Storage (Cloudflare R2):
  WHY:
    → Audio/video recording files from Recall.ai (large binary files)
    → Data exports (CSV, JSON) served via presigned URLs
    → Log archives (compliance retention)
    → R2 over S3: no egress fees (significant cost saving at scale)
  
  USE FOR: Binary files, exports, archives
```

### Data Flow Architecture

```
WRITE PATH (Critical — must be fast):
  API Request → Node.js → PostgreSQL (primary write)
                       → Redis (invalidate cache)
                       → Bull Queue (async tasks)
  
  Latency target: < 50ms for simple writes

READ PATH (High frequency — must be cached):
  Dashboard load → TanStack Query cache hit → instant
              → cache miss → Redis → < 5ms
              → Redis miss → PostgreSQL → < 50ms → populate Redis

ANALYTICS PATH (Expensive — always async):
  Complex query → PostgreSQL (read replica if available)
               → Pre-computed tables (Sunday midnight job)
               → Result cached in Redis (5 min TTL)
  
  Latency target: < 500ms (user waits for analytics)

TRANSCRIPT PATH (Write-once, read-few):
  Meeting ends → MongoDB write (transcript) → async
              → Extract job → update MongoDB (ai_extraction) → async
              → UI reads transcript: MongoDB direct read → < 100ms
  
  No Redis caching for transcripts (too large, read rarely)

SEARCH PATH:
  User searches transcript → MongoDB Atlas Search → < 200ms
  User searches commitments → PostgreSQL ILIKE (indexed) → < 50ms
  User searches meetings → PostgreSQL ILIKE (indexed) → < 50ms
```

### Data Retention & Lifecycle

```
RETENTION BY PLAN:
  FREE:       7 days  (meetings, transcripts, commitments)
  STARTER:    90 days
  GROWTH:     1 year
  BUSINESS:   Unlimited (until account deletion)
  ENTERPRISE: Configurable (1-7 years, compliance requirements)

CLEANUP JOBS (Daily cron):
  → expired_refresh_tokens: DELETE WHERE expires_at < NOW()
  → expired_email_tokens: DELETE WHERE expires_at < NOW()
  → expired_password_tokens: DELETE WHERE expires_at < NOW() OR used_at IS NOT NULL
  → old_usage_events: DELETE WHERE occurred_at < NOW() - 2 years
  → old_job_data: Bull automatically cleans completed jobs (max 100 kept)

DATA EXPORT (GDPR Right to Portability):
  POST /api/v1/teams/export
  → Async job creates ZIP containing:
    → all_commitments.csv
    → all_meetings.json
    → all_action_items.csv
    → all_transcripts/ (one JSON per meeting)
  → Uploaded to S3 with 24-hour presigned URL
  → Email sent when ready

DATA DELETION (GDPR Right to Erasure):
  DELETE /api/v1/auth/me (account deletion)
  → Remove user from team membership
  → Anonymize: commitment.owner_id → null (keep commitment for team data integrity)
  → Delete: all refresh tokens, all integrations, all user-specific data
  → Async: MongoDB transcript speaker data anonymized (names removed)
  → Timeline: completed within 30 days (GDPR requirement)
```

---

## 15. API Architecture

### API Design Standards

```
REST API Design:
  Base URL:       https://api.vocaply.com/api/v1
  Versioning:     URI path (/api/v1, /api/v2)
  Content-Type:   application/json always
  IDs:            {prefix}_{cuid} format (usr_, team_, mtg_, com_)
  Dates:          ISO 8601 UTC always
  Pagination:     Cursor-based (default) + offset (analytics)
  Errors:         Machine-readable codes + human messages

Response Envelope:
  Success: { "success": true, "data": {...}, "meta": {...pagination...} }
  Error:   { "success": false, "error": { "code": "...", "message": "...", "details": {...} } }

Security Headers:
  X-Request-ID: req_{cuid}        (correlation ID, echoed from client if provided)
  X-Response-Time: 47ms           (server processing time)
  X-RateLimit-Limit: 200
  X-RateLimit-Remaining: 156
  X-RateLimit-Reset: 1716900000

Content Security Policy:
  Cache-Control: private, no-cache  (auth endpoints — never cached)
  Cache-Control: public, max-age=3600  (billing plans — CDN cached)
```

### Rate Limiting Architecture

```
TIER 1 — IP-Based (Pre-authentication):
  100 requests / 60 seconds per IP
  Algorithm: Sliding window (Redis sorted sets + Lua atomic script)
  Key: ratelimit:ip:{ip_address}
  On exceed: 429 + Retry-After header

TIER 2 — User-Based (Post-authentication):
  200 requests / 60 seconds per userId
  Key: ratelimit:api:{userId}

TIER 3 — Endpoint-Specific:
  POST /auth/login:            5 / 15 min per email (brute force)
  POST /auth/forgot-password:  3 / 60 min per email
  POST /auth/resend-verify:    1 / 60 sec per email
  POST /batch:                 10 / 60 sec per user

TIER 4 — Plan-Based (Monthly):
  FREE: 5 meetings/month (hard limit)
  STARTER: 40 meetings/month
  GROWTH: 120 meetings/month
  BUSINESS: 300 meetings/month

Implementation (Redis Lua Script — Atomic):
  ZADD ratelimit:{key} {now} {now}:{random}
  ZREMRANGEBYSCORE ratelimit:{key} 0 {window_start}
  count = ZCARD ratelimit:{key}
  EXPIRE ratelimit:{key} {window_seconds}
  IF count > limit RETURN 429
```

### Idempotency System

```
Idempotency Keys:
  Header: X-Idempotency-Key: {client-generated-uuid}
  Required on: all POST mutations (meeting creation, invites, checkouts)
  Optional on: GET, DELETE (naturally idempotent)

Storage:
  Redis: idempotency:{teamId}:{key} → {bodyHash, statusCode, response}
  TTL: 24 hours
  On replay: return cached response without re-processing

Conflict Detection:
  Same key + same body hash → return cached (safe replay)
  Same key + different body hash → 422 IDEMPOTENCY_CONFLICT
  Concurrent requests with same key → serialize using Redis SETNX

Benefits:
  → Safe client retry on network failure
  → Prevents duplicate meetings, duplicate invites, duplicate charges
  → Critical for mobile clients on unreliable connections
```

### Webhook System (Outbound)

```
Customer Webhook Registration:
  POST /api/v1/webhooks { url, events[], secret }
  
  Delivery:
    → At-least-once guarantee (may deliver duplicate on retry)
    → Client must deduplicate using event.id
    → 5 retries: 1min, 5min, 30min, 2hr, 8hr
    → After 5 failures: webhook marked "failing", admin notified

Signature Verification:
  Vocaply-Signature: t={timestamp},v1={hmac_sha256}
  
  Payload: "{timestamp}.{rawBody}"
  Secret: customer-defined (min 32 chars, stored SHA-256 hashed)
  Replay protection: |now - timestamp| > 5 minutes → reject

Event Catalog (see §8 for full list):
  meeting.processed, commitment.fulfilled, commitment.missed,
  commitment.created, team.member.joined, team.plan.upgraded, etc.
```

---

## 16. Security Architecture

### Security Layers

```
LAYER 1 — NETWORK:
  → All traffic over TLS 1.3 (TLS 1.0/1.1 disabled)
  → HSTS: max-age=63072000; includeSubDomains; preload
  → Certificate: Let's Encrypt auto-renewal via Vercel / Cloudflare
  → DDoS protection: Cloudflare (free tier → Pro at scale)

LAYER 2 — AUTHENTICATION:
  → JWT HS256 (upgrading to RS256 in v2 for multi-service)
  → Refresh token rotation (theft detection built-in)
  → HMAC-SHA256 webhook signatures (replay protection)
  → API key SHA-256 hashing (never store plain keys)
  → Constant-time comparison for all token verification

LAYER 3 — AUTHORIZATION:
  → RBAC (4 role levels)
  → ABAC overlay for resource-level checks
  → Tenant isolation: application + ORM + RLS (3 layers)
  → Every query includes team_id (never trust client-provided teamId)

LAYER 4 — DATA:
  → OAuth tokens: AES-256-GCM encrypted before storage
  → Passwords: bcrypt (12 rounds)
  → PII: email addresses lowercase-normalized and indexed
  → Encryption at rest: Supabase + MongoDB Atlas (AES-256)
  → Encryption in transit: TLS 1.3 everywhere

LAYER 5 — APPLICATION:
  → Content Security Policy (CSP) headers
  → CORS: only configured origins allowed
  → Input validation: Zod schemas on all endpoints
  → SQL injection: Prisma parameterized queries (no raw SQL)
  → XSS prevention: React auto-escaping + DOMPurify for markdown
  → CSRF protection: SameSite=Strict cookies + OAuth state parameter

LAYER 6 — INFRASTRUCTURE:
  → Secrets: environment variables (never in code)
  → Dependency scanning: npm audit + Snyk in CI
  → Container scanning: Docker image vulnerability scanning
  → Access logs: all API requests logged with userId + IP
  → Anomaly detection: alert on unusual API patterns (planned)
```

### Token Encryption Design

```
AES-256-GCM for OAuth Token Storage:
  
  Key: ENCRYPTION_KEY env var (64-char hex = 32 bytes)
  IV:  16 random bytes (fresh per encryption — never reuse)
  Tag: 16 bytes authentication tag (GCM provides integrity)
  
  Stored format: base64(iv + authTag + ciphertext)
  
  Encryption:
    iv = crypto.randomBytes(16)
    cipher = createCipheriv('aes-256-gcm', KEY, iv, { authTagLength: 16 })
    encrypted = cipher.update(plaintext) + cipher.final()
    authTag = cipher.getAuthTag()
    stored = base64(iv + authTag + encrypted)
  
  Decryption:
    combined = base64decode(stored)
    iv = combined[0:16]
    authTag = combined[16:32]
    encrypted = combined[32:]
    decipher = createDecipheriv('aes-256-gcm', KEY, iv)
    decipher.setAuthTag(authTag)
    plaintext = decipher.update(encrypted) + decipher.final()
    // If authTag doesn't match → throws → tampered data detected

Key Rotation (Planned v2):
  → Key versioning: ENCRYPTION_KEY_v2 stored alongside ENCRYPTION_KEY_v1
  → Background job: re-encrypt all tokens with new key
  → After re-encryption complete: retire old key
  → Zero-downtime rotation (read old, write new)
```

### OWASP Top 10 Mitigation

```
A01 Broken Access Control:
  → RBAC + resource ownership checks on every endpoint
  → Tenant isolation (3 layers)
  → API tests for privilege escalation
  
A02 Cryptographic Failures:
  → AES-256-GCM for data at rest
  → TLS 1.3 for data in transit
  → bcrypt for passwords (not MD5, SHA-1, or SHA-256)
  → No sensitive data in logs or URLs

A03 Injection:
  → Prisma ORM: parameterized queries always
  → Zod validation: whitelist allowed inputs
  → MongoDB: Mongoose schema validation
  → No raw SQL except pre-approved analytics queries

A04 Insecure Design:
  → Threat modeling on every new feature
  → Security review on authentication changes
  → Defense in depth (never single point of failure)

A05 Security Misconfiguration:
  → Helmet.js security headers
  → No default credentials
  → Environment-specific configs (dev vs prod)
  → CORS: allowlist only

A06 Vulnerable Components:
  → npm audit in CI pipeline
  → Dependabot auto-PRs for dependency updates
  → Snyk scanning (planned)

A07 Authentication Failures:
  → Brute force protection (5 attempts → 15 min lockout)
  → Secure token storage (memory only, HttpOnly cookies)
  → Account lockout with gradual release

A08 Data Integrity Failures:
  → HMAC-SHA256 webhook signatures
  → Signed JWTs (HS256, upgrading to RS256)
  → Idempotency keys prevent duplicate processing

A09 Logging & Monitoring:
  → All auth events logged (login, logout, failed attempts)
  → All API requests logged (method, path, userId, statusCode)
  → Sentry for error tracking
  → Alerts on: high error rate, unusual login patterns

A10 Server-Side Request Forgery:
  → No user-controlled URL fetching (except webhook registration)
  → Webhook URLs: allowlist by default, validate URL format
  → Internal network: no access from API to internal services via user-provided URLs
```

---

## 17. Infrastructure & DevOps

### Infrastructure Architecture

```
HOSTING STRATEGY:
  Frontend (Next.js):  Vercel
    → Global edge network
    → Automatic SSL
    → Preview deployments per PR
    → ISR (Incremental Static Regeneration) for marketing pages
    
  API (Node.js):       Railway (dev) → AWS ECS Fargate (scale)
    → Railway: easy deployment, no Kubernetes needed early
    → Migration to ECS Fargate when horizontal scaling needed
    
  AI Pipeline (Python FastAPI): Railway → AWS ECS Fargate
    → Separate from API (CPU-intensive — needs independent scaling)
    → Auto-scale based on: queue depth in Bull
    
  Databases:
    → PostgreSQL: Supabase (managed) → AWS RDS (enterprise)
    → MongoDB: Atlas (managed, always)
    → Redis: Upstash (serverless) → AWS ElastiCache (scale)
    
  Storage:
    → Cloudflare R2 (audio/video, exports) — zero egress fees
    
  CDN:
    → Vercel Edge Network (frontend)
    → Cloudflare (API, DDoS protection)
```

### CI/CD Pipeline

```
GitHub Actions Pipeline:

On Pull Request:
  1. pnpm install --frozen-lockfile
  2. pnpm turbo type-check          (TypeScript, all packages)
  3. pnpm turbo lint                (ESLint, all packages)
  4. pnpm turbo test                (Vitest unit tests)
  5. pnpm turbo build               (Next.js + API build)
  6. Deploy Preview (Vercel)        (auto-deployed PR preview URL)
  7. Run E2E tests against preview  (Playwright)
  8. Security: npm audit            (fail on critical vulnerabilities)
  9. openapi-diff                   (detect breaking API changes)
  
  All must pass → PR can be merged

On Push to main:
  1. All above checks
  2. Deploy to staging              (Railway staging environment)
  3. Run smoke tests against staging
  4. Deploy API to production       (Railway → AWS ECS)
  5. Deploy AI pipeline             (Railway → AWS ECS)
  6. Next.js auto-deploys via Vercel (connected to GitHub)
  7. Run database migration         (prisma migrate deploy)
  8. Tag release (semantic versioning)

Zero-Downtime Deployment:
  → Node.js: graceful shutdown (drain requests before exit)
  → Database migrations: forward-compatible only (never break existing code)
  → Feature flags: new features dark-deployed (off by default)
  → Canary: 10% traffic to new version → monitor → 100%

Rollback Strategy:
  → All deployments reversible within 5 minutes
  → Railway: one-click rollback to previous image
  → Vercel: instant rollback to previous deployment
  → Database: forward migrations only (no rollback SQL)
    → If bug in migration: write new forward migration to fix
```

### Environment Strategy

```
ENVIRONMENTS:
  Development:  Local (Docker Compose: Postgres + MongoDB + Redis)
  Preview:      Per-PR (Vercel preview URL + Railway preview)
  Staging:      staging.vocaply.com (production-like, separate DB)
  Production:   vocaply.com (customers)

Environment Variables:
  → Never in code (gitignored)
  → Dev: .env.local
  → Preview: Vercel environment variables
  → Production: Railway secrets + AWS Secrets Manager

Infrastructure as Code:
  → Railway: railway.toml (service config)
  → AWS (future): Terraform modules
  → Docker: Compose for local, Dockerfile for production
  → Kubernetes (future at 100K+ users): Helm charts
```

---

## 18. Scalability & Performance

### Performance Architecture

```
FRONTEND PERFORMANCE:
  Core Web Vitals Targets:
    LCP (Largest Contentful Paint): < 1.2s
    INP (Interaction to Next Paint): < 100ms
    CLS (Cumulative Layout Shift): < 0.05
    TTFB (Time to First Byte): < 200ms
    
  Strategies:
    → React Server Components (RSC): 40-60% less JS shipped
    → Streaming SSR: content appears incrementally (no blank page)
    → Code splitting: heavy features loaded on-demand (dynamic imports)
    → Image optimization: Next.js Image component (WebP, AVIF)
    → Font optimization: next/font (preload, no CLS)
    → Bundle size: target < 150KB First Load JS
    → Turbo cache: Turborepo remote cache (90% faster CI builds)

BACKEND PERFORMANCE:
  API Latency Targets:
    Simple reads (GET single resource): P95 < 100ms
    Paginated lists: P95 < 200ms
    Analytics queries: P95 < 500ms
    Async operations (meetings): N/A (async, tracked via job ID)
  
  Strategies:
    → Redis caching: all frequently-read data cached (5 min TTL)
    → N+1 prevention: Prisma select with include (eager loading)
    → Pagination: cursor-based (no OFFSET at scale)
    → Connection pooling: PgBouncer (Supabase built-in)
    → Query optimization: covering indexes for common query patterns
    → Read replicas: PostgreSQL read replica for analytics queries
```

### Horizontal Scaling Strategy

```
SCALING TRIGGERS:
  API servers:        > 500 requests/second per instance
  AI Pipeline:        > 50 concurrent extractions
  WebSocket servers:  > 10,000 concurrent connections per instance
  PostgreSQL:         > 1,000 reads/second (add read replica)
  Redis:              > 100,000 operations/second (Redis Cluster)
  MongoDB:            > 10M documents (enable sharding by team_id)

STATELESS DESIGN (Required for horizontal scaling):
  → No in-memory state on API servers (everything in Redis or DB)
  → Socket.io: Redis adapter for multi-server pub/sub
  → JWT: stateless (no server-side session storage needed)
  → Bull queues: Redis-backed (workers are stateless)

LOAD BALANCING:
  → Nginx: Layer 7 load balancing (round-robin default)
  → WebSocket sticky sessions: by userId hash (ensures same user → same server)
    (Required because Socket.io connection state is per-server)
  → API: true stateless → pure round-robin

DATABASE SCALING:
  Phase 1 (0-10K teams):
    → Single PostgreSQL primary (Supabase Pro)
    → MongoDB Atlas M30 (3-node replica set)
    → Redis Upstash (serverless, auto-scales)
    
  Phase 2 (10K-100K teams):
    → PostgreSQL: Add 2 read replicas (analytics queries routed to replicas)
    → MongoDB: Enable Atlas sharding (shard key: team_id)
    → Redis: Move to ElastiCache cluster mode
    
  Phase 3 (100K+ teams):
    → PostgreSQL: Consider CockroachDB or Vitess for distributed SQL
    → MongoDB: Multiple shard clusters (by region)
    → Separate analytics DB: ClickHouse for time-series queries
```

### Capacity Estimates (Back-of-Envelope)

```
STORAGE ESTIMATES (at 10,000 teams on GROWTH plan):
  Average team: 120 meetings/month
  Total meetings/month: 10,000 × 120 = 1,200,000
  
  Per meeting storage:
    PostgreSQL rows (commitments, action_items, etc.): ~10KB
    MongoDB transcript: ~60KB average
    Total per meeting: ~70KB
  
  Monthly storage growth:
    PostgreSQL: 1.2M × 10KB = 12GB/month
    MongoDB: 1.2M × 60KB = 72GB/month
    Total: ~84GB/month
  
  Annual storage: ~1TB (manageable with Atlas + Supabase Pro)

COMPUTE ESTIMATES:
  API servers: 2-4 instances (2 vCPU, 4GB RAM each)
  AI pipeline: 4-8 instances (auto-scales based on queue depth)
  WebSocket: 2 instances (Redis adapter for state sync)
  Bull workers: 6 worker types × 2 instances = 12 worker instances

BANDWIDTH:
  Average API response: 10KB
  At 1,000 req/sec: 10KB × 1,000 = 10MB/sec = 864GB/day
  Cloudflare CDN: caches static assets (reduces origin bandwidth 80%)
  Net origin bandwidth: ~173GB/day (manageable with Cloudflare Pro)

COST AT SCALE (10,000 teams):
  Supabase (PostgreSQL): $300/month
  MongoDB Atlas: $400/month
  Redis (Upstash/ElastiCache): $150/month
  Railway/ECS (compute): $800/month
  Vercel (frontend): $200/month
  Recall.ai (bots): 1.2M meetings × $0.01/min × 30min = $360,000/month [MAJOR COST]
  Claude API (AI): 1.2M × $0.006 = $7,200/month
  Resend (email): $300/month
  Total infra: ~$370K/month
  
  Revenue at 10,000 GROWTH teams: 10,000 × $99 = $990,000/month
  Gross margin: ~62% (accounting for Recall.ai bot cost dominates)
  
  Key insight: Recall.ai bot cost is the primary driver → negotiate volume pricing
```

---

## 19. Observability & Monitoring

### Monitoring Stack

```
APPLICATION MONITORING:
  Error Tracking:    Sentry (JavaScript + Python)
    → Source maps uploaded for production debugging
    → User context: userId, teamId, plan
    → Performance monitoring: transaction traces
    → Alert: Slack notification on new error group
  
  Analytics:         PostHog
    → Product analytics: feature adoption, conversion funnel
    → Session recording (privacy-aware, PII masked)
    → Feature flags: A/B testing (prompt versions, UI experiments)
    → Revenue analytics: MRR, churn, expansion revenue
  
  Uptime:            Better Uptime / Statuspage
    → External uptime checks every 60 seconds
    → Public status page: status.vocaply.com
    → Incident communication (email + Slack to affected teams)

INFRASTRUCTURE MONITORING:
  Metrics:           Prometheus + Grafana
    → API response times (P50, P95, P99 per endpoint)
    → Error rates by endpoint and error code
    → Database query performance (slow query log → Grafana)
    → Queue depth (Bull queues) — auto-scale trigger
    → Active WebSocket connections
    → Cache hit/miss ratio (Redis)
  
  Logs:              Pino (structured JSON) → Axiom / Datadog
    → Every request logged: method, path, statusCode, latencyMs, userId, teamId
    → Every error logged: stack trace + request context
    → Every job logged: jobType, jobId, duration, success/failure
    → Retention: 30 days hot, 90 days cold
    
  Tracing:           OpenTelemetry → Jaeger
    → Distributed traces: API → Queue → Worker → AI Pipeline
    → Find bottlenecks in the extraction pipeline
    → Correlation ID propagated across all services
```

### Alerting Rules

```
CRITICAL (Page on-call immediately):
  → API error rate > 5% for 5 minutes
  → Database connection failures > 10 in 1 minute
  → Payment webhook failures > 3 in 10 minutes
  → Recall.ai webhook failures > 10 in 5 minutes

WARNING (Slack alert, no page):
  → API P95 latency > 500ms for 10 minutes
  → Queue depth > 500 jobs in extract.queue
  → Cache hit ratio < 70% (cache ineffective)
  → AI pipeline error rate > 2%
  → Memory usage > 85% on any instance

INFO (Daily digest):
  → New team signups
  → MRR change (upgrades / downgrades / churn)
  → Total meetings processed
  → Average extraction accuracy (from user feedback)

SLO (Service Level Objectives):
  → API availability: 99.9% monthly (< 45 min downtime/month)
  → Meeting processing: 95% of meetings processed within 15 min of end
  → Extraction accuracy: > 88% F1 score (measured weekly)
  → Alert delivery: 99% of alerts delivered within 5 min of trigger
```

---

## 20. Compliance & Privacy

### GDPR Compliance Architecture

```
GDPR REQUIREMENTS:

Lawful Basis:
  → Meeting transcription: Legitimate interest + Consent (bot announces recording)
  → Marketing emails: Opt-in consent (checkbox at signup)
  → Analytics: Legitimate interest (product improvement)

Data Subject Rights:
  Right to Access:
    → GET /api/v1/me/data → full data export (JSON)
    → Includes: profile, commitments, meeting summaries
    → Delivered within 72 hours (automated for standard, manual for complex)
  
  Right to Erasure:
    → DELETE /api/v1/auth/me
    → User data: deleted within 30 days
    → Commitments: anonymized (ownerId → null, text retained for team analytics)
    → Transcripts: speaker identification removed
    → Third-party deletion: notify Jira, Linear, Slack of deletions
  
  Right to Portability:
    → POST /api/v1/teams/export → ZIP with all team data in CSV/JSON
    → Machine-readable format
  
  Right to Rectification:
    → Users can edit profile, timezone
    → Managers can edit commitment text (with audit trail)
  
  Right to Object:
    → Unsubscribe from marketing (one-click)
    → Opt out of analytics tracking (DoNotTrack header respected)

Data Minimization:
  → Only collect data necessary for the service
  → Transcript word-level timestamps: retained only during processing
  → After processing: timestamps compressed (turn-level only)
  → IP addresses: stored for security (rate limiting), not for profiling
  → User agent: stored for session display, not for tracking

Data Residency:
  → EU customers: data stored in eu-west-1 (Ireland)
  → US customers: us-east-1 (Virginia)
  → Planned: data residency selector in enterprise settings
```

### SOC 2 Type II Roadmap

```
TRUST SERVICE CRITERIA:

Security (CC):
  CC6.1 — Logical and physical access controls: ✅
    → RBAC, MFA, SSO, session management
    → Physical: hosted on AWS/Supabase (SOC 2 certified providers)
  
  CC6.2 — Authentication: ✅
    → bcrypt passwords, JWT, OAuth, SAML, MFA
  
  CC6.3 — Authorization: ✅
    → RBAC + ABAC, tenant isolation, RLS
  
  CC7.1 — Change management: 🔄 (in progress)
    → CI/CD pipeline, code reviews, deployment approvals
  
  CC7.2 — Risk monitoring: 🔄
    → Sentry error tracking, anomaly detection (planned)

Availability (A):
  A1.1 — Availability commitments: ✅
    → 99.9% SLA, status page, incident response plan
  
  A1.2 — Capacity planning: ✅
    → Horizontal scaling, capacity estimates, alert thresholds

Confidentiality (C):
  C1.1 — Confidential information identified: ✅
    → PII classification, encryption at rest + transit
  
  C1.2 — Confidential information disposed of: ✅
    → Data deletion jobs, export-then-delete flows

Processing Integrity (PI):
  PI1.1 — Processing complete/accurate: 🔄
    → AI accuracy monitoring, user feedback loop
    → Audit logs for all data modifications

Timeline:
  → Q1 2026: Internal audit, gap analysis
  → Q2 2026: Remediation of gaps
  → Q3 2026: External auditor engaged
  → Q4 2026: SOC 2 Type II certification achieved
```

---

## 21. Disaster Recovery & Business Continuity

### Recovery Objectives

```
RTO (Recovery Time Objective — max downtime):
  API + Frontend:     1 hour (critical path)
  Database:           4 hours (complex recovery)
  AI Pipeline:        8 hours (non-critical, meetings queue up)
  Notification system: 4 hours (alerts delayed, not lost)

RPO (Recovery Point Objective — max data loss):
  PostgreSQL:    15 minutes (Point-in-Time Recovery, continuous WAL archiving)
  MongoDB:       15 minutes (Atlas continuous backup)
  Redis:         0 minutes for queues (persistent AOF mode)
                 1 hour for cache (cache miss acceptable, rebuilds automatically)
```

### Backup Architecture

```
PostgreSQL (Supabase):
  → Continuous WAL archiving to S3 (Point-in-Time Recovery)
  → Daily automated snapshots (retained 30 days)
  → Cross-region snapshot copy: us-east-1 → eu-west-1
  → Restore test: monthly automated restore test to staging

MongoDB Atlas:
  → Continuous backup (Point-in-Time Recovery)
  → Daily snapshots (retained 30 days)
  → Atlas cross-region backup (M30+ tier)

Redis:
  → RDB snapshots: every 15 minutes to S3
  → AOF (Append-Only File): fsync every second
  → Redis cluster: 3 nodes (1 primary + 2 replicas) → automatic failover

S3 (Audio/video files):
  → Versioning enabled (accidental deletion protection)
  → Cross-region replication to us-west-2
  → Glacier archiving after 90 days (cost optimization)
```

### Failure Scenarios & Mitigation

```
SCENARIO 1: API Server Crash
  Detection: Load balancer health check → unhealthy
  Action: Railway/ECS auto-restarts container
  RTO: < 2 minutes (auto-recovery)
  Prevention: Multiple instances (2+ always running)

SCENARIO 2: PostgreSQL Primary Failure
  Detection: Supabase monitoring → automatic
  Action: Automatic failover to standby replica
  RTO: 1-3 minutes (Supabase handles automatically)
  Data loss: < 1 minute (streaming replication lag)

SCENARIO 3: Recall.ai Outage (Bot Provider)
  Detection: Bot webhook failures + alert
  Action:
    → New meeting scheduling: pause, queue for retry
    → In-progress meetings: continue recording, transcript delayed
    → Alert: status page + customer email if > 30 min
  Mitigation: Evaluate secondary bot provider (alternative: Recall.ai + Symbl.ai)
  RTO: Dependent on Recall.ai (out of our control)
  Resilience: Queue meetings during outage → auto-process when restored

SCENARIO 4: Anthropic Claude API Outage
  Detection: API error rate spike
  Action:
    → Queue extraction jobs (Bull queue stores safely in Redis)
    → Alert: team + status page
    → Fallback (planned): GPT-4o-mini for extraction during Claude outage
    → Auto-retry: every 5 minutes until Claude available
  RTO: Meetings process in batch when Claude restored (< 2 hour delay)

SCENARIO 5: Total Region Failure (AWS us-east-1)
  Detection: External uptime monitor
  Action:
    → Frontend: Vercel global edge (automatic failover)
    → API: Manual failover to us-west-2 (2 hour RTO)
    → Database: Promote cross-region replica
  RTO: 4-8 hours (major incident, all hands)
  Prevention: Multi-region architecture (Phase 2 after $1M ARR)
```

---

## 22. System Capacity Estimates

### Traffic Projections

```
GROWTH TRAJECTORY:
  Month 1:   50 teams    → ~3,000 meetings/month
  Month 6:   500 teams   → ~30,000 meetings/month
  Month 12:  2,000 teams → ~120,000 meetings/month
  Month 24:  10,000 teams → ~600,000 meetings/month
  Month 36:  50,000 teams → ~3,000,000 meetings/month

API REQUEST ESTIMATES (Month 12 — 2,000 teams):
  Dashboard page loads: 2,000 teams × 10 active users × 20 API calls/day
    = 400,000 API calls/day = ~5 req/sec (very manageable)
  
  WebSocket connections:
    Active users during business hours: ~3,000 concurrent
    Per server capacity: 10,000 connections
    Servers needed: 1 (with 2 for redundancy)
  
  AI Extractions:
    120,000 meetings/month = 4,000/day = 167/hour = ~3/min
    Extraction time: 30 seconds average
    Parallel workers needed: 3 × 2 = 6 worker instances (with buffer)
  
  Queue Depths:
    Peak hours (9-11 AM across time zones):
      extract.queue: ~50 jobs queued (spike during global standup time)
      notify.queue: ~100 jobs (post-meeting notifications)
    These are completely manageable with current worker setup

STORAGE AT MONTH 12 (2,000 teams):
  PostgreSQL: 2,000 teams × 120 meetings × 10KB = 2.4GB/month
  MongoDB: 2,000 teams × 120 meetings × 60KB = 14.4GB/month
  Total growth: ~17GB/month
  Annual: ~200GB — easily fits in Supabase Pro + Atlas M30

ANNUAL REVENUE PROJECTIONS:
  Conservative (50% GROWTH, 30% STARTER, 20% FREE):
    Month 12: 1,600 paying teams
    → 800 GROWTH × $99 + 600 STARTER × $49 = $108,600/month → $1.3M ARR
  
  Optimistic (70% GROWTH):
    Month 12: 1,600 paying teams
    → 1,120 GROWTH × $99 + 480 STARTER × $49 = $134,400/month → $1.6M ARR
```

### Technology Stack Summary

```
COMPLETE STACK:

FRONTEND:
  Framework:       Next.js 14 (App Router, RSC, Streaming SSR)
  Language:        TypeScript (strict mode)
  Styling:         Tailwind CSS + CSS Variables (design tokens)
  Components:      shadcn/ui (accessible, unstyled base)
  State:           Zustand (global) + TanStack Query (server state) + Jotai (AI streaming)
  Real-time:       Socket.io client
  Forms:           React Hook Form + Zod
  Animation:       Framer Motion
  Testing:         Vitest (unit) + Playwright (E2E)
  Deployment:      Vercel (Edge Network)

BACKEND (API):
  Framework:       Express.js (Node.js)
  Language:        TypeScript (strict mode)
  ORM:             Prisma
  Authentication:  Custom JWT + bcrypt + OAuth + SAML
  Validation:      Zod
  Queues:          Bull (Redis-backed)
  Real-time:       Socket.io (Redis adapter for multi-server)
  Email:           Resend + React Email
  Logging:         Pino (structured JSON)
  Testing:         Jest + Supertest

AI PIPELINE:
  Framework:       FastAPI (Python 3.11+)
  AI Engine:       Anthropic Claude (haiku for extraction, sonnet for complex)
  NLP:             scikit-learn (TF-IDF similarity)
  Validation:      Pydantic
  Testing:         pytest

DATABASES:
  Primary:         PostgreSQL 15 (Supabase)
  Documents:       MongoDB 6.0 (Atlas)
  Cache/Queue:     Redis 7 (Upstash)
  Storage:         Cloudflare R2

INFRASTRUCTURE:
  Frontend:        Vercel
  API + Workers:   Railway → AWS ECS Fargate
  AI Pipeline:     Railway → AWS ECS Fargate
  CI/CD:           GitHub Actions + Turborepo
  Monitoring:      Sentry + PostHog + Prometheus/Grafana
  CDN:             Cloudflare

EXTERNAL SERVICES:
  Bot recording:   Recall.ai
  Payments:        Stripe
  Email:           Resend
  Error tracking:  Sentry
  Analytics:       PostHog
  OAuth:           Google + GitHub + Microsoft
  SSO:             SAML 2.0 + OIDC (Okta, Azure AD)
```

---

## Appendix A — Module Dependency Map

```
                    ┌─────────────────────┐
                    │   Identity & Auth   │ ← Foundation, no deps
                    └──────────┬──────────┘
                               │
              ┌────────────────┴──────────────┐
              │           Teams               │ ← Depends on Auth
              └────────────────┬──────────────┘
                               │
     ┌─────────────────────────┼──────────────────────────┐
     │                         │                          │
     ▼                         ▼                          ▼
┌─────────┐             ┌─────────────┐           ┌──────────────┐
│ Billing │             │  Meetings   │           │ Integrations │
│         │             │  + Bot      │           │              │
└────┬────┘             └──────┬──────┘           └──────┬───────┘
     │                         │                         │
     │                    ┌────▼────┐                    │
     │                    │  AI     │                    │
     │                    │ Pipeline│                    │
     │                    └────┬────┘                    │
     │                         │                         │
     │               ┌─────────▼──────────┐              │
     │               │   Commitments &     │◄─────────────┘
     │               │   Accountability    │
     │               └─────────┬──────────┘
     │                         │
     │               ┌─────────▼──────────┐
     │               │    Notifications   │
     │               └─────────┬──────────┘
     │                         │
     └─────────────────────────▼
                     ┌─────────────────┐
                     │    Analytics    │ ← Reads from all modules
                     └─────────────────┘
```

## Appendix B — Critical Path for MVP

```
MUST HAVE (Day 1 launch):
  ✅ Email/password authentication
  ✅ Google OAuth
  ✅ Team creation + member invite
  ✅ Google Calendar sync
  ✅ Recall.ai bot (Zoom + Meet)
  ✅ Claude AI extraction (commitments + action items)
  ✅ Commitment tracker (PENDING/FULFILLED/MISSED)
  ✅ Jira sync (basic)
  ✅ Slack notifications (post-meeting summary)
  ✅ Dashboard (commitments, recent meetings)
  ✅ Stripe billing (GROWTH plan launch)

SHOULD HAVE (Month 2-3):
  ⚡ Cross-meeting memory (commitment resolver)
  ⚡ Commitment scoring per member
  ⚡ Team health analytics
  ⚡ Microsoft Teams bot support
  ⚡ Linear sync
  ⚡ Deadline reminder emails

NICE TO HAVE (Month 4-6):
  🔮 SAML SSO (for enterprise)
  🔮 SCIM provisioning
  🔮 MFA (TOTP)
  🔮 WebAuthn
  🔮 Notion sync
  🔮 Custom webhook registration
  🔮 API keys for developers
  🔮 Multi-language support (Spanish, German)
```

---

*Document: HLD-001 | Vocaply | High Level System Design | Version 1.0 | May 2026*  
*Author: Engineering Architecture Team*  
*Status: Draft for Review*  
*Competing with: Fireflies.ai · Otter.ai · Grain · Gong · Chorus*  
*Target: Production-Grade SaaS · 1M+ Users · Enterprise-Ready*
