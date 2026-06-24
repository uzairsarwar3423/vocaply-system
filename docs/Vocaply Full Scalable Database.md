# Vocaply — Full Scalable Industry-Level Database Schema
> Senior Database Architect Edition | Production-Grade | 1M+ Users | Multi-Tenant SaaS
> Primary DB: PostgreSQL 15 (Supabase) · Document DB: MongoDB Atlas · Cache/Queue: Redis
> Document: DB-SCHEMA-001 | Version 2.0 | June 2026

---

## Table of Contents

1. [Database Strategy & Architecture Decisions](#1-database-strategy--architecture-decisions)
2. [PostgreSQL — Complete Schema DDL](#2-postgresql--complete-schema-ddl)
   - 2.1 Enums
   - 2.2 Auth & Identity Tables
   - 2.3 Teams & Membership Tables
   - 2.4 Meetings & Bot Tables
   - 2.5 Commitment Engine Tables (Core)
   - 2.6 Integration & OAuth Tables
   - 2.7 Billing & Subscription Tables
   - 2.8 Analytics & Usage Tables
   - 2.9 Notification Tables
   - 2.10 API Keys & Webhooks Tables
3. [PostgreSQL — Complete Prisma Schema](#3-postgresql--complete-prisma-schema)
4. [Index Strategy](#4-index-strategy)
5. [Constraint & Rule Design](#5-constraint--rule-design)
6. [MongoDB — Collection Schemas](#6-mongodb--collection-schemas)
7. [Redis — Key Space Design](#7-redis--key-space-design)
8. [Multi-Tenancy Architecture](#8-multi-tenancy-architecture)
9. [Encryption Design](#9-encryption-design)
10. [Row-Level Security (RLS) Policies](#10-row-level-security-rls-policies)
11. [Data Relationships & ER Overview](#11-data-relationships--er-overview)
12. [Partitioning & Archival Satatrategy](#12-partitioning--archival-strategy)
13. [Migration Strategy](#13-migration-strategy)
14. [Capacity Estimates](#14-capacity-estimates)
15. [Cleanup & Retention Jobs](#15-cleanup--retention-jobs)
16. [Critical Query Patterns](#16-critical-query-patterns)
17. [Schema Summary](#17-schema-summary)

---

## 1. Database Strategy & Architecture Decisions

### Why Three Databases

```
DATABASE          ENGINE              USE CASE
──────────────────────────────────────────────────────────────────────────────
PostgreSQL        Supabase (RDS)      All structured relational data.
                                      ACID compliance for commitments,
                                      billing, auth. Complex JOINs for
                                      analytics. Row-Level Security for
                                      multi-tenant isolation.

MongoDB           Atlas               Meeting transcripts (20KB–500KB each).
                                      Variable schema — evolves with Recall.ai.
                                      Full-text search via Atlas Search
                                      (Lucene). Horizontal sharding by team_id.

Redis             Upstash             Bull job queues (5 queue types).
                                      Rate limiting counters (sliding window).
                                      OAuth CSRF state tokens (10-min TTL).
                                      Bot deduplication flags.
                                      Cache layer for hot reads.
                                      Session presence tracking.
──────────────────────────────────────────────────────────────────────────────
```

### Design Principles Applied

```
1. TENANT ISOLATION FIRST
   Every tenant table carries team_id on every row.
   Three layers: application code + Prisma middleware + PostgreSQL RLS.
   Cross-tenant leakage is architecturally impossible.

2. IMMUTABLE AUDIT LOG DESIGN
   usage_events: append-only, never updated.
   commitment status history: tracked via status column transitions.
   token tables: used_at instead of DELETE (audit trail preserved).

3. CUID2 IDENTIFIERS (not UUID)
   Format: {prefix}_{cuid2}  e.g. usr_clx01abc123
   Shorter, URL-safe, k-sortable (roughly time-ordered).
   Prefix makes log debugging instant.
   Prefixes: usr_ | team_ | mtg_ | com_ | ai_ | dec_ | blk_ |
             int_ | sub_ | inv_ | key_ | job_ | whk_ | evt_

4. DENORMALIZATION WHERE IT MATTERS
   users.commitment_score: denormalized from commitments table.
   teams.meetings_used: denormalized counter for quota checks.
   Both updated via triggers/workers. Avoids expensive counts on
   every dashboard load.

5. SOFT DELETES ONLY FOR CRITICAL DATA
   Commitments: CANCELLED status (not DELETE — preserve audit trail).
   Users: anonymize PII, retain rows (team data integrity).
   Meetings: hard delete allowed by ADMIN (cascade configured).

6. JSONB FOR CONFIGURATION, NOT DATA
   team.settings: flexible config that changes per customer.
   team_integration.metadata: provider-specific config blob.
   notification_preferences: per-user channel + type toggles.
   Indexed with GIN where filtering needed.

7. TIMESTAMPS — ALWAYS TIMESTAMPTZ (UTC)
   Every table has created_at TIMESTAMPTZ NOT NULL DEFAULT NOW().
   Mutable tables have updated_at TIMESTAMPTZ (via trigger).
   Time-series tables (usage_events) use occurred_at.
   All stored as UTC; display timezone conversion in application layer.

8. FOREIGN KEY BEHAVIOR IS EXPLICIT
   ON DELETE CASCADE:   auth tokens, participants, meeting data.
                        Deleting a meeting cascades its commitments.
   ON DELETE SET NULL:  optional references. commitments.resolved_in_meeting_id.
                        Deleting a meeting doesn't wipe commitment history.
   ON DELETE RESTRICT:  billing — never cascade-delete subscription data.
```

---

## 2. PostgreSQL — Complete Schema DDL

### 2.1 Enums

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- ENUM TYPES
-- All enums use SCREAMING_SNAKE_CASE convention.
-- Never use plain VARCHAR for status columns — enums are self-documenting
-- and DB-level validated.
-- ─────────────────────────────────────────────────────────────────────────

-- User roles within a team
CREATE TYPE user_role AS ENUM (
  'OWNER',        -- Team creator. Exactly one per team. Cannot be changed.
  'ADMIN',        -- Full management: billing, integrations, member removal.
  'MANAGER',      -- Can view all data + modify any member's commitments.
  'MEMBER'        -- Can only manage own commitments.
);

-- Billing plan tiers
CREATE TYPE plan_type AS ENUM (
  'FREE',
  'STARTER',
  'GROWTH',
  'BUSINESS',
  'ENTERPRISE'
);

-- Meeting platforms supported
CREATE TYPE platform_type AS ENUM (
  'ZOOM',
  'GOOGLE_MEET',
  'TEAMS',
  'WEBEX',
  'MANUAL'        -- Manually uploaded transcript, no bot
);

-- Meeting processing state machine
-- Valid transitions documented in application layer.
CREATE TYPE meeting_status AS ENUM (
  'SCHEDULED',    -- Bot scheduled, meeting has not started
  'BOT_JOINING',  -- Bot dispatched, attempting to join room
  'RECORDING',    -- Bot in meeting, actively recording
  'PROCESSING',   -- Meeting ended, AI extraction in progress
  'DONE',         -- Extraction complete, data available (terminal)
  'FAILED',       -- Bot failed or extraction failed (terminal, retryable)
  'CANCELLED'     -- Meeting cancelled before recording started (terminal)
);

-- Commitment lifecycle
CREATE TYPE commitment_status AS ENUM (
  'PENDING',      -- Active, deadline not yet reached
  'FULFILLED',    -- Marked done by owner/manager OR AI-detected completion
  'MISSED',       -- Deadline passed, no update (auto-set by cron)
  'DEFERRED',     -- Due date pushed to future (tracked, not lost)
  'CANCELLED'     -- Removed from tracking by manager (with required note)
);

-- Action item priority levels
CREATE TYPE priority_level AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
);

-- Team-level integration providers
CREATE TYPE team_provider AS ENUM (
  'JIRA',
  'LINEAR',
  'SLACK',
  'NOTION'
);

-- User-level calendar providers
CREATE TYPE calendar_provider AS ENUM (
  'GOOGLE_CALENDAR',
  'OUTLOOK_CALENDAR'
);

-- Stripe subscription lifecycle
CREATE TYPE subscription_status AS ENUM (
  'active',
  'trialing',
  'past_due',
  'paused',
  'cancelled',
  'incomplete',
  'incomplete_expired',
  'unpaid'
);

-- Usage event types for billing quotas
CREATE TYPE usage_event_type AS ENUM (
  'MEETING_PROCESSED',
  'AI_EXTRACTION',
  'INTEGRATION_SYNC',
  'EXPORT_GENERATED',
  'API_CALL'
);

-- Async job states
CREATE TYPE job_status AS ENUM (
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

-- Async job types
CREATE TYPE job_type AS ENUM (
  'MEETING_PROCESS',
  'MEETING_REPROCESS',
  'TEAM_DATA_EXPORT',
  'ANALYTICS_REPORT',
  'JIRA_BULK_SYNC',
  'CALENDAR_SYNC'
);

-- Notification channels
CREATE TYPE notification_channel AS ENUM (
  'EMAIL',
  'SLACK',
  'IN_APP',
  'PUSH'
);

-- Notification types
CREATE TYPE notification_type AS ENUM (
  'MEETING_PROCESSED',
  'COMMITMENT_MISSED',
  'COMMITMENT_FULFILLED',
  'DEADLINE_TODAY',
  'DEADLINE_TOMORROW',
  'WEEKLY_DIGEST',
  'PAYMENT_FAILED',
  'PLAN_LIMIT_REACHED',
  'TEAM_INVITE',
  'MEMBER_JOINED',
  'SCORE_MILESTONE'
);

-- Webhook event types (outbound to customers)
CREATE TYPE webhook_event_type AS ENUM (
  'meeting.scheduled',
  'meeting.recording',
  'meeting.processing',
  'meeting.processed',
  'meeting.failed',
  'commitment.created',
  'commitment.fulfilled',
  'commitment.missed',
  'commitment.deferred',
  'action_item.created',
  'action_item.completed',
  'action_item.synced',
  'team.member.joined',
  'team.member.removed',
  'team.plan.upgraded',
  'team.plan.downgraded'
);

-- MFA method types
CREATE TYPE mfa_method AS ENUM (
  'TOTP',
  'WEBAUTHN',
  'BACKUP_CODE'
);
```

---

### 2.2 Auth & Identity Tables

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: users
-- Core user accounts. Supports email+password AND OAuth providers.
-- A user belongs to exactly one team (enforced at app layer).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE users (

  -- Primary key: cuid2 with usr_ prefix
  id                    VARCHAR(36)     PRIMARY KEY,

  -- ── PROFILE ──────────────────────────────────────────────────────────
  email                 VARCHAR(255)    NOT NULL UNIQUE,
  -- Always stored lowercase. Indexed. Unique across the system.

  name                  VARCHAR(255)    NOT NULL,
  avatar_url            TEXT,
  timezone              VARCHAR(100)    NOT NULL DEFAULT 'UTC',
  -- IANA timezone string: "Asia/Karachi", "America/New_York"

  locale                VARCHAR(10)     NOT NULL DEFAULT 'en',
  -- BCP 47: "en", "es", "de" — for future i18n

  -- ── CUSTOM AUTH ───────────────────────────────────────────────────────
  password_hash         VARCHAR(255),
  -- NULL for OAuth-only accounts. bcrypt 12 rounds.

  email_verified        BOOLEAN         NOT NULL DEFAULT FALSE,
  email_verified_at     TIMESTAMPTZ,
  -- Set when verification completes. Kept for audit.

  failed_login_attempts INT             NOT NULL DEFAULT 0,
  -- Incremented on wrong password, reset on success.

  locked_until          TIMESTAMPTZ,
  -- Set to NOW() + 15min after 5 failed attempts.

  -- ── OAUTH PROVIDERS ───────────────────────────────────────────────────
  google_id             VARCHAR(255)    UNIQUE,
  -- Google "sub" claim from id_token. Null if not linked.

  github_id             VARCHAR(255)    UNIQUE,
  -- GitHub user ID as string (their numeric ID cast to text).

  microsoft_id          VARCHAR(255)    UNIQUE,
  -- Azure/Microsoft account object ID. For Teams/Outlook integration.

  -- ── MFA ───────────────────────────────────────────────────────────────
  mfa_enabled           BOOLEAN         NOT NULL DEFAULT FALSE,
  totp_secret_enc       TEXT,
  -- AES-256-GCM encrypted TOTP secret. NULL if MFA not enabled.

  -- ── TEAM MEMBERSHIP ───────────────────────────────────────────────────
  team_id               VARCHAR(36)     REFERENCES teams(id) ON DELETE SET NULL,
  -- NULL during onboarding before team creation.

  role                  user_role       NOT NULL DEFAULT 'MEMBER',

  -- ── DENORMALIZED ANALYTICS (updated by score.service) ─────────────────
  commitment_score      SMALLINT        NOT NULL DEFAULT 0,
  -- 0–100. Denormalized for fast member table sorting.
  -- Recalculated after every FULFILLED/MISSED event and nightly.

  -- ── ACTIVITY ──────────────────────────────────────────────────────────
  last_login_at         TIMESTAMPTZ,
  last_active_at        TIMESTAMPTZ,
  -- last_active_at: updated on authenticated API calls (sampled, not every call)

  onboarding_completed  BOOLEAN         NOT NULL DEFAULT FALSE,
  -- Drives /onboarding redirect logic.

  -- ── DELETION / GDPR ───────────────────────────────────────────────────
  deleted_at            TIMESTAMPTZ,
  -- Soft-delete marker. PII scrubbed, row retained for referential integrity.
  -- When set: email → NULL, name → 'Deleted User', avatar_url → NULL,
  --           password_hash → NULL, totp_secret_enc → NULL.

  -- ── TIMESTAMPS ────────────────────────────────────────────────────────
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_users_email
  ON users (email)
  WHERE deleted_at IS NULL;
-- Partial: allows email reuse after GDPR deletion (edge case)

CREATE INDEX idx_users_team_id
  ON users (team_id)
  WHERE team_id IS NOT NULL;

CREATE INDEX idx_users_team_role
  ON users (team_id, role)
  WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX idx_users_google_id
  ON users (google_id)
  WHERE google_id IS NOT NULL;

CREATE UNIQUE INDEX idx_users_github_id
  ON users (github_id)
  WHERE github_id IS NOT NULL;

CREATE UNIQUE INDEX idx_users_microsoft_id
  ON users (microsoft_id)
  WHERE microsoft_id IS NOT NULL;

CREATE INDEX idx_users_commitment_score
  ON users (team_id, commitment_score DESC)
  WHERE team_id IS NOT NULL AND deleted_at IS NULL;
-- For sorted member leaderboard queries

-- Trigger: auto-update updated_at on any column change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: refresh_tokens
-- Hashed refresh tokens for JWT rotation.
-- Original token NEVER stored — only SHA-256(token).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE refresh_tokens (
  id            VARCHAR(36)     PRIMARY KEY,

  user_id       VARCHAR(36)     NOT NULL
                                REFERENCES users(id) ON DELETE CASCADE,
  -- CASCADE: deleting a user wipes all their sessions immediately.

  token_hash    VARCHAR(64)     NOT NULL UNIQUE,
  -- SHA-256(original_token) as 64-char hex.

  expires_at    TIMESTAMPTZ     NOT NULL,
  -- 30 days from issuance. Sliding window (renewed on each use).

  -- ── DEVICE FINGERPRINT (for session display in /settings/security) ────
  ip_address    INET,
  -- Use INET type — PostgreSQL validates format, handles IPv4 and IPv6.

  user_agent    TEXT,
  -- Raw User-Agent string. Displayed in session list.

  device_label  VARCHAR(100),
  -- Derived: "Chrome on macOS", "Safari on iPhone". Set at creation.

  last_used_at  TIMESTAMPTZ,
  -- Updated asynchronously on every refresh. Not on every API call.

  -- ── SECURITY ──────────────────────────────────────────────────────────
  reuse_detected_at TIMESTAMPTZ,
  -- If a rotated (deleted) token is replayed, this is set and ALL
  -- user sessions are revoked (token theft signal).

  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id
  ON refresh_tokens (user_id);

CREATE UNIQUE INDEX idx_refresh_tokens_token_hash
  ON refresh_tokens (token_hash);

CREATE INDEX idx_refresh_tokens_expires_at
  ON refresh_tokens (expires_at);
-- For cleanup cron: DELETE WHERE expires_at < NOW()


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: email_verification_tokens
-- One-time tokens for email address verification.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE email_verification_tokens (
  id            VARCHAR(36)     PRIMARY KEY,

  user_id       VARCHAR(36)     NOT NULL
                                REFERENCES users(id) ON DELETE CASCADE,

  token_hash    VARCHAR(64)     NOT NULL UNIQUE,
  -- SHA-256(url_token). URL carries original, DB stores hash.

  expires_at    TIMESTAMPTZ     NOT NULL,
  -- 24 hours. Longer than password reset — less urgent.

  -- No used_at column — row deleted on consumption (one-time use).
  -- If already used: row not found = "invalid or already used" error.

  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_email_verify_token_hash
  ON email_verification_tokens (token_hash);

CREATE INDEX idx_email_verify_user_id
  ON email_verification_tokens (user_id);


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: password_reset_tokens
-- One-time tokens for password reset flow.
-- Shorter TTL than email verification. used_at preserved for audit.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE password_reset_tokens (
  id            VARCHAR(36)     PRIMARY KEY,

  user_id       VARCHAR(36)     NOT NULL
                                REFERENCES users(id) ON DELETE CASCADE,

  token_hash    VARCHAR(64)     NOT NULL UNIQUE,

  expires_at    TIMESTAMPTZ     NOT NULL,
  -- 1 hour TTL. Shorter than email verify — more sensitive operation.

  used_at       TIMESTAMPTZ,
  -- NULL = not yet used. Set when consumed. Row kept for 30-day audit.
  -- After use: WHERE used_at IS NOT NULL OR expires_at < NOW() → reject.

  ip_address    INET,
  -- IP of the reset request. Audit trail for security investigations.

  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_pwd_reset_token_hash
  ON password_reset_tokens (token_hash);

CREATE INDEX idx_pwd_reset_user_id
  ON password_reset_tokens (user_id);


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: mfa_credentials
-- Stores MFA credentials per user (TOTP device, WebAuthn key, backup codes).
-- A user can have multiple credentials (multiple devices).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE mfa_credentials (
  id              VARCHAR(36)     PRIMARY KEY,

  user_id         VARCHAR(36)     NOT NULL
                                  REFERENCES users(id) ON DELETE CASCADE,

  method          mfa_method      NOT NULL,

  -- ── TOTP FIELDS ───────────────────────────────────────────────────────
  totp_secret_enc TEXT,
  -- AES-256-GCM encrypted TOTP secret. NULL for non-TOTP.

  -- ── WEBAUTHN FIELDS ───────────────────────────────────────────────────
  webauthn_credential_id   BYTEA,
  webauthn_public_key      BYTEA,
  webauthn_sign_count      BIGINT DEFAULT 0,
  -- sign_count for WebAuthn clone detection.

  -- ── BACKUP CODE FIELDS ────────────────────────────────────────────────
  backup_code_hash  VARCHAR(64),
  -- SHA-256 of backup code. One row per code (10 rows generated at setup).
  backup_code_used  BOOLEAN       NOT NULL DEFAULT FALSE,

  -- ── METADATA ──────────────────────────────────────────────────────────
  label           VARCHAR(100),
  -- User-supplied label: "My iPhone", "YubiKey 5C".

  last_used_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mfa_user_id
  ON mfa_credentials (user_id);

CREATE INDEX idx_mfa_user_method
  ON mfa_credentials (user_id, method);

CREATE UNIQUE INDEX idx_mfa_webauthn_credential_id
  ON mfa_credentials (webauthn_credential_id)
  WHERE webauthn_credential_id IS NOT NULL;
```

---

### 2.3 Teams & Membership Tables

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: teams
-- The billing unit. Everything is scoped to a team.
-- A team may have 1 owner, N admins, N managers, N members.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE teams (
  id                    VARCHAR(36)     PRIMARY KEY,

  -- ── IDENTITY ──────────────────────────────────────────────────────────
  name                  VARCHAR(255)    NOT NULL,

  slug                  VARCHAR(100)    NOT NULL UNIQUE,
  -- URL-safe identifier: lowercase letters, numbers, hyphens only.
  -- Auto-generated from name if not provided. Globally unique.
  -- Used in: team URLs, Slack workspace naming, API references.

  -- ── BILLING ───────────────────────────────────────────────────────────
  plan                  plan_type       NOT NULL DEFAULT 'FREE',

  stripe_customer_id    VARCHAR(255)    UNIQUE,
  -- "cus_abc123". NULL until first payment attempt.
  -- Never expose to frontend — internal reference only.

  stripe_sub_id         VARCHAR(255)    UNIQUE,
  -- "sub_xyz789". NULL on FREE plan.

  -- ── USAGE COUNTERS (DENORMALIZED for fast quota checks) ───────────────
  meetings_used         INT             NOT NULL DEFAULT 0,
  -- Reset to 0 at billing cycle start (Stripe webhook triggers this).
  -- Incremented +1 when meeting status → DONE.

  billing_cycle_start   TIMESTAMPTZ,
  billing_cycle_end     TIMESTAMPTZ,
  -- From Stripe. Used to display "X meetings remaining this month".

  -- ── CONFIGURATION ─────────────────────────────────────────────────────
  settings              JSONB           NOT NULL DEFAULT '{}',
  -- Schema:
  -- {
  --   "defaultTimezone":         "Asia/Karachi",
  --   "weeklyDigestEnabled":     true,
  --   "weeklyDigestDay":         "MONDAY",
  --   "slackDefaultChannelId":   "C12345ABC",
  --   "slackDefaultChannelName": "#engineering",
  --   "notifyMissedCommitments": true,
  --   "reminderHoursBefore":     24,
  --   "botJoinMinutesBefore":    2,
  --   "requireMFA":              false,
  --   "ssoConfigured":           false
  -- }

  -- ── SSO (Enterprise) ──────────────────────────────────────────────────
  sso_provider          VARCHAR(50),
  -- "okta" | "azure_ad" | "google_workspace" | "onelogin" | null

  sso_metadata_url      TEXT,
  -- SAML IdP metadata URL or OIDC discovery URL.

  sso_entity_id         TEXT,
  -- SAML Service Provider entity ID for this team.

  scim_token_hash       VARCHAR(64),
  -- SHA-256(scim_bearer_token) for SCIM provisioning.

  -- ── TIMESTAMPS ────────────────────────────────────────────────────────
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_teams_slug
  ON teams (slug);

CREATE UNIQUE INDEX idx_teams_stripe_customer
  ON teams (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX idx_teams_stripe_sub
  ON teams (stripe_sub_id)
  WHERE stripe_sub_id IS NOT NULL;

CREATE INDEX idx_teams_plan
  ON teams (plan);

CREATE INDEX idx_teams_settings_gin
  ON teams USING GIN (settings jsonb_path_ops);
-- Enables: WHERE settings @> '{"weeklyDigestEnabled": true}'

CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: team_invitations
-- Pending invitations to join a team.
-- Separate from users table — invitee may not have an account yet.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE team_invitations (
  id              VARCHAR(36)     PRIMARY KEY,

  team_id         VARCHAR(36)     NOT NULL
                                  REFERENCES teams(id) ON DELETE CASCADE,

  invited_email   VARCHAR(255)    NOT NULL,
  -- Lowercased. The email the invite was sent to.

  invited_role    user_role       NOT NULL DEFAULT 'MEMBER',

  invited_by_id   VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,

  token_hash      VARCHAR(64)     NOT NULL UNIQUE,
  -- SHA-256(invite_token). Token in URL, hash in DB.

  expires_at      TIMESTAMPTZ     NOT NULL,
  -- 7 days from creation.

  accepted_at     TIMESTAMPTZ,
  -- Set when invite is claimed. Row kept for audit.

  accepted_by_id  VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  -- The user who accepted (may differ from invited_email if they
  -- logged in with a different account — handled at app layer).

  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_team_inv_token_hash
  ON team_invitations (token_hash);

CREATE INDEX idx_team_inv_team_id
  ON team_invitations (team_id);

CREATE INDEX idx_team_inv_email
  ON team_invitations (invited_email);

CREATE INDEX idx_team_inv_pending
  ON team_invitations (team_id, expires_at)
  WHERE accepted_at IS NULL;
-- For "show pending invitations" query
```

---

### 2.4 Meetings & Bot Tables

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: meetings
-- Meeting records and Recall.ai bot lifecycle tracking.
-- State machine: SCHEDULED → BOT_JOINING → RECORDING → PROCESSING → DONE
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE meetings (
  id                      VARCHAR(36)     PRIMARY KEY,

  -- ── TENANT ISOLATION ──────────────────────────────────────────────────
  team_id                 VARCHAR(36)     NOT NULL
                                          REFERENCES teams(id) ON DELETE CASCADE,

  -- ── IDENTITY ──────────────────────────────────────────────────────────
  title                   VARCHAR(500)    NOT NULL,

  platform                platform_type   NOT NULL,

  meeting_url             TEXT            NOT NULL,
  -- Full join URL: "https://zoom.us/j/123456789?pwd=abc"

  platform_meeting_id     VARCHAR(255),
  -- Extracted platform ID for deduplication.
  -- Zoom: "123456789", Google Meet: "abc-defg-hij", Teams: full URL hash.

  -- ── BOT TRACKING ──────────────────────────────────────────────────────
  recall_bot_id           VARCHAR(255),
  -- Recall.ai bot object ID: "bot_abc123def456". NULL before scheduling.

  recall_bot_status       VARCHAR(50),
  -- Latest raw status string from Recall.ai (for debugging).
  -- Different from our status machine — kept for support investigations.

  -- ── STATE MACHINE ─────────────────────────────────────────────────────
  status                  meeting_status  NOT NULL DEFAULT 'SCHEDULED',

  -- ── TIMING ────────────────────────────────────────────────────────────
  scheduled_at            TIMESTAMPTZ     NOT NULL,
  started_at              TIMESTAMPTZ,
  -- Set when bot.recording_started webhook received.

  ended_at                TIMESTAMPTZ,
  -- Set when bot.done webhook received.

  duration_minutes        SMALLINT,
  -- Computed: EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
  -- Stored for fast sorting and display (avoid repeated computation).

  -- ── CALENDAR REFERENCE ────────────────────────────────────────────────
  calendar_event_id       VARCHAR(500),
  -- Google Calendar event ID or Outlook event ID.
  -- Used for deduplication when multiple team members share the event.

  calendar_source_user_id VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  -- Which team member's calendar triggered this meeting's creation.

  -- ── DOCUMENT REFERENCE ────────────────────────────────────────────────
  mongo_transcript_id     VARCHAR(36),
  -- MongoDB ObjectId (as string) of the transcripts document.
  -- NULL until transcript is stored post-meeting.

  -- ── AI RESULTS (denormalized for fast dashboard display) ──────────────
  summary                 TEXT,
  -- 3–5 bullet AI-generated summary. NULL until DONE.

  commitment_count        SMALLINT        NOT NULL DEFAULT 0,
  action_item_count       SMALLINT        NOT NULL DEFAULT 0,
  decision_count          SMALLINT        NOT NULL DEFAULT 0,
  blocker_count           SMALLINT        NOT NULL DEFAULT 0,
  -- Denormalized counts updated after extraction. Avoids COUNT(*) joins
  -- on every meetings list request.

  participant_count       SMALLINT        NOT NULL DEFAULT 0,
  -- Set after participants are saved from Recall.ai webhook.

  -- ── PROCESSING METADATA ───────────────────────────────────────────────
  processing_started_at   TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_attempts     SMALLINT        NOT NULL DEFAULT 0,
  -- Incremented on each extraction attempt. MAX 3, then FAILED.

  processing_error        TEXT,
  -- Last error message if status = FAILED. For admin debugging.

  -- ── REPROCESSING ──────────────────────────────────────────────────────
  reprocessed_at          TIMESTAMPTZ,
  reprocessed_by_id       VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  -- Admin who triggered reprocessing. Null for initial processing.

  -- ── TIMESTAMPS ────────────────────────────────────────────────────────
  created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Core access patterns
CREATE INDEX idx_meetings_team_id
  ON meetings (team_id);

CREATE INDEX idx_meetings_team_status
  ON meetings (team_id, status);

CREATE INDEX idx_meetings_team_scheduled
  ON meetings (team_id, scheduled_at DESC);
-- Most common query: list team meetings by recency

CREATE UNIQUE INDEX idx_meetings_platform_dedup
  ON meetings (team_id, platform_meeting_id)
  WHERE platform_meeting_id IS NOT NULL;
-- Prevents duplicate bot scheduling for same meeting

CREATE UNIQUE INDEX idx_meetings_recall_bot
  ON meetings (recall_bot_id)
  WHERE recall_bot_id IS NOT NULL;
-- Webhook lookup: find meeting by bot_id

CREATE INDEX idx_meetings_calendar_event
  ON meetings (team_id, calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

CREATE INDEX idx_meetings_status_scheduled
  ON meetings (status, scheduled_at)
  WHERE status IN ('SCHEDULED', 'BOT_JOINING', 'RECORDING');
-- For "find all currently active meetings" query (small result set)

CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: meeting_participants
-- Speaker-to-user mapping for each meeting.
-- Used to map Recall.ai "Speaker 1" → actual team member.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE meeting_participants (
  id            VARCHAR(36)     PRIMARY KEY,

  meeting_id    VARCHAR(36)     NOT NULL
                                REFERENCES meetings(id) ON DELETE CASCADE,

  user_id       VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  -- NULL if participant is external (not a Vocaply team member).
  -- Matched by email from Recall.ai participant list.

  -- ── IDENTITY ──────────────────────────────────────────────────────────
  name          VARCHAR(255)    NOT NULL,
  -- Display name from Recall.ai participant list.

  email         VARCHAR(255),
  -- NULL for anonymous/external participants.

  -- ── SPEAKER MAPPING ───────────────────────────────────────────────────
  speaker_tag   VARCHAR(50),
  -- Recall.ai diarization label: "Speaker 1", "Speaker 2".
  -- Maps transcript turns to this participant.

  speaker_confidence FLOAT,
  -- 0.0–1.0. Confidence of the speaker-to-user matching.
  -- < 0.8 = shown as "Unresolved" in UI, can be manually corrected.

  -- ── TIMING ────────────────────────────────────────────────────────────
  joined_at     TIMESTAMPTZ,
  left_at       TIMESTAMPTZ,

  -- ── CORRECTION ────────────────────────────────────────────────────────
  manually_corrected    BOOLEAN     NOT NULL DEFAULT FALSE,
  corrected_by_id       VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  -- Admin manually fixed the speaker-to-user mapping.

  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_participants_meeting_email
  ON meeting_participants (meeting_id, email)
  WHERE email IS NOT NULL;
-- One record per email per meeting

CREATE INDEX idx_participants_meeting_id
  ON meeting_participants (meeting_id);

CREATE INDEX idx_participants_user_id
  ON meeting_participants (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX idx_participants_speaker_tag
  ON meeting_participants (meeting_id, speaker_tag)
  WHERE speaker_tag IS NOT NULL;
-- Used during extraction: look up userId by speakerTag
```

---

### 2.5 Commitment Engine Tables (Core)

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: commitments
-- THE CORE TABLE. Every promise made in a meeting, tracked over time.
-- Cross-meeting memory: resolved_in_meeting_id links resolution to meeting.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE commitments (
  id                      VARCHAR(36)     PRIMARY KEY,

  -- ── TENANT ISOLATION ──────────────────────────────────────────────────
  team_id                 VARCHAR(36)     NOT NULL
                                          REFERENCES teams(id) ON DELETE CASCADE,

  -- ── ORIGIN ────────────────────────────────────────────────────────────
  meeting_id              VARCHAR(36)     NOT NULL
                                          REFERENCES meetings(id) ON DELETE CASCADE,
  -- CASCADE: deleting a meeting also deletes its commitments.
  -- Note: business rule prevents deleting meetings with FULFILLED commitments.

  owner_id                VARCHAR(36)     NOT NULL
                                          REFERENCES users(id) ON DELETE CASCADE,
  -- The user who made this promise. Resolved from speaker_tag → user_id.

  -- ── CONTENT ───────────────────────────────────────────────────────────
  text                    TEXT            NOT NULL,
  -- Exact extracted text: "I'll finish the login feature by Thursday"

  normalized_text         TEXT,
  -- AI-normalized for cross-meeting similarity matching.
  -- "finish login feature" — stopwords removed, stemmed, max 5 tokens.
  -- Used by commitment_resolver.py for TF-IDF matching.

  -- ── DEADLINE ──────────────────────────────────────────────────────────
  due_date                TIMESTAMPTZ,
  -- Parsed ISO datetime. NULL if no deadline mentioned.
  -- Stored in UTC; display converts to team timezone.

  due_date_raw            VARCHAR(255),
  -- Original spoken text: "by Thursday", "before EOD Friday", "end of sprint".
  -- Preserved for display — "by Thursday" is more natural than ISO timestamp.

  -- ── STATUS MACHINE ────────────────────────────────────────────────────
  status                  commitment_status NOT NULL DEFAULT 'PENDING',

  -- ── AI METADATA ───────────────────────────────────────────────────────
  confidence_score        FLOAT           NOT NULL DEFAULT 1.0
                          CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  -- AI confidence: 0.9–1.0 = explicit; 0.7–0.8 = clear; 0.5–0.6 = probable;
  -- 0.3–0.4 = possible. Items < 0.5 filtered from display by default.

  extraction_model        VARCHAR(100),
  -- "claude-haiku-4-5-20251001". For debugging and prompt version tracking.

  -- ── RESOLUTION (cross-meeting memory) ─────────────────────────────────
  resolved_at             TIMESTAMPTZ,
  -- When status moved from PENDING → FULFILLED/MISSED/DEFERRED/CANCELLED.

  resolved_in_meeting_id  VARCHAR(36)     REFERENCES meetings(id) ON DELETE SET NULL,
  -- The meeting where the completion statement was detected.
  -- SET NULL if that meeting is deleted — keeps commitment history intact.

  -- ── DEFERRAL TRACKING ─────────────────────────────────────────────────
  original_due_date       TIMESTAMPTZ,
  -- Set when first deferred. Allows "how many times deferred?" analytics.

  deferred_count          SMALLINT        NOT NULL DEFAULT 0,
  -- Incremented each time DEFERRED. Visible in member analytics.

  deferred_note           TEXT,
  -- Manager's note when deferring: "Pushed to next sprint due to dependency".

  -- ── ALERT TRACKING ────────────────────────────────────────────────────
  reminder_sent_at        TIMESTAMPTZ,
  -- When the "deadline is today/tomorrow" reminder was sent to owner.
  -- NULL = reminder not yet sent.

  missed_alert_sent_at    TIMESTAMPTZ,
  -- When the "commitment missed" alert was sent to owner + managers.

  manager_alert_sent_at   TIMESTAMPTZ,
  -- Separate tracking for manager-specific alert (different message content).

  -- ── MANUAL OVERRIDE ───────────────────────────────────────────────────
  manual_status_by_id     VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  -- Populated when a human (not the AI/cron) changed the status.

  cancellation_note       TEXT,
  -- Required when MANAGER sets status = CANCELLED. Stored for audit.

  -- ── TIMESTAMPS ────────────────────────────────────────────────────────
  created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── INDEXES (most critical table — query patterns define these) ───────────

CREATE INDEX idx_commit_team_id
  ON commitments (team_id);

CREATE INDEX idx_commit_team_status
  ON commitments (team_id, status);
-- Most common filter: team's PENDING commitments

CREATE INDEX idx_commit_owner_id
  ON commitments (owner_id);
-- Member-specific commitment queries

CREATE INDEX idx_commit_meeting_id
  ON commitments (meeting_id);
-- Meeting detail: show commitments from this meeting

CREATE INDEX idx_commit_team_owner_status
  ON commitments (team_id, owner_id, status);
-- useMyCommitments: my PENDING commitments

CREATE INDEX idx_commit_due_date_pending
  ON commitments (team_id, due_date)
  WHERE status = 'PENDING' AND due_date IS NOT NULL;
-- CRITICAL: cron job at 9AM — find pending commitments due today
-- Partial index is dramatically faster — only scans PENDING rows

CREATE INDEX idx_commit_overdue_cron
  ON commitments (due_date)
  WHERE status = 'PENDING' AND due_date IS NOT NULL AND missed_alert_sent_at IS NULL;
-- CRITICAL: cron job at 6PM — find all past-due, unalerted commitments
-- This powers the auto-MISSED transition. Must be sub-10ms.

CREATE INDEX idx_commit_resolved_in_meeting
  ON commitments (resolved_in_meeting_id)
  WHERE resolved_in_meeting_id IS NOT NULL;
-- "Which commitments were resolved in this meeting?" (CommitmentTimeline)

CREATE INDEX idx_commit_team_created_at
  ON commitments (team_id, created_at DESC);
-- Analytics: commitments per period, trend calculation

CREATE INDEX idx_commit_confidence_filter
  ON commitments (team_id, confidence_score)
  WHERE status = 'PENDING';
-- Filter low-confidence items: WHERE confidence_score >= 0.5

CREATE TRIGGER commitments_updated_at
  BEFORE UPDATE ON commitments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: action_items
-- Tasks assigned in meetings. Different from commitments:
-- Commitments = first-person promises. Action items = assigned tasks.
-- Both extracted from same transcript but tracked differently.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE action_items (
  id                  VARCHAR(36)     PRIMARY KEY,

  -- ── TENANT ISOLATION ──────────────────────────────────────────────────
  team_id             VARCHAR(36)     NOT NULL
                                      REFERENCES teams(id) ON DELETE CASCADE,

  meeting_id          VARCHAR(36)     NOT NULL
                                      REFERENCES meetings(id) ON DELETE CASCADE,

  -- ── ASSIGNMENT ────────────────────────────────────────────────────────
  assignee_id         VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  -- NULL if assignee could not be matched to a team member.
  -- Can be manually assigned after extraction.

  assignee_name_raw   VARCHAR(255),
  -- Original name as extracted: "Ahmed", "Ahmed Hassan".
  -- Kept even after user_id match for debugging unresolved assignments.

  -- ── CONTENT ───────────────────────────────────────────────────────────
  text                TEXT            NOT NULL,
  -- "Fix the payment bug in checkout flow before release"

  -- ── SCHEDULING ────────────────────────────────────────────────────────
  due_date            TIMESTAMPTZ,
  due_date_raw        VARCHAR(255),

  priority            priority_level  NOT NULL DEFAULT 'MEDIUM',
  -- AI-inferred: "ASAP", "urgent", "blocking" → HIGH/URGENT.

  -- ── COMPLETION ────────────────────────────────────────────────────────
  completed           BOOLEAN         NOT NULL DEFAULT FALSE,
  completed_at        TIMESTAMPTZ,
  completed_by_id     VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,

  -- ── EXTERNAL INTEGRATIONS (sync references) ───────────────────────────
  jira_issue_id       VARCHAR(50),
  -- Issue key: "TECH-142". Not the Jira numeric ID.
  jira_issue_url      TEXT,
  jira_issue_synced_at TIMESTAMPTZ,

  linear_issue_id     VARCHAR(100),
  -- Linear issue UUID.
  linear_issue_url    TEXT,
  linear_issue_synced_at TIMESTAMPTZ,

  notion_page_id      VARCHAR(100),
  -- Notion page UUID.
  notion_page_url     TEXT,
  notion_page_synced_at TIMESTAMPTZ,

  -- ── AI METADATA ───────────────────────────────────────────────────────
  confidence_score    FLOAT           NOT NULL DEFAULT 1.0
                      CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),

  -- ── TIMESTAMPS ────────────────────────────────────────────────────────
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_team_id
  ON action_items (team_id);

CREATE INDEX idx_ai_meeting_id
  ON action_items (meeting_id);

CREATE INDEX idx_ai_assignee_id
  ON action_items (assignee_id)
  WHERE assignee_id IS NOT NULL;

CREATE INDEX idx_ai_team_completed
  ON action_items (team_id, completed);

CREATE INDEX idx_ai_team_priority
  ON action_items (team_id, priority)
  WHERE completed = FALSE;
-- Show incomplete items sorted by urgency

CREATE UNIQUE INDEX idx_ai_jira_issue
  ON action_items (jira_issue_id)
  WHERE jira_issue_id IS NOT NULL;
-- Jira reverse webhook: find action_item by issue key

CREATE INDEX idx_ai_linear_issue
  ON action_items (linear_issue_id)
  WHERE linear_issue_id IS NOT NULL;

CREATE TRIGGER action_items_updated_at
  BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: decisions
-- Decisions made in meetings. Extracted by AI.
-- Immutable after extraction — no status machine needed.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE decisions (
  id            VARCHAR(36)     PRIMARY KEY,

  meeting_id    VARCHAR(36)     NOT NULL
                                REFERENCES meetings(id) ON DELETE CASCADE,

  team_id       VARCHAR(36)     NOT NULL
                                REFERENCES teams(id) ON DELETE CASCADE,

  text          TEXT            NOT NULL,
  -- "Team decided to use PostgreSQL over MySQL for the new service"

  made_by       VARCHAR(255),
  -- Speaker name as extracted. May not match a user_id.

  confidence_score FLOAT        NOT NULL DEFAULT 1.0,

  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_decisions_meeting_id ON decisions (meeting_id);
CREATE INDEX idx_decisions_team_id    ON decisions (team_id);


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: blockers
-- Blockers mentioned in meetings. Has resolved state.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE blockers (
  id              VARCHAR(36)     PRIMARY KEY,

  meeting_id      VARCHAR(36)     NOT NULL
                                  REFERENCES meetings(id) ON DELETE CASCADE,

  team_id         VARCHAR(36)     NOT NULL
                                  REFERENCES teams(id) ON DELETE CASCADE,

  text            TEXT            NOT NULL,
  -- "Waiting for API credentials from the DevOps team"

  affected_user   VARCHAR(255),
  -- Who is blocked — name as extracted.

  resolved        BOOLEAN         NOT NULL DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,

  confidence_score FLOAT          NOT NULL DEFAULT 1.0,

  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blockers_meeting_id    ON blockers (meeting_id);
CREATE INDEX idx_blockers_team_unresolved
  ON blockers (team_id, resolved)
  WHERE resolved = FALSE;
-- Dashboard: show all open blockers for the team
```

---

### 2.6 Integration & OAuth Tables

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: team_integrations
-- OAuth tokens for team-level integrations: Jira, Slack, Linear, Notion.
-- Tokens AES-256-GCM encrypted at application layer before storage.
-- UNIQUE constraint: one integration per provider per team.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE team_integrations (
  id                  VARCHAR(36)     PRIMARY KEY,

  team_id             VARCHAR(36)     NOT NULL
                                      REFERENCES teams(id) ON DELETE CASCADE,

  provider            team_provider   NOT NULL,

  -- ── OAUTH TOKENS (AES-256-GCM ENCRYPTED) ─────────────────────────────
  access_token_enc    TEXT            NOT NULL,
  -- base64(iv + authTag + ciphertext). Decrypted ONLY at API call time.

  refresh_token_enc   TEXT,
  -- NULL if provider doesn't issue refresh tokens (some Slack configurations).

  token_expires_at    TIMESTAMPTZ,
  -- When access_token expires. Proactive refresh 30min before expiry.

  -- ── PROVIDER WORKSPACE IDENTITY ───────────────────────────────────────
  workspace_id        VARCHAR(255),
  -- Slack: "T12345ABC", Jira cloud ID: "a1b2c3d4-e5f6-...",
  -- Linear org ID, Notion workspace ID.

  workspace_name      VARCHAR(255),
  -- Display name: "TechFlow Engineering", "techflow.atlassian.net"

  workspace_url       TEXT,
  -- Jira base URL, Notion workspace URL, etc.

  -- ── PROVIDER-SPECIFIC SETTINGS ────────────────────────────────────────
  metadata            JSONB           NOT NULL DEFAULT '{}',
  -- Jira:   { "projectKey": "TECH", "defaultIssueType": "Task",
  --           "defaultPriority": "Medium", "cloudId": "..." }
  -- Slack:  { "defaultChannelId": "C123", "defaultChannelName": "#eng",
  --           "postMeetingSummary": true, "postCommitmentAlerts": true,
  --           "botUserId": "U123ABC" }
  -- Linear: { "teamId": "team_abc", "defaultState": "Todo",
  --           "orgId": "org_xyz" }
  -- Notion: { "databaseId": "db_abc123", "workspaceId": "ws_xyz" }

  -- ── STATUS ────────────────────────────────────────────────────────────
  is_active           BOOLEAN         NOT NULL DEFAULT TRUE,

  last_synced_at      TIMESTAMPTZ,
  -- For calendar/Jira: last time we successfully pulled/pushed data.

  last_error          TEXT,
  -- Most recent error from provider API. Cleared on success.

  consecutive_errors  SMALLINT        NOT NULL DEFAULT 0,
  -- Incremented on failure, reset on success.
  -- At 5 consecutive errors → mark inactive, alert admin.

  -- ── AUDIT ─────────────────────────────────────────────────────────────
  connected_by_id     VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  disconnected_by_id  VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,
  disconnected_at     TIMESTAMPTZ,

  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- CRITICAL: One integration per provider per team
CREATE UNIQUE INDEX idx_team_int_team_provider
  ON team_integrations (team_id, provider);

CREATE INDEX idx_team_int_team_id
  ON team_integrations (team_id);

CREATE INDEX idx_team_int_provider_active
  ON team_integrations (provider)
  WHERE is_active = TRUE;

CREATE INDEX idx_team_int_expiry
  ON team_integrations (token_expires_at)
  WHERE is_active = TRUE AND token_expires_at IS NOT NULL;
-- Token refresh cron: find integrations expiring in < 30 minutes
-- SELECT * FROM team_integrations
-- WHERE is_active = TRUE AND token_expires_at < NOW() + INTERVAL '30 minutes'

CREATE TRIGGER team_integrations_updated_at
  BEFORE UPDATE ON team_integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: user_integrations
-- Per-user calendar connections: Google Calendar, Outlook.
-- Different from team_integrations — user-level, not team-level.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE user_integrations (
  id                  VARCHAR(36)     PRIMARY KEY,

  user_id             VARCHAR(36)     NOT NULL
                                      REFERENCES users(id) ON DELETE CASCADE,

  provider            calendar_provider NOT NULL,

  -- ── OAUTH TOKENS (AES-256-GCM ENCRYPTED) ─────────────────────────────
  access_token_enc    TEXT            NOT NULL,
  refresh_token_enc   TEXT,
  -- Google always provides refresh token on first auth. Outlook varies.

  token_expires_at    TIMESTAMPTZ,

  -- ── CALENDAR SETTINGS ─────────────────────────────────────────────────
  calendar_id         VARCHAR(500),
  -- "primary" or specific calendar ID: "ali@techflow.com".
  -- For Outlook: calendar object ID.

  sync_enabled        BOOLEAN         NOT NULL DEFAULT TRUE,

  last_synced_at      TIMESTAMPTZ,
  -- When we last successfully scanned this calendar for meetings.
  -- Calendar sync cron finds: WHERE sync_enabled = TRUE
  --   AND (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '1 hour')

  next_sync_token     TEXT,
  -- Google Calendar incremental sync token. Avoids full calendar scan.
  -- After first full sync, subsequent syncs use this token for deltas only.

  -- ── ERROR TRACKING ────────────────────────────────────────────────────
  last_error          TEXT,
  consecutive_errors  SMALLINT        NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- One calendar provider per user
CREATE UNIQUE INDEX idx_user_int_user_provider
  ON user_integrations (user_id, provider);

CREATE INDEX idx_user_int_user_id
  ON user_integrations (user_id);

CREATE INDEX idx_user_int_sync_due
  ON user_integrations (last_synced_at)
  WHERE sync_enabled = TRUE;
-- Cron: find all users due for calendar sync

CREATE TRIGGER user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### 2.7 Billing & Subscription Tables

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: subscriptions
-- Stripe subscription details. One per team.
-- UNIQUE on team_id — enforces single subscription per team.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE subscriptions (
  id                          VARCHAR(36)           PRIMARY KEY,

  team_id                     VARCHAR(36)           NOT NULL UNIQUE
                                                    REFERENCES teams(id) ON DELETE RESTRICT,
  -- RESTRICT: never cascade-delete subscription data.
  -- Delete the subscription explicitly before deleting the team.

  -- ── STRIPE REFERENCES ─────────────────────────────────────────────────
  stripe_subscription_id      VARCHAR(255)          NOT NULL UNIQUE,
  -- "sub_abc123def456"

  stripe_customer_id          VARCHAR(255)          NOT NULL,
  -- "cus_xyz789abc". Denormalized from teams.stripe_customer_id.

  stripe_price_id             VARCHAR(255),
  -- "price_growth_monthly" or "price_growth_annual".

  stripe_product_id           VARCHAR(255),
  -- Stripe product ID. Useful for plan display names.

  -- ── PLAN INFO ─────────────────────────────────────────────────────────
  plan                        plan_type             NOT NULL,

  billing_interval            VARCHAR(10),
  -- "month" | "year" | NULL for free plan.

  -- ── STATUS ────────────────────────────────────────────────────────────
  status                      subscription_status   NOT NULL,

  -- ── BILLING CYCLE ─────────────────────────────────────────────────────
  current_period_start        TIMESTAMPTZ,
  current_period_end          TIMESTAMPTZ,
  -- Used to compute "billing cycle reset" for meetings_used counter.

  cancel_at_period_end        BOOLEAN               NOT NULL DEFAULT FALSE,
  -- True when user cancels but subscription still active until period end.

  cancelled_at                TIMESTAMPTZ,

  -- ── TRIAL ─────────────────────────────────────────────────────────────
  trial_start                 TIMESTAMPTZ,
  trial_end                   TIMESTAMPTZ,

  -- ── AMOUNTS ───────────────────────────────────────────────────────────
  unit_amount                 INT,
  -- Stripe amount in cents: 9900 = $99.00. For invoice history display.

  currency                    VARCHAR(3)            DEFAULT 'usd',

  -- ── TIMESTAMPS ────────────────────────────────────────────────────────
  created_at                  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_subscriptions_team_id
  ON subscriptions (team_id);

CREATE UNIQUE INDEX idx_subscriptions_stripe_id
  ON subscriptions (stripe_subscription_id);

CREATE INDEX idx_subscriptions_status
  ON subscriptions (status);

CREATE INDEX idx_subscriptions_cycle_end
  ON subscriptions (current_period_end)
  WHERE status = 'active';
-- Find subscriptions expiring soon (for proactive renewal alerts)

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: invoices
-- Invoice history from Stripe webhooks.
-- Read-only from Vocaply's perspective — Stripe is source of truth.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE invoices (
  id                VARCHAR(36)     PRIMARY KEY,

  team_id           VARCHAR(36)     NOT NULL
                                    REFERENCES teams(id) ON DELETE RESTRICT,

  -- ── STRIPE REFERENCES ─────────────────────────────────────────────────
  stripe_invoice_id VARCHAR(255)    NOT NULL UNIQUE,
  -- "in_abc123def456"

  stripe_customer_id VARCHAR(255)   NOT NULL,

  number            VARCHAR(50),
  -- Human-readable: "VOC-2026-001". From Stripe invoice.number.

  -- ── AMOUNTS ───────────────────────────────────────────────────────────
  amount_due        INT             NOT NULL,
  -- Cents. 7900 = $79.00

  amount_paid       INT             NOT NULL DEFAULT 0,
  currency          VARCHAR(3)      NOT NULL DEFAULT 'usd',

  -- ── STATUS ────────────────────────────────────────────────────────────
  status            VARCHAR(20)     NOT NULL,
  -- Stripe invoice status: "draft" | "open" | "paid" | "void" | "uncollectible"

  -- ── PERIOD ────────────────────────────────────────────────────────────
  period_start      DATE,
  period_end        DATE,
  description       VARCHAR(500),
  -- "Growth Plan — May 2026"

  -- ── LINKS ─────────────────────────────────────────────────────────────
  hosted_invoice_url TEXT,
  -- URL to Stripe-hosted invoice page.

  invoice_pdf_url   TEXT,

  -- ── TIMESTAMPS ────────────────────────────────────────────────────────
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_invoices_stripe_id  ON invoices (stripe_invoice_id);
CREATE INDEX idx_invoices_team_id          ON invoices (team_id, created_at DESC);
```

---

### 2.8 Analytics & Usage Tables

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: usage_events
-- Append-only event log for billing quota enforcement and analytics.
-- NEVER update or delete rows (except archival after 2 years).
-- Grows fast: partition by month at scale.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE usage_events (
  id            VARCHAR(36)         PRIMARY KEY,

  team_id       VARCHAR(36)         NOT NULL
                                    REFERENCES teams(id) ON DELETE CASCADE,

  type          usage_event_type    NOT NULL,

  quantity      INT                 NOT NULL DEFAULT 1,
  -- For MEETING_PROCESSED: 1. For API_CALL: could be batch size.

  metadata      JSONB               NOT NULL DEFAULT '{}',
  -- MEETING_PROCESSED: { "meetingId": "mtg_01", "platform": "ZOOM",
  --                      "durationMinutes": 28, "commitmentCount": 3 }
  -- INTEGRATION_SYNC:  { "provider": "JIRA", "itemCount": 5 }
  -- EXPORT_GENERATED:  { "format": "CSV", "rowCount": 1420 }
  -- API_CALL:          { "endpoint": "/api/v1/commitments", "method": "GET" }

  occurred_at   TIMESTAMPTZ         NOT NULL DEFAULT NOW()
  -- No updated_at — this is an immutable event log.
);

CREATE INDEX idx_usage_team_id
  ON usage_events (team_id);

CREATE INDEX idx_usage_team_type
  ON usage_events (team_id, type);

CREATE INDEX idx_usage_team_time
  ON usage_events (team_id, occurred_at DESC);
-- Most critical: monthly quota check
-- SELECT COUNT(*) FROM usage_events
-- WHERE team_id = $1 AND type = 'MEETING_PROCESSED'
-- AND occurred_at >= DATE_TRUNC('month', NOW())

CREATE INDEX idx_usage_occurred_at
  ON usage_events (occurred_at DESC);
-- For archival cron: DELETE WHERE occurred_at < NOW() - INTERVAL '2 years'

-- PARTITION PLAN (at 10M+ rows, ~Month 18):
-- ALTER TABLE usage_events RENAME TO usage_events_legacy;
-- CREATE TABLE usage_events (LIKE usage_events_legacy)
--   PARTITION BY RANGE (occurred_at);
-- CREATE TABLE usage_events_2026_01 PARTITION OF usage_events
--   FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- (Monthly partitions going forward)


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: commitment_score_snapshots
-- Weekly denormalized commitment score history per user.
-- Enables trend charts without re-computing from raw commitments.
-- Written by: Sunday midnight cron job.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE commitment_score_snapshots (
  id                  VARCHAR(36)     PRIMARY KEY,

  user_id             VARCHAR(36)     NOT NULL
                                      REFERENCES users(id) ON DELETE CASCADE,

  team_id             VARCHAR(36)     NOT NULL
                                      REFERENCES teams(id) ON DELETE CASCADE,

  -- ── PERIOD ────────────────────────────────────────────────────────────
  week_start          DATE            NOT NULL,
  -- ISO Monday of the week: '2026-05-11'

  iso_week            VARCHAR(8)      NOT NULL,
  -- '2026-W20' — human-readable week identifier for display.

  -- ── SCORES ────────────────────────────────────────────────────────────
  commitment_score    SMALLINT        NOT NULL,
  -- 0–100 at the end of this week.

  fulfillment_rate    SMALLINT        NOT NULL,
  -- Percentage: 0–100.

  on_time_rate        SMALLINT        NOT NULL,

  -- ── COUNTS ────────────────────────────────────────────────────────────
  total_commitments   SMALLINT        NOT NULL DEFAULT 0,
  fulfilled_count     SMALLINT        NOT NULL DEFAULT 0,
  missed_count        SMALLINT        NOT NULL DEFAULT 0,
  deferred_count      SMALLINT        NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Unique: one snapshot per user per week
CREATE UNIQUE INDEX idx_score_snapshot_user_week
  ON commitment_score_snapshots (user_id, week_start);

CREATE INDEX idx_score_snapshot_team_week
  ON commitment_score_snapshots (team_id, week_start DESC);
-- Team analytics: show all member scores for a given week
```

---

### 2.9 Notification Tables

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: notification_preferences
-- Per-user preferences for each notification type + channel.
-- Stored as JSONB for flexibility — easy to add new types.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE notification_preferences (
  id          VARCHAR(36)     PRIMARY KEY,

  user_id     VARCHAR(36)     NOT NULL UNIQUE
                              REFERENCES users(id) ON DELETE CASCADE,

  preferences JSONB           NOT NULL DEFAULT '{
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
      "all":               true
    }
  }',

  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_notif_prefs_user_id ON notification_preferences (user_id);

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: in_app_notifications
-- Persistent in-app notification feed.
-- Different from Redis dedup keys — this is the permanent notification log.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE in_app_notifications (
  id              VARCHAR(36)           PRIMARY KEY,

  user_id         VARCHAR(36)           NOT NULL
                                        REFERENCES users(id) ON DELETE CASCADE,

  team_id         VARCHAR(36)           NOT NULL
                                        REFERENCES teams(id) ON DELETE CASCADE,

  type            notification_type     NOT NULL,

  title           VARCHAR(255)          NOT NULL,
  -- "Ahmed missed a commitment"

  body            TEXT,
  -- "Fix payment bug was due yesterday and has been marked MISSED."

  action_url      TEXT,
  -- "/commitments/com_abc123" — where clicking the notification takes you.

  is_read         BOOLEAN               NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,

  -- ── CONTEXT REFERENCES ────────────────────────────────────────────────
  commitment_id   VARCHAR(36)           REFERENCES commitments(id) ON DELETE SET NULL,
  meeting_id      VARCHAR(36)           REFERENCES meetings(id) ON DELETE SET NULL,
  -- Set when notification is related to specific resource.
  -- Enables "jump to" behavior in the UI.

  created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_in_app_notif_user_unread
  ON in_app_notifications (user_id, is_read, created_at DESC)
  WHERE is_read = FALSE;
-- Notification bell: count unread notifications

CREATE INDEX idx_in_app_notif_user_feed
  ON in_app_notifications (user_id, created_at DESC);
-- Notification feed: paginated list of all notifications

CREATE INDEX idx_in_app_notif_cleanup
  ON in_app_notifications (created_at)
  WHERE is_read = TRUE;
-- Cleanup cron: delete read notifications older than 90 days
```

---

### 2.10 API Keys & Webhooks Tables

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: api_keys
-- Machine-to-machine API keys for integrations and CI/CD.
-- Full key shown ONCE at creation. DB stores SHA-256 hash.
-- Format: vply_{env}_{32_bytes_base62}
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE api_keys (
  id              VARCHAR(36)     PRIMARY KEY,

  team_id         VARCHAR(36)     NOT NULL
                                  REFERENCES teams(id) ON DELETE CASCADE,

  created_by_id   VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,

  -- ── KEY STORAGE ───────────────────────────────────────────────────────
  key_hash        VARCHAR(64)     NOT NULL UNIQUE,
  -- SHA-256(full_key). Never store the full key.

  key_hint        VARCHAR(8),
  -- Last 4 chars of the key: "...Jw3A". Shown in UI for identification.

  key_prefix      VARCHAR(20),
  -- "vply_live_" — for display. Helps identify environment.

  -- ── METADATA ──────────────────────────────────────────────────────────
  name            VARCHAR(255)    NOT NULL,
  -- "Jira Integration Bot", "CI/CD Pipeline"

  description     TEXT,

  scopes          TEXT[]          NOT NULL DEFAULT '{}',
  -- Array: ["meetings:read", "action_items:read", "action_items:sync"]

  -- ── LIFECYCLE ─────────────────────────────────────────────────────────
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,

  expires_at      TIMESTAMPTZ,
  -- NULL = never expires. Set for time-limited keys.

  last_used_at    TIMESTAMPTZ,
  -- Updated asynchronously (non-blocking) on each use.

  last_used_ip    INET,

  revoked_at      TIMESTAMPTZ,
  revoked_by_id   VARCHAR(36)     REFERENCES users(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_api_keys_hash     ON api_keys (key_hash);
CREATE INDEX idx_api_keys_team_id        ON api_keys (team_id);
CREATE INDEX idx_api_keys_team_active    ON api_keys (team_id, is_active);


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: webhook_registrations
-- Customer-registered outbound webhooks. Vocaply → customer server.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE webhook_registrations (
  id                VARCHAR(36)           PRIMARY KEY,

  team_id           VARCHAR(36)           NOT NULL
                                          REFERENCES teams(id) ON DELETE CASCADE,

  -- ── ENDPOINT ──────────────────────────────────────────────────────────
  url               TEXT                  NOT NULL,
  -- Customer's HTTPS endpoint.

  signing_key_hash  VARCHAR(64)           NOT NULL,
  -- SHA-256(signing_secret). Used to sign outbound payloads.
  -- Customer stores the original secret to verify signatures.

  -- ── SUBSCRIPTION ──────────────────────────────────────────────────────
  events            webhook_event_type[]  NOT NULL DEFAULT '{}',
  -- Array of subscribed events: ["meeting.processed", "commitment.missed"]

  -- ── STATUS ────────────────────────────────────────────────────────────
  is_active         BOOLEAN               NOT NULL DEFAULT TRUE,

  -- ── DELIVERY STATS ────────────────────────────────────────────────────
  total_deliveries  INT                   NOT NULL DEFAULT 0,
  failed_deliveries INT                   NOT NULL DEFAULT 0,
  -- After 5 consecutive failures: is_active → false, admin notified.

  last_delivery_at  TIMESTAMPTZ,
  last_failure_at   TIMESTAMPTZ,
  last_failure_code INT,
  -- HTTP status code of last failed delivery.

  -- ── AUDIT ─────────────────────────────────────────────────────────────
  created_by_id     VARCHAR(36)           REFERENCES users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_reg_team_id   ON webhook_registrations (team_id);
CREATE INDEX idx_webhook_reg_active    ON webhook_registrations (is_active, events)
  USING GIN (events);
-- For event delivery: find all active webhooks subscribed to a given event


-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: async_jobs
-- Persistent job records for long-running async operations.
-- These are user-visible jobs (reprocess meeting, export data).
-- Internal Bull queue jobs are NOT stored here — too noisy.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE async_jobs (
  id                VARCHAR(36)       PRIMARY KEY,

  team_id           VARCHAR(36)       NOT NULL
                                      REFERENCES teams(id) ON DELETE CASCADE,

  initiated_by_id   VARCHAR(36)       REFERENCES users(id) ON DELETE SET NULL,

  type              job_type          NOT NULL,
  status            job_status        NOT NULL DEFAULT 'QUEUED',

  -- ── PROGRESS ──────────────────────────────────────────────────────────
  progress          SMALLINT          NOT NULL DEFAULT 0,
  -- 0–100 percentage.

  message           VARCHAR(500),
  -- "Running AI extraction..." — shown in progress UI.

  -- ── RESULT ────────────────────────────────────────────────────────────
  result            JSONB,
  -- Populated on COMPLETED:
  -- MEETING_REPROCESS: { "commitmentCount": 4, "actionItemCount": 6 }
  -- TEAM_DATA_EXPORT:  { "downloadUrl": "https://...", "expiresAt": "..." }

  error_message     TEXT,
  -- Populated on FAILED.

  -- ── LINKED RESOURCE ───────────────────────────────────────────────────
  resource_id       VARCHAR(36),
  -- The resource this job operates on (meetingId, teamId, etc.)

  resource_type     VARCHAR(50),
  -- "meeting", "team", "action_items_bulk"

  -- ── TIMING ────────────────────────────────────────────────────────────
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  estimated_ms      INT,
  -- Estimated duration in milliseconds (for progress UI).

  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_async_jobs_team_id     ON async_jobs (team_id, created_at DESC);
CREATE INDEX idx_async_jobs_status      ON async_jobs (status, created_at)
  WHERE status IN ('QUEUED', 'PROCESSING');
-- Find jobs to display in active status

CREATE TRIGGER async_jobs_updated_at
  BEFORE UPDATE ON async_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 3. PostgreSQL — Complete Prisma Schema

```prisma
// services/api/prisma/schema.prisma
// Authoritative ORM schema. DDL above is equivalent SQL.

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  // directUrl bypasses PgBouncer for migrations — required by Supabase.
}

// ─────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────

enum UserRole {
  OWNER
  ADMIN
  MANAGER
  MEMBER
}

enum PlanType {
  FREE
  STARTER
  GROWTH
  BUSINESS
  ENTERPRISE
}

enum PlatformType {
  ZOOM
  GOOGLE_MEET
  TEAMS
  WEBEX
  MANUAL
}

enum MeetingStatus {
  SCHEDULED
  BOT_JOINING
  RECORDING
  PROCESSING
  DONE
  FAILED
  CANCELLED
}

enum CommitmentStatus {
  PENDING
  FULFILLED
  MISSED
  DEFERRED
  CANCELLED
}

enum PriorityLevel {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum TeamProvider {
  JIRA
  LINEAR
  SLACK
  NOTION
}

enum CalendarProvider {
  GOOGLE_CALENDAR
  OUTLOOK_CALENDAR
}

enum SubscriptionStatus {
  active
  trialing
  past_due
  paused
  cancelled
  incomplete
  incomplete_expired
  unpaid
}

enum UsageEventType {
  MEETING_PROCESSED
  AI_EXTRACTION
  INTEGRATION_SYNC
  EXPORT_GENERATED
  API_CALL
}

enum JobStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}

enum JobType {
  MEETING_PROCESS
  MEETING_REPROCESS
  TEAM_DATA_EXPORT
  ANALYTICS_REPORT
  JIRA_BULK_SYNC
  CALENDAR_SYNC
}

enum NotificationType {
  MEETING_PROCESSED
  COMMITMENT_MISSED
  COMMITMENT_FULFILLED
  DEADLINE_TODAY
  DEADLINE_TOMORROW
  WEEKLY_DIGEST
  PAYMENT_FAILED
  PLAN_LIMIT_REACHED
  TEAM_INVITE
  MEMBER_JOINED
  SCORE_MILESTONE
}

enum MfaMethod {
  TOTP
  WEBAUTHN
  BACKUP_CODE
}

// ─────────────────────────────────────────────────────────────────────────
// AUTH & IDENTITY
// ─────────────────────────────────────────────────────────────────────────

model User {
  id                    String    @id @default(cuid())
  email                 String    @unique
  name                  String
  avatarUrl             String?
  timezone              String    @default("UTC")
  locale                String    @default("en")

  passwordHash          String?
  emailVerified         Boolean   @default(false)
  emailVerifiedAt       DateTime?
  failedLoginAttempts   Int       @default(0)
  lockedUntil           DateTime?

  googleId              String?   @unique
  githubId              String?   @unique
  microsoftId           String?   @unique

  mfaEnabled            Boolean   @default(false)
  totpSecretEnc         String?

  teamId                String?
  role                  UserRole  @default(MEMBER)

  commitmentScore       Int       @default(0)

  lastLoginAt           DateTime?
  lastActiveAt          DateTime?
  onboardingCompleted   Boolean   @default(false)

  deletedAt             DateTime?

  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  // Relations
  team                        Team?                       @relation(fields: [teamId], references: [id])
  refreshTokens               RefreshToken[]
  emailVerificationTokens     EmailVerificationToken[]
  passwordResetTokens         PasswordResetToken[]
  mfaCredentials              MfaCredential[]
  ownedCommitments            Commitment[]                @relation("CommitmentOwner")
  manualStatusCommitments     Commitment[]                @relation("CommitmentManualStatus")
  assignedActionItems         ActionItem[]                @relation("ActionItemAssignee")
  completedActionItems        ActionItem[]                @relation("ActionItemCompleted")
  meetingParticipations       MeetingParticipant[]        @relation("ParticipantUser")
  correctedParticipations     MeetingParticipant[]        @relation("ParticipantCorrector")
  teamIntegrationsConnected   TeamIntegration[]           @relation("IntegrationConnectedBy")
  teamIntegrationsDisconnected TeamIntegration[]          @relation("IntegrationDisconnectedBy")
  userIntegrations            UserIntegration[]
  apiKeys                     ApiKey[]
  webhookRegistrations        WebhookRegistration[]       @relation("WebhookCreatedBy")
  inAppNotifications          InAppNotification[]
  notificationPreferences     NotificationPreference?
  initiatedJobs               AsyncJob[]
  scoreSnapshots              CommitmentScoreSnapshot[]
  teamInvitations             TeamInvitation[]            @relation("InvitedBy")
  acceptedInvitations         TeamInvitation[]            @relation("AcceptedBy")
  calendarSourceMeetings      Meeting[]                   @relation("CalendarSourceUser")
  reprocessedMeetings         Meeting[]                   @relation("ReprocessedBy")
  revokedApiKeys              ApiKey[]                    @relation("RevokedBy")

  @@index([teamId])
  @@index([teamId, role])
  @@index([teamId, commitmentScore(sort: Desc)])
  @@map("users")
}

model RefreshToken {
  id                String    @id @default(cuid())
  userId            String
  tokenHash         String    @unique
  expiresAt         DateTime
  ipAddress         String?
  userAgent         String?
  deviceLabel       String?
  lastUsedAt        DateTime?
  reuseDetectedAt   DateTime?
  createdAt         DateTime  @default(now())

  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}

model EmailVerificationToken {
  id          String    @id @default(cuid())
  userId      String
  tokenHash   String    @unique
  expiresAt   DateTime
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("email_verification_tokens")
}

model PasswordResetToken {
  id          String    @id @default(cuid())
  userId      String
  tokenHash   String    @unique
  expiresAt   DateTime
  usedAt      DateTime?
  ipAddress   String?
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("password_reset_tokens")
}

model MfaCredential {
  id                        String    @id @default(cuid())
  userId                    String
  method                    MfaMethod
  totpSecretEnc             String?
  webauthnCredentialId      Bytes?
  webauthnPublicKey         Bytes?
  webauthnSignCount         BigInt?   @default(0)
  backupCodeHash            String?
  backupCodeUsed            Boolean   @default(false)
  label                     String?
  lastUsedAt                DateTime?
  createdAt                 DateTime  @default(now())

  user                      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, method])
  @@map("mfa_credentials")
}

// ─────────────────────────────────────────────────────────────────────────
// TEAMS
// ─────────────────────────────────────────────────────────────────────────

model Team {
  id                    String    @id @default(cuid())
  name                  String
  slug                  String    @unique
  plan                  PlanType  @default(FREE)
  stripeCustomerId      String?   @unique
  stripeSubId           String?   @unique
  meetingsUsed          Int       @default(0)
  billingCycleStart     DateTime?
  billingCycleEnd       DateTime?
  settings              Json      @default("{}")
  ssoProvider           String?
  ssoMetadataUrl        String?
  ssoEntityId           String?
  scimTokenHash         String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  members               User[]
  meetings              Meeting[]
  commitments           Commitment[]
  actionItems           ActionItem[]
  decisions             Decision[]
  blockers              Blocker[]
  teamIntegrations      TeamIntegration[]
  subscription          Subscription?
  invoices              Invoice[]
  usageEvents           UsageEvent[]
  apiKeys               ApiKey[]
  webhookRegistrations  WebhookRegistration[]
  asyncJobs             AsyncJob[]
  scoreSnapshots        CommitmentScoreSnapshot[]
  teamInvitations       TeamInvitation[]
  inAppNotifications    InAppNotification[]

  @@map("teams")
}

model TeamInvitation {
  id              String    @id @default(cuid())
  teamId          String
  invitedEmail    String
  invitedRole     UserRole  @default(MEMBER)
  invitedById     String?
  tokenHash       String    @unique
  expiresAt       DateTime
  acceptedAt      DateTime?
  acceptedById    String?
  createdAt       DateTime  @default(now())

  team            Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  invitedBy       User?     @relation("InvitedBy",  fields: [invitedById],  references: [id], onDelete: SetNull)
  acceptedBy      User?     @relation("AcceptedBy", fields: [acceptedById], references: [id], onDelete: SetNull)

  @@index([teamId])
  @@index([invitedEmail])
  @@map("team_invitations")
}

// ─────────────────────────────────────────────────────────────────────────
// MEETINGS
// ─────────────────────────────────────────────────────────────────────────

model Meeting {
  id                      String          @id @default(cuid())
  teamId                  String
  title                   String
  platform                PlatformType
  meetingUrl              String
  platformMeetingId       String?
  recallBotId             String?
  recallBotStatus         String?
  status                  MeetingStatus   @default(SCHEDULED)
  scheduledAt             DateTime
  startedAt               DateTime?
  endedAt                 DateTime?
  durationMinutes         Int?
  calendarEventId         String?
  calendarSourceUserId    String?
  mongoTranscriptId       String?
  summary                 String?
  commitmentCount         Int             @default(0)
  actionItemCount         Int             @default(0)
  decisionCount           Int             @default(0)
  blockerCount            Int             @default(0)
  participantCount        Int             @default(0)
  processingStartedAt     DateTime?
  processingCompletedAt   DateTime?
  processingAttempts      Int             @default(0)
  processingError         String?
  reprocessedAt           DateTime?
  reprocessedById         String?
  createdAt               DateTime        @default(now())
  updatedAt               DateTime        @updatedAt

  team                    Team              @relation(fields: [teamId], references: [id], onDelete: Cascade)
  calendarSourceUser      User?             @relation("CalendarSourceUser",  fields: [calendarSourceUserId], references: [id], onDelete: SetNull)
  reprocessedBy           User?             @relation("ReprocessedBy",      fields: [reprocessedById],      references: [id], onDelete: SetNull)
  participants            MeetingParticipant[]
  commitments             Commitment[]                              @relation("MeetingCommitments")
  resolvedCommitments     Commitment[]                              @relation("CommitmentResolution")
  actionItems             ActionItem[]
  decisions               Decision[]
  blockers                Blocker[]

  @@index([teamId])
  @@index([teamId, status])
  @@index([teamId, scheduledAt(sort: Desc)])
  @@index([teamId, platformMeetingId])
  @@map("meetings")
}

model MeetingParticipant {
  id                  String    @id @default(cuid())
  meetingId           String
  userId              String?
  name                String
  email               String?
  speakerTag          String?
  speakerConfidence   Float?
  joinedAt            DateTime?
  leftAt              DateTime?
  manuallyCorrected   Boolean   @default(false)
  correctedById       String?
  createdAt           DateTime  @default(now())

  meeting             Meeting   @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  user                User?     @relation("ParticipantUser",      fields: [userId],      references: [id], onDelete: SetNull)
  correctedBy         User?     @relation("ParticipantCorrector", fields: [correctedById], references: [id], onDelete: SetNull)

  @@unique([meetingId, email])
  @@index([meetingId])
  @@index([userId])
  @@map("meeting_participants")
}

// ─────────────────────────────────────────────────────────────────────────
// COMMITMENT ENGINE
// ─────────────────────────────────────────────────────────────────────────

model Commitment {
  id                    String            @id @default(cuid())
  teamId                String
  meetingId             String
  ownerId               String
  text                  String
  normalizedText        String?
  dueDate               DateTime?
  dueDateRaw            String?
  status                CommitmentStatus  @default(PENDING)
  confidenceScore       Float             @default(1.0)
  extractionModel       String?
  resolvedAt            DateTime?
  resolvedInMeetingId   String?
  originalDueDate       DateTime?
  deferredCount         Int               @default(0)
  deferredNote          String?
  reminderSentAt        DateTime?
  missedAlertSentAt     DateTime?
  managerAlertSentAt    DateTime?
  manualStatusById      String?
  cancellationNote      String?
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt

  team                  Team              @relation(fields: [teamId],              references: [id], onDelete: Cascade)
  meeting               Meeting           @relation("MeetingCommitments",  fields: [meetingId],            references: [id], onDelete: Cascade)
  owner                 User              @relation("CommitmentOwner",     fields: [ownerId],              references: [id], onDelete: Cascade)
  resolvedInMeeting     Meeting?          @relation("CommitmentResolution", fields: [resolvedInMeetingId], references: [id], onDelete: SetNull)
  manualStatusBy        User?             @relation("CommitmentManualStatus", fields: [manualStatusById],  references: [id], onDelete: SetNull)
  inAppNotifications    InAppNotification[]

  @@index([teamId])
  @@index([teamId, status])
  @@index([ownerId])
  @@index([meetingId])
  @@index([teamId, ownerId, status])
  @@index([teamId, createdAt(sort: Desc)])
  @@map("commitments")
}

model ActionItem {
  id                    String          @id @default(cuid())
  teamId                String
  meetingId             String
  assigneeId            String?
  assigneeNameRaw       String?
  text                  String
  dueDate               DateTime?
  dueDateRaw            String?
  priority              PriorityLevel   @default(MEDIUM)
  completed             Boolean         @default(false)
  completedAt           DateTime?
  completedById         String?
  jiraIssueId           String?
  jiraIssueUrl          String?
  jiraIssueSyncedAt     DateTime?
  linearIssueId         String?
  linearIssueUrl        String?
  linearIssueSyncedAt   DateTime?
  notionPageId          String?
  notionPageUrl         String?
  notionPageSyncedAt    DateTime?
  confidenceScore       Float           @default(1.0)
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  team                  Team            @relation(fields: [teamId],      references: [id], onDelete: Cascade)
  meeting               Meeting         @relation(fields: [meetingId],   references: [id], onDelete: Cascade)
  assignee              User?           @relation("ActionItemAssignee",  fields: [assigneeId],  references: [id], onDelete: SetNull)
  completedBy           User?           @relation("ActionItemCompleted", fields: [completedById], references: [id], onDelete: SetNull)

  @@index([teamId])
  @@index([meetingId])
  @@index([assigneeId])
  @@index([teamId, completed])
  @@map("action_items")
}

model Decision {
  id              String    @id @default(cuid())
  meetingId       String
  teamId          String
  text            String
  madeBy          String?
  confidenceScore Float     @default(1.0)
  createdAt       DateTime  @default(now())

  meeting         Meeting   @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  @@index([meetingId])
  @@index([teamId])
  @@map("decisions")
}

model Blocker {
  id              String    @id @default(cuid())
  meetingId       String
  teamId          String
  text            String
  affectedUser    String?
  resolved        Boolean   @default(false)
  resolvedAt      DateTime?
  confidenceScore Float     @default(1.0)
  createdAt       DateTime  @default(now())

  meeting         Meeting   @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  @@index([meetingId])
  @@index([teamId, resolved])
  @@map("blockers")
}

// ─────────────────────────────────────────────────────────────────────────
// INTEGRATIONS
// ─────────────────────────────────────────────────────────────────────────

model TeamIntegration {
  id                  String        @id @default(cuid())
  teamId              String
  provider            TeamProvider
  accessTokenEnc      String
  refreshTokenEnc     String?
  tokenExpiresAt      DateTime?
  workspaceId         String?
  workspaceName       String?
  workspaceUrl        String?
  metadata            Json          @default("{}")
  isActive            Boolean       @default(true)
  lastSyncedAt        DateTime?
  lastError           String?
  consecutiveErrors   Int           @default(0)
  connectedById       String?
  disconnectedById    String?
  disconnectedAt      DateTime?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt

  team                Team          @relation(fields: [teamId],          references: [id], onDelete: Cascade)
  connectedBy         User?         @relation("IntegrationConnectedBy",    fields: [connectedById],    references: [id], onDelete: SetNull)
  disconnectedBy      User?         @relation("IntegrationDisconnectedBy", fields: [disconnectedById], references: [id], onDelete: SetNull)

  @@unique([teamId, provider])
  @@index([teamId])
  @@index([tokenExpiresAt])
  @@map("team_integrations")
}

model UserIntegration {
  id                  String            @id @default(cuid())
  userId              String
  provider            CalendarProvider
  accessTokenEnc      String
  refreshTokenEnc     String?
  tokenExpiresAt      DateTime?
  calendarId          String?
  syncEnabled         Boolean           @default(true)
  lastSyncedAt        DateTime?
  nextSyncToken       String?
  lastError           String?
  consecutiveErrors   Int               @default(0)
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  user                User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])
  @@index([userId])
  @@index([lastSyncedAt])
  @@map("user_integrations")
}

// ─────────────────────────────────────────────────────────────────────────
// BILLING
// ─────────────────────────────────────────────────────────────────────────

model Subscription {
  id                      String              @id @default(cuid())
  teamId                  String              @unique
  stripeSubscriptionId    String              @unique
  stripeCustomerId        String
  stripePriceId           String?
  stripeProductId         String?
  plan                    PlanType
  billingInterval         String?
  status                  SubscriptionStatus
  currentPeriodStart      DateTime?
  currentPeriodEnd        DateTime?
  cancelAtPeriodEnd       Boolean             @default(false)
  cancelledAt             DateTime?
  trialStart              DateTime?
  trialEnd                DateTime?
  unitAmount              Int?
  currency                String              @default("usd")
  createdAt               DateTime            @default(now())
  updatedAt               DateTime            @updatedAt

  team                    Team                @relation(fields: [teamId], references: [id], onDelete: Restrict)

  @@index([status])
  @@map("subscriptions")
}

model Invoice {
  id                String    @id @default(cuid())
  teamId            String
  stripeInvoiceId   String    @unique
  stripeCustomerId  String
  number            String?
  amountDue         Int
  amountPaid        Int       @default(0)
  currency          String    @default("usd")
  status            String
  periodStart       DateTime?
  periodEnd         DateTime?
  description       String?
  hostedInvoiceUrl  String?
  invoicePdfUrl     String?
  paidAt            DateTime?
  createdAt         DateTime  @default(now())

  team              Team      @relation(fields: [teamId], references: [id], onDelete: Restrict)

  @@index([teamId, createdAt(sort: Desc)])
  @@map("invoices")
}

// ─────────────────────────────────────────────────────────────────────────
// ANALYTICS & USAGE
// ─────────────────────────────────────────────────────────────────────────

model UsageEvent {
  id          String          @id @default(cuid())
  teamId      String
  type        UsageEventType
  quantity    Int             @default(1)
  metadata    Json            @default("{}")
  occurredAt  DateTime        @default(now())

  team        Team            @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId])
  @@index([teamId, type])
  @@index([teamId, occurredAt(sort: Desc)])
  @@index([occurredAt(sort: Desc)])
  @@map("usage_events")
}

model CommitmentScoreSnapshot {
  id                String    @id @default(cuid())
  userId            String
  teamId            String
  weekStart         DateTime
  isoWeek           String
  commitmentScore   Int
  fulfillmentRate   Int
  onTimeRate        Int
  totalCommitments  Int       @default(0)
  fulfilledCount    Int       @default(0)
  missedCount       Int       @default(0)
  deferredCount     Int       @default(0)
  createdAt         DateTime  @default(now())

  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  team              Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([userId, weekStart])
  @@index([teamId, weekStart(sort: Desc)])
  @@map("commitment_score_snapshots")
}

// ─────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────

model NotificationPreference {
  id          String    @id @default(cuid())
  userId      String    @unique
  preferences Json      @default("{}")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("notification_preferences")
}

model InAppNotification {
  id              String            @id @default(cuid())
  userId          String
  teamId          String
  type            NotificationType
  title           String
  body            String?
  actionUrl       String?
  isRead          Boolean           @default(false)
  readAt          DateTime?
  commitmentId    String?
  meetingId       String?
  createdAt       DateTime          @default(now())

  user            User              @relation(fields: [userId],      references: [id], onDelete: Cascade)
  team            Team              @relation(fields: [teamId],      references: [id], onDelete: Cascade)
  commitment      Commitment?       @relation(fields: [commitmentId], references: [id], onDelete: SetNull)

  @@index([userId, isRead, createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@map("in_app_notifications")
}

// ─────────────────────────────────────────────────────────────────────────
// API KEYS & WEBHOOKS
// ─────────────────────────────────────────────────────────────────────────

model ApiKey {
  id            String    @id @default(cuid())
  teamId        String
  createdById   String?
  keyHash       String    @unique
  keyHint       String?
  keyPrefix     String?
  name          String
  description   String?
  scopes        String[]  @default([])
  isActive      Boolean   @default(true)
  expiresAt     DateTime?
  lastUsedAt    DateTime?
  lastUsedIp    String?
  revokedAt     DateTime?
  revokedById   String?
  createdAt     DateTime  @default(now())

  team          Team      @relation(fields: [teamId],       references: [id], onDelete: Cascade)
  createdBy     User?     @relation(fields: [createdById],  references: [id], onDelete: SetNull)
  revokedBy     User?     @relation("RevokedBy", fields: [revokedById], references: [id], onDelete: SetNull)

  @@index([teamId])
  @@map("api_keys")
}

model WebhookRegistration {
  id                String    @id @default(cuid())
  teamId            String
  url               String
  signingKeyHash    String
  events            String[]  @default([])
  isActive          Boolean   @default(true)
  totalDeliveries   Int       @default(0)
  failedDeliveries  Int       @default(0)
  lastDeliveryAt    DateTime?
  lastFailureAt     DateTime?
  lastFailureCode   Int?
  createdById       String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  team              Team      @relation(fields: [teamId],      references: [id], onDelete: Cascade)
  createdBy         User?     @relation("WebhookCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([teamId])
  @@map("webhook_registrations")
}

model AsyncJob {
  id                String      @id @default(cuid())
  teamId            String
  initiatedById     String?
  type              JobType
  status            JobStatus   @default(QUEUED)
  progress          Int         @default(0)
  message           String?
  result            Json?
  errorMessage      String?
  resourceId        String?
  resourceType      String?
  startedAt         DateTime?
  completedAt       DateTime?
  estimatedMs       Int?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  team              Team        @relation(fields: [teamId],         references: [id], onDelete: Cascade)
  initiatedBy       User?       @relation(fields: [initiatedById],  references: [id], onDelete: SetNull)

  @@index([teamId, createdAt(sort: Desc)])
  @@index([status])
  @@map("async_jobs")
}
```

---

## 4. Index Strategy

### Index Decision Framework

```
RULE 1 — Index foreign keys always.
  Every FK column gets an index unless it's on a very small table.
  PostgreSQL does NOT auto-index FKs (unlike MySQL).

RULE 2 — Partial indexes for filtered queries.
  WHERE status = 'PENDING' partial index is 10–100x faster than full index
  because it only contains the subset that matches.

RULE 3 — Composite index column order matters.
  Leftmost prefix rule: index (team_id, status, created_at) serves:
    - WHERE team_id = ?
    - WHERE team_id = ? AND status = ?
    - WHERE team_id = ? AND status = ? ORDER BY created_at
  But NOT: WHERE status = ?  (can't skip leftmost column)

RULE 4 — Cover frequent queries with covering indexes.
  If a query SELECT id, text, status FROM commitments WHERE team_id = ? AND status = 'PENDING'
  is very hot, add index (team_id, status) INCLUDE (id, text).
  This is a "covering index" — query satisfies entirely from index, no heap fetch.

RULE 5 — JSONB indexes for filtered config.
  teams.settings JSONB with GIN index enables:
    WHERE settings @> '{"weeklyDigestEnabled": true}'

RULE 6 — Never index low-cardinality columns alone.
  Index on boolean column alone is useless (only 2 values).
  But composite (team_id, completed) on action_items is excellent.
```

### Critical Index Inventory

```sql
-- ── COMMITMENT ENGINE (most query-critical) ───────────────────────────────

-- cron job at 9AM: find pending commitments due today
CREATE INDEX idx_commit_due_today ON commitments (team_id, due_date)
  WHERE status = 'PENDING' AND due_date IS NOT NULL;

-- cron job at 6PM: find all unalerted past-due commitments
CREATE INDEX idx_commit_missed_alert ON commitments (due_date)
  WHERE status = 'PENDING' AND due_date IS NOT NULL AND missed_alert_sent_at IS NULL;

-- dashboard analytics: member commitment rate
CREATE INDEX idx_commit_analytics ON commitments (team_id, owner_id, status, created_at);

-- my commitments widget: current user's open items
CREATE INDEX idx_commit_my_pending ON commitments (owner_id, status)
  WHERE status IN ('PENDING', 'DEFERRED');

-- ── MEETINGS ──────────────────────────────────────────────────────────────

-- CRITICAL: deduplication check when scheduling bots
CREATE UNIQUE INDEX idx_mtg_platform_dedup ON meetings (team_id, platform_meeting_id)
  WHERE platform_meeting_id IS NOT NULL;

-- webhook lookup: find meeting by Recall.ai bot ID
CREATE UNIQUE INDEX idx_mtg_recall_bot ON meetings (recall_bot_id)
  WHERE recall_bot_id IS NOT NULL;

-- ── ACTION ITEMS ──────────────────────────────────────────────────────────

-- Jira reverse webhook: look up action_item by Jira issue key
CREATE UNIQUE INDEX idx_ai_jira_dedup ON action_items (jira_issue_id)
  WHERE jira_issue_id IS NOT NULL;

-- ── INTEGRATIONS ──────────────────────────────────────────────────────────

-- token refresh cron: find expiring tokens
CREATE INDEX idx_team_int_expiry ON team_integrations (token_expires_at)
  WHERE is_active = TRUE AND token_expires_at IS NOT NULL;

-- calendar sync cron: find users due for sync
CREATE INDEX idx_user_int_sync_due ON user_integrations (last_synced_at)
  WHERE sync_enabled = TRUE;

-- ── USAGE EVENTS (time-series) ────────────────────────────────────────────

-- monthly quota check: MOST CRITICAL QUERY
-- SELECT COUNT(*) WHERE team_id = ? AND type = 'MEETING_PROCESSED'
-- AND occurred_at >= DATE_TRUNC('month', NOW())
CREATE INDEX idx_usage_monthly_quota ON usage_events (team_id, type, occurred_at)
  WHERE type = 'MEETING_PROCESSED';

-- ── AUTH TOKENS ───────────────────────────────────────────────────────────

-- cleanup cron: delete expired tokens
CREATE INDEX idx_refresh_cleanup ON refresh_tokens (expires_at);
CREATE INDEX idx_email_verify_cleanup ON email_verification_tokens (expires_at);
CREATE INDEX idx_pwd_reset_cleanup ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;
```

---

## 5. Constraint & Rule Design

### Business Rule Constraints

```sql
-- ── CHECK CONSTRAINTS ─────────────────────────────────────────────────────

-- confidence_score must be valid probability
ALTER TABLE commitments
  ADD CONSTRAINT chk_commitment_confidence
  CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0);

ALTER TABLE action_items
  ADD CONSTRAINT chk_action_item_confidence
  CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0);

-- commitment_score must be 0–100
ALTER TABLE users
  ADD CONSTRAINT chk_user_commitment_score
  CHECK (commitment_score >= 0 AND commitment_score <= 100);

-- duration_minutes cannot be negative
ALTER TABLE meetings
  ADD CONSTRAINT chk_meeting_duration
  CHECK (duration_minutes IS NULL OR duration_minutes >= 0);

-- deferred_count cannot be negative
ALTER TABLE commitments
  ADD CONSTRAINT chk_deferred_count
  CHECK (deferred_count >= 0);

-- processing_attempts must be 0–10
ALTER TABLE meetings
  ADD CONSTRAINT chk_processing_attempts
  CHECK (processing_attempts >= 0 AND processing_attempts <= 10);

-- failed_login_attempts cannot be negative
ALTER TABLE users
  ADD CONSTRAINT chk_failed_attempts
  CHECK (failed_login_attempts >= 0);

-- meetings_used cannot be negative
ALTER TABLE teams
  ADD CONSTRAINT chk_meetings_used
  CHECK (meetings_used >= 0);

-- ended_at must be after started_at
ALTER TABLE meetings
  ADD CONSTRAINT chk_meeting_timing
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at);

-- resolved_at must be after created_at
ALTER TABLE commitments
  ADD CONSTRAINT chk_commitment_resolved_timing
  CHECK (resolved_at IS NULL OR resolved_at >= created_at);

-- slug format: only lowercase letters, numbers, hyphens
ALTER TABLE teams
  ADD CONSTRAINT chk_team_slug_format
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$');

-- amount cannot be negative
ALTER TABLE invoices
  ADD CONSTRAINT chk_invoice_amount
  CHECK (amount_due >= 0 AND amount_paid >= 0);


-- ── FOREIGN KEY CONSISTENCY ────────────────────────────────────────────────

-- DEFERRABLE FK: team_id on users ↔ owner_id on teams
-- This allows creating user + team in same transaction without ordering.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_team_id_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id)
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


-- ── TRIGGER: prevent OWNER role change ────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_owner_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'OWNER' AND NEW.role != 'OWNER' THEN
    RAISE EXCEPTION 'Cannot change OWNER role via database. Use transfer_ownership().';
  END IF;
  IF OLD.role != 'OWNER' AND NEW.role = 'OWNER' THEN
    RAISE EXCEPTION 'Cannot assign OWNER role directly. Use transfer_ownership().';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_owner_role
  BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_owner_role_change();


-- ── TRIGGER: increment meeting counts on insertion ────────────────────────

CREATE OR REPLACE FUNCTION increment_meeting_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'commitments' THEN
    UPDATE meetings SET commitment_count = commitment_count + 1
    WHERE id = NEW.meeting_id;
  ELSIF TG_TABLE_NAME = 'action_items' THEN
    UPDATE meetings SET action_item_count = action_item_count + 1
    WHERE id = NEW.meeting_id;
  ELSIF TG_TABLE_NAME = 'decisions' THEN
    UPDATE meetings SET decision_count = decision_count + 1
    WHERE id = NEW.meeting_id;
  ELSIF TG_TABLE_NAME = 'blockers' THEN
    UPDATE meetings SET blocker_count = blocker_count + 1
    WHERE id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_commitment_count
  AFTER INSERT ON commitments
  FOR EACH ROW EXECUTE FUNCTION increment_meeting_counts();

CREATE TRIGGER trg_increment_action_item_count
  AFTER INSERT ON action_items
  FOR EACH ROW EXECUTE FUNCTION increment_meeting_counts();

CREATE TRIGGER trg_increment_decision_count
  AFTER INSERT ON decisions
  FOR EACH ROW EXECUTE FUNCTION increment_meeting_counts();

CREATE TRIGGER trg_increment_blocker_count
  AFTER INSERT ON blockers
  FOR EACH ROW EXECUTE FUNCTION increment_meeting_counts();


-- ── TRIGGER: increment meetings_used when meeting → DONE ──────────────────

CREATE OR REPLACE FUNCTION track_meeting_processed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'DONE' AND OLD.status != 'DONE' THEN
    UPDATE teams SET meetings_used = meetings_used + 1
    WHERE id = NEW.team_id;

    INSERT INTO usage_events (id, team_id, type, metadata, occurred_at)
    VALUES (
      gen_random_uuid()::text,
      NEW.team_id,
      'MEETING_PROCESSED',
      jsonb_build_object(
        'meetingId',       NEW.id,
        'platform',        NEW.platform,
        'durationMinutes', COALESCE(NEW.duration_minutes, 0)
      ),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_track_meeting_processed
  AFTER UPDATE OF status ON meetings
  FOR EACH ROW EXECUTE FUNCTION track_meeting_processed();
```

---

## 6. MongoDB — Collection Schemas

### `transcripts` Collection

```javascript
// Database: vocaply
// Collection: transcripts
// Sharded by: team_id (at scale, when Atlas sharding is enabled)

// Document structure (JavaScript/BSON):
{
  // ── DOCUMENT IDENTITY ──────────────────────────────────────────────
  _id: ObjectId,                          // MongoDB auto-generated ObjectId
  meeting_id: String,                     // FK → PostgreSQL meetings.id
  team_id:    String,                     // For tenant-scoped queries + sharding

  recall_bot_id: String,
  platform:      String,                  // "zoom" | "google_meet" | "teams"

  // ── RAW TRANSCRIPT FROM RECALL.AI ──────────────────────────────────
  raw_transcript: [
    {
      speaker_tag:   String,              // "Speaker 1", "Speaker 2" (Recall.ai)
      speaker_email: String | null,       // Matched from meeting_participants
      speaker_name:  String | null,       // Matched display name
      speaker_user_id: String | null,     // PostgreSQL users.id if matched

      text: String,                       // Full assembled turn text

      start_time: Number,                 // Seconds from meeting start: 5.1
      end_time:   Number,                 // Seconds: 10.4
      confidence: Number,                 // ASR confidence 0.0–1.0

      words: [                            // Word-level timestamps (from Recall.ai)
        {
          text:       String,
          start_time: Number,
          end_time:   Number,
          confidence: Number
        }
      ],

      is_final: Boolean                   // Partial vs final ASR result
    }
    // ... one object per speaker turn
  ],

  // ── FULL TEXT (for Atlas Search) ───────────────────────────────────
  full_text: String,
  // Pre-built concatenated string:
  // "Ali Raza [00:05]: Good morning everyone...\nAhmed Hassan [01:12]: ..."
  // Indexed by Atlas Search (Lucene English analyzer) for cross-meeting search.

  // ── AI EXTRACTION RESULT ───────────────────────────────────────────
  ai_extraction: {
    extracted_at:   Date,
    model_used:     String,               // "claude-haiku-4-5-20251001"
    prompt_version: String,               // "extraction-v2.3"
    tokens_used: {
      input:  Number,
      output: Number,
      total:  Number
    },
    processing_ms: Number,

    commitments: [
      {
        text:            String,
        normalized_text: String,
        owner_name:      String,          // Speaker name as extracted
        owner_user_id:   String | null,   // Resolved PostgreSQL users.id
        due_date_raw:    String | null,
        due_date_iso:    String | null,   // ISO 8601 UTC datetime
        confidence:      Number,
        pg_id:           String | null    // PostgreSQL commitments.id (set after save)
      }
    ],

    action_items: [
      {
        text:          String,
        owner_name:    String,
        owner_user_id: String | null,
        due_date_raw:  String | null,
        due_date_iso:  String | null,
        priority:      String,            // "LOW"|"MEDIUM"|"HIGH"|"URGENT"
        confidence:    Number,
        pg_id:         String | null
      }
    ],

    decisions: [
      { text: String, made_by: String | null, confidence: Number }
    ],

    blockers: [
      { text: String, affected_user: String | null, confidence: Number }
    ],

    summary:         String,             // 3–5 bullet AI summary
    follow_up_email: String | null       // Draft follow-up email text
  },

  // ── CROSS-MEETING RESOLUTION RESULT ───────────────────────────────
  resolution_result: {
    resolved_at: Date,
    new_commitments_count:      Number,  // Created as new
    resolved_commitments_count: Number,  // Matched to historical + marked FULFILLED
    referenced_commitments:     [String] // IDs referenced but not resolved
  },

  // ── PROCESSING METADATA ────────────────────────────────────────────
  processing_status:       String,       // "pending"|"processing"|"done"|"failed"
  processing_started_at:   Date | null,
  processing_completed_at: Date | null,
  processing_error:        String | null,
  processing_attempts:     Number,

  // ── TIMESTAMPS ─────────────────────────────────────────────────────
  created_at: Date,
  updated_at: Date
}

// ── INDEXES ──────────────────────────────────────────────────────────────
db.transcripts.createIndex({ meeting_id: 1 }, { unique: true });
db.transcripts.createIndex({ team_id: 1, created_at: -1 });
db.transcripts.createIndex({ processing_status: 1 }, {
  partialFilterExpression: { processing_status: { $in: ["pending", "processing"] } }
});
// Partial index: only index unfinished transcripts (small working set)

// ── ATLAS SEARCH INDEX ────────────────────────────────────────────────────
// Created via Atlas UI or API:
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "full_text": {
        "type": "string",
        "analyzer": "lucene.english",
        // English analyzer: stemming, stopword removal, case folding
        "multi": {
          "exact": { "type": "string", "analyzer": "lucene.keyword" }
          // Exact match variant for phrase queries
        }
      },
      "team_id": { "type": "string" },   // For tenant-scoped search
      "meeting_id": { "type": "string" },
      "created_at": { "type": "date" }   // For date-range filtering
    }
  }
}

// ── SIZE ESTIMATES ────────────────────────────────────────────────────────
// 30-min standup:    ~20KB raw_transcript + ~5KB ai_extraction  = ~25KB
// 1-hour review:    ~50KB + ~10KB                                = ~60KB
// 2-hour all-hands: ~100KB + ~20KB                              = ~120KB
//
// At 1,000 meetings/month: 1,000 × avg 60KB = 60MB/month
// Atlas M10 free: 512MB → good for ~8,500 meetings before upgrading
// Atlas M30 ($57/mo): 40GB → ~666,000 meetings — sufficient for years
```

---

## 7. Redis — Key Space Design

```
KEY NAMING CONVENTION:
  {namespace}:{identifier}[:{sub-identifier}]
  All lowercase, colon-separated.
  No spaces, no slashes, no quotes.

NAMESPACE REGISTRY:
──────────────────────────────────────────────────────────────────────────────

── BULL QUEUES (managed by BullMQ, do not write directly) ────────────────────
bull:{queueName}:*                Various BullMQ internal keys

Queue names:
  bull:transcribe    → Store transcript in MongoDB → push to extract
  bull:extract       → Call AI Pipeline → save to PostgreSQL
  bull:notify        → Route and send all notifications
  bull:integrate     → Sync to Jira/Linear/Notion/Slack
  bull:deadline      → Cron: check overdue commitments
  bull:calendar      → Cron: scan connected calendars for new meetings

── OAUTH CSRF STATE ──────────────────────────────────────────────────────────
oauth:state:{hex_state}
  Value:   JSON: { "provider": "JIRA", "teamId": "team_01", "userId": "usr_01" }
  TTL:     600 seconds (10 minutes)
  Purpose: CSRF protection for OAuth flows. State param in URL must match.
  Example: oauth:state:a3f8b2c9d1e4f7b6c2d9e1a4f7b3c8d2

── RATE LIMITING (sliding window, sorted sets) ───────────────────────────────
ratelimit:ip:{ip_address}
  Value:   Sorted set of timestamps
  TTL:     60 seconds
  Limit:   100 requests/minute per IP
  Example: ratelimit:ip:103.21.4.5

ratelimit:api:{user_id}
  Value:   Sorted set of timestamps
  TTL:     60 seconds
  Limit:   200 requests/minute per user

ratelimit:login:{sha256_of_email}
  Value:   Sorted set of timestamps
  TTL:     900 seconds (15 minutes)
  Limit:   5 attempts per 15-minute window (brute force protection)
  Note:    Use SHA-256(email) as key — never expose raw email in Redis key

ratelimit:resend:{sha256_of_email}
  TTL:     60 seconds
  Limit:   1 resend per minute

ratelimit:reset:{sha256_of_email}
  TTL:     3600 seconds
  Limit:   3 reset requests per hour

── BOT DEDUPLICATION ─────────────────────────────────────────────────────────
bot:scheduled:{platform}:{platform_meeting_id}
  Value:   PostgreSQL meetings.id
  TTL:     14400 seconds (4 hours after meeting start)
  Purpose: Prevents 2 bots joining same meeting when 5 users share calendar event
  Examples:
    bot:scheduled:zoom:123456789
    bot:scheduled:google_meet:abc-defg-hij
    bot:scheduled:teams:hash_of_join_url

── CACHING (cache-aside pattern) ─────────────────────────────────────────────
cache:user:{user_id}
  Value:   JSON user object (id, name, email, role, teamId, commitmentScore)
  TTL:     300 seconds (5 minutes)
  Invalidate: on profile update, role change, team change

cache:team:plan:{team_id}
  Value:   JSON: { "plan": "GROWTH", "meetingsUsed": 34, "meetingsLimit": 120 }
  TTL:     3600 seconds (1 hour)
  Invalidate: on plan upgrade/downgrade, on meetings_used increment

cache:team:members:{team_id}
  Value:   JSON array of member objects (for dashboard member list)
  TTL:     300 seconds (5 minutes)
  Invalidate: on member invite/remove/role change

cache:team:stats:{team_id}:{year_month}
  Value:   JSON commitment statistics for this month
  TTL:     300 seconds (5 minutes)
  Invalidate: on any commitment status change for this team
  Example: cache:team:stats:team_01:2026-05

cache:meeting:detail:{meeting_id}
  Value:   JSON meeting detail with counts
  TTL:     86400 seconds (24 hours — meetings don't change after DONE)
  Invalidate: never (TTL expiry is sufficient for DONE meetings)

cache:analytics:overview:{team_id}:{period_hash}
  Value:   JSON analytics overview object
  TTL:     300 seconds
  Invalidate: on any data change for this team

── NOTIFICATION DEDUPLICATION ────────────────────────────────────────────────
notif:dedup:{type}:{user_id}:{resource_id}
  Value:   "1"
  TTL:     Varies by notification type:
           DEADLINE_TODAY:      86400s (24h — don't send twice in same day)
           COMMITMENT_MISSED:   3600s  (1h — don't spam on retry)
           WEEKLY_DIGEST:       604800s (7d — once per week)
           MEETING_PROCESSED:   86400s
  Purpose: Prevents duplicate notifications from retry logic or system restarts
  Examples:
    notif:dedup:COMMITMENT_MISSED:usr_01:com_abc123
    notif:dedup:DEADLINE_TODAY:usr_02:com_xyz789
    notif:dedup:WEEKLY_DIGEST:team_01:2026-W20

── CALENDAR SYNC TRACKING ────────────────────────────────────────────────────
sync:calendar:lock:{user_id}
  Value:   "1"
  TTL:     300 seconds (5 minutes)
  Purpose: Prevents concurrent calendar syncs for same user
           (set at start of sync, released when done)
  Example: sync:calendar:lock:usr_01

── IDEMPOTENCY KEYS ──────────────────────────────────────────────────────────
idempotency:{team_id}:{idempotency_key}
  Value:   JSON: { "bodyHash": "sha256...", "statusCode": 201, "response": {...} }
  TTL:     86400 seconds (24 hours)
  Purpose: Safe client retries — same response returned without re-processing
  Example: idempotency:team_01:idem_550e8400-e29b-41d4-a716-446655440000

── SESSION PRESENCE ──────────────────────────────────────────────────────────
presence:online:{team_id}
  Value:   Sorted set: member { user_id: timestamp_last_seen }
  TTL:     None (managed by score expiry)
  Purpose: Online presence for team dashboard ("3 members online")
  Note:    Members pinged via Socket.io heartbeat every 30 seconds

── WEBHOOK IDEMPOTENCY ───────────────────────────────────────────────────────
webhook:processed:{provider}:{event_id}
  Value:   "1"
  TTL:     86400 seconds (24 hours)
  Purpose: Recall.ai / Stripe / Jira may send duplicate events on retry
  Examples:
    webhook:processed:recall:bot_abc123_done
    webhook:processed:stripe:evt_abc123def456
    webhook:processed:jira:issue_update_TECH-142_1716900000

── ACTIVE RECORDING TRACKING ────────────────────────────────────────────────
recording:active:{meeting_id}
  Value:   JSON: { "botId": "bot_abc", "startedAt": "ISO", "teamId": "team_01" }
  TTL:     14400 seconds (4 hours — auto-expires even if webhook missed)
  Purpose: Dashboard "currently recording" indicator without DB poll
  Set:     When bot.recording_started webhook received
  Deleted: When bot.done or bot.failed webhook received
```

---

## 8. Multi-Tenancy Architecture

### Three-Layer Isolation Design

```
LAYER 1 — APPLICATION LAYER (Primary Enforcement)
  Every service function validates:
    if (resource.teamId !== request.user.teamId) throw ForbiddenError()
  
  Every query includes team_id in WHERE clause:
    prisma.commitment.findMany({ where: { teamId: user.teamId, ...filters } })

LAYER 2 — ORM MIDDLEWARE (Secondary Enforcement)
  Prisma $use middleware auto-injects teamId on every query.
  If teamId somehow missing from application code → middleware catches it.

  const TENANT_TABLES = [
    'Meeting', 'Commitment', 'ActionItem', 'Decision',
    'Blocker', 'TeamIntegration', 'UsageEvent', 'AsyncJob'
  ]

  prisma.$use(async (params, next) => {
    if (TENANT_TABLES.includes(params.model ?? '')) {
      const teamId = getCurrentTeamId()  // From request context

      if (['findMany', 'findFirst', 'count', 'aggregate'].includes(params.action)) {
        params.args.where = { ...params.args.where, teamId }
      }
      if (params.action === 'create') {
        params.args.data = { ...params.args.data, teamId }
      }
      if (params.action === 'createMany') {
        params.args.data = params.args.data.map((d: any) => ({ ...d, teamId }))
      }
    }
    return next(params)
  })

LAYER 3 — ROW-LEVEL SECURITY (Database Enforcement)
  PostgreSQL RLS as final backstop. Catches any bug in layers 1 or 2.
  Configured in Supabase dashboard + DDL below.
  See Section 10 for full RLS policy definitions.
```

### Team Switching Architecture

```sql
-- SET LOCAL used at start of each request (Supabase RLS integration)
-- This sets the team context for the duration of the transaction.

-- Application layer (TypeScript):
await prisma.$executeRaw`SET LOCAL app.current_team_id = ${teamId}`;

-- PostgreSQL session variable used by RLS policies:
-- current_setting('app.current_team_id')
```

---

## 9. Encryption Design

### AES-256-GCM for OAuth Token Storage

```
ALGORITHM:   AES-256-GCM (authenticated encryption with associated data)
KEY:         ENCRYPTION_KEY environment variable
             Must be 64-character hex string (32 bytes)
             Never in code. Always in secrets manager.

IV (nonce):  16 bytes, cryptographically random per encryption
             NEVER reuse IV with same key — catastrophic security failure

AUTH TAG:    16 bytes (GCM integrity guarantee)
             If tampered → decryption throws → storage corruption detected

STORAGE FORMAT: base64( iv[16] || authTag[16] || ciphertext[N] )
  → Stored as single string in access_token_enc / refresh_token_enc columns
  → Length varies: input_length + 32 bytes overhead

ENCRYPTION (Node.js):
  const iv         = crypto.randomBytes(16)
  const cipher     = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag    = cipher.getAuthTag()
  const combined   = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64')

DECRYPTION (Node.js):
  const combined   = Buffer.from(ciphertext, 'base64')
  const iv         = combined.subarray(0, 16)
  const authTag    = combined.subarray(16, 32)
  const encrypted  = combined.subarray(32)
  const decipher   = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  // Throws if authTag doesn't match — data tampering detected
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')

KEY ROTATION PROCEDURE (zero-downtime):
  1. Generate new ENCRYPTION_KEY_V2
  2. Deploy: decrypt with V1, re-encrypt with V2, store back
  3. Background job processes all encrypted rows in team_integrations, user_integrations
  4. After all rows re-encrypted: remove ENCRYPTION_KEY_V1
  5. Total rotation time: ~30 minutes at 10K teams

WHAT IS ENCRYPTED:
  team_integrations.access_token_enc
  team_integrations.refresh_token_enc
  user_integrations.access_token_enc
  user_integrations.refresh_token_enc
  users.totp_secret_enc (TOTP MFA secret)
  mfa_credentials.totp_secret_enc
  teams.scim_token_hash (only hash, not encrypted — used for verification)

WHAT IS HASHED (SHA-256, one-way):
  refresh_tokens.token_hash
  email_verification_tokens.token_hash
  password_reset_tokens.token_hash
  team_invitations.token_hash
  api_keys.key_hash
  webhook_registrations.signing_key_hash
  teams.scim_token_hash

WHAT IS BCRYPT (12 rounds):
  users.password_hash
```

---

## 10. Row-Level Security (RLS) Policies

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- RLS POLICIES
-- Third layer of tenant isolation. Guards against application bugs.
-- Enabled on all tenant tables.
-- app.current_team_id set at start of each request by application layer.
-- ─────────────────────────────────────────────────────────────────────────

-- ── ENABLE RLS ────────────────────────────────────────────────────────────

ALTER TABLE meetings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_integrations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE async_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

-- ── POLICIES ──────────────────────────────────────────────────────────────

-- Meetings: only visible to members of the same team
CREATE POLICY meetings_team_isolation ON meetings
  FOR ALL
  USING (team_id = current_setting('app.current_team_id', TRUE)::text);

-- Commitments: same isolation
CREATE POLICY commitments_team_isolation ON commitments
  FOR ALL
  USING (team_id = current_setting('app.current_team_id', TRUE)::text);

-- Action Items: same isolation
CREATE POLICY action_items_team_isolation ON action_items
  FOR ALL
  USING (team_id = current_setting('app.current_team_id', TRUE)::text);

-- Decisions: same
CREATE POLICY decisions_team_isolation ON decisions
  FOR ALL
  USING (team_id = current_setting('app.current_team_id', TRUE)::text);

-- Blockers: same
CREATE POLICY blockers_team_isolation ON blockers
  FOR ALL
  USING (team_id = current_setting('app.current_team_id', TRUE)::text);

-- Team Integrations: same
CREATE POLICY team_integrations_isolation ON team_integrations
  FOR ALL
  USING (team_id = current_setting('app.current_team_id', TRUE)::text);

-- Usage Events: same
CREATE POLICY usage_events_isolation ON usage_events
  FOR ALL
  USING (team_id = current_setting('app.current_team_id', TRUE)::text);

-- Async Jobs: same
CREATE POLICY async_jobs_isolation ON async_jobs
  FOR ALL
  USING (team_id = current_setting('app.current_team_id', TRUE)::text);

-- In-App Notifications: scoped to individual user
CREATE POLICY in_app_notif_user_isolation ON in_app_notifications
  FOR ALL
  USING (
    team_id = current_setting('app.current_team_id', TRUE)::text
    AND user_id = current_setting('app.current_user_id', TRUE)::text
  );

-- ── BYPASS FOR SYSTEM/CRON OPERATIONS ─────────────────────────────────────
-- Service role (used by cron workers and webhooks) bypasses RLS entirely.
-- Supabase: use service role key for backend operations.
-- Row-level policies apply only to anon and authenticated roles.

-- For Prisma: use two DB connection strings:
--   DATABASE_URL:     uses anon/authenticated role → RLS enforced
--   DIRECT_URL:       uses service role → RLS bypassed (for migrations + crons)
```

---

## 11. Data Relationships & ER Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        VOCAPLY ENTITY RELATIONSHIPS                             │
└─────────────────────────────────────────────────────────────────────────────────┘

                           ┌──────────────────┐
                           │      TEAMS        │
                           │──────────────────│
                           │ id (PK)          │
                           │ name, slug       │
                           │ plan             │
                           │ settings (JSONB) │
                           └────────┬─────────┘
                                    │ 1
                    ┌───────────────┼────────────────────────────┐
                    │               │                            │
                    │ N             │ N                          │ N
          ┌─────────┴──────┐  ┌────┴────────────┐  ┌───────────┴──────────┐
          │     USERS       │  │    MEETINGS      │  │   SUBSCRIPTIONS      │
          │────────────────│  │────────────────│  │──────────────────────│
          │ id (PK)        │  │ id (PK)        │  │ stripe_subscription_id│
          │ email, name    │  │ team_id (FK)   │  │ plan, status         │
          │ team_id (FK)   │  │ status         │  └──────────────────────┘
          │ role           │  │ platform       │
          │ commit_score   │  │ recall_bot_id  │
          └────────┬───────┘  └────────┬───────┘
                   │                   │ 1
                   │ 1         ┌───────┼────────────────────────────┐
                   │           │ N     │ N              │ N          │ N
                   │  ┌────────┴──┐  ┌┴──────────┐  ┌─┴────────┐ ┌┴──────────┐
                   │  │PARTICIPANTS│  │COMMITMENTS│  │ACT. ITEMS│ │DECISIONS  │
                   │  │──────────│  │──────────│  │──────────│ │ + BLOCKERS│
                   │  │meeting_id │  │meeting_id │  │meeting_id│ └──────────┘
                   │  │user_id FK │  │owner_id   │  │assignee  │
                   │  │speaker_tag│  │status     │  │jira_id   │
                   │  └──────────┘  │confidence │  └──────────┘
                   │               │normalized │
                   │               │text       │
                   │               └────┬──────┘
                   └────────────────────┘
                      (user.id = commitment.owner_id)
                      (user.id = commitment.resolved via meeting)

AUTH TABLES (standalone, link to users):
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ REFRESH      │  │ EMAIL VERIFY │  │ PASSWORD     │  │ MFA          │
  │ TOKENS       │  │ TOKENS       │  │ RESET TOKENS │  │ CREDENTIALS  │
  │──────────────│  │──────────────│  │──────────────│  │──────────────│
  │ user_id (FK) │  │ user_id (FK) │  │ user_id (FK) │  │ user_id (FK) │
  │ token_hash   │  │ token_hash   │  │ token_hash   │  │ method       │
  │ expires_at   │  │ expires_at   │  │ used_at      │  │ totp_secret  │
  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

INTEGRATION TABLES:
  ┌──────────────────┐  ┌──────────────────┐
  │ TEAM_INTEGRATIONS│  │ USER_INTEGRATIONS │
  │──────────────────│  │──────────────────│
  │ team_id (FK)     │  │ user_id (FK)     │
  │ provider (ENUM)  │  │ provider (ENUM)  │
  │ access_token_enc │  │ access_token_enc │
  │ metadata (JSONB) │  │ calendar_id      │
  └──────────────────┘  └──────────────────┘

ANALYTICS TABLES:
  ┌──────────────┐  ┌──────────────────────────┐
  │ USAGE_EVENTS │  │ COMMIT_SCORE_SNAPSHOTS    │
  │──────────────│  │──────────────────────────│
  │ team_id (FK) │  │ user_id (FK)             │
  │ type (ENUM)  │  │ team_id (FK)             │
  │ occurred_at  │  │ week_start               │
  │ metadata     │  │ commitment_score         │
  └──────────────┘  └──────────────────────────┘
```

---

## 12. Partitioning & Archival Strategy

### Partitioning Plan

```sql
-- ── USAGE_EVENTS — Monthly Range Partitioning (at ~10M rows) ──────────────
-- Trigger: Table exceeds 10M rows (~Month 18 at 500 teams on GROWTH plan)

-- Step 1: Rename existing table
ALTER TABLE usage_events RENAME TO usage_events_legacy;

-- Step 2: Create partitioned parent
CREATE TABLE usage_events (
  id          VARCHAR(36)         NOT NULL,
  team_id     VARCHAR(36)         NOT NULL,
  type        usage_event_type    NOT NULL,
  quantity    INT                 NOT NULL DEFAULT 1,
  metadata    JSONB               NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ         NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (occurred_at);

-- Step 3: Create monthly partitions
CREATE TABLE usage_events_2026_01 PARTITION OF usage_events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE usage_events_2026_02 PARTITION OF usage_events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- (Continue for each month)

-- Step 4: Each partition gets its own indexes
CREATE INDEX idx_usage_2026_01_team_type ON usage_events_2026_01 (team_id, type, occurred_at);
-- PostgreSQL auto-routes queries to correct partition based on occurred_at predicate

-- Step 5: Automated partition creation cron (monthly)
-- Creates next month's partition on 25th of current month


-- ── IN_APP_NOTIFICATIONS — Cleanup Strategy ───────────────────────────────
-- Not partitioned, but aggressively cleaned via cron:
-- DELETE FROM in_app_notifications
-- WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '90 days'
-- Keeps table small. Read notifications have no business value after 90 days.


-- ── COMMITMENT_SCORE_SNAPSHOTS — Retention ────────────────────────────────
-- Keep: 2 years of weekly snapshots per user
-- Archive: older than 2 years → S3 CSV export → delete from PostgreSQL
-- Volume: 2 years × 52 weeks × 1000 users = 104,000 rows (tiny, no partition needed)


-- ── ASYNC_JOBS — TTL Cleanup ──────────────────────────────────────────────
-- Completed/failed jobs older than 30 days are deleted:
-- DELETE FROM async_jobs
-- WHERE status IN ('COMPLETED', 'FAILED', 'CANCELLED')
-- AND created_at < NOW() - INTERVAL '30 days'
```

### Archival Strategy

```
DATA             RETENTION    HOT (PostgreSQL)    COLD (S3)
──────────────────────────────────────────────────────────────────
usage_events     2 years      Current + 2 years   → Archive + delete
commitments      Plan-based   FREE: 7d, STARTER: 90d,
                              GROWTH: 1yr, BUSINESS: unlimited
transcripts      Plan-based   MongoDB (same retention)
score_snapshots  2 years      Always hot (small volume)
auth tokens      Expiry + 30d Auto-deleted by cron
in_app_notifs    90 days      Read = 90d, Unread = indefinite
meetings         Plan-based   Same as commitments
invoices         7 years      Always (legal/financial requirement)
```

---

## 13. Migration Strategy

### Principles

```
1. ALL MIGRATIONS ARE FORWARD-ONLY.
   Never write rollback SQL. If a migration has a bug, write a new
   migration to fix it. Rollback DDL in production is dangerous.

2. BACKWARD-COMPATIBLE FIRST.
   Phase 1: Add new column (nullable). Deploy new code reading new column.
   Phase 2: Backfill existing rows. Deploy code writing new column.
   Phase 3 (optional): Add NOT NULL constraint after all rows populated.
   Phase 4 (optional): Drop old column after code no longer reads it.

3. NEVER LOCK LARGE TABLES.
   ADD COLUMN: Fast in PostgreSQL (no table scan for nullable columns).
   ADD INDEX:  Always use CREATE INDEX CONCURRENTLY (no table lock).
   ADD CONSTRAINT: Use ALTER TABLE ... NOT VALID, then VALIDATE CONSTRAINT
                   (validates existing rows without holding lock).

4. PRISMA MIGRATIONS ONLY.
   Never apply DDL directly to production. Always:
     pnpm prisma migrate dev   (development)
     pnpm prisma migrate deploy (production via CI/CD)
   Migration files are version-controlled in prisma/migrations/

5. ZERO-DOWNTIME DEPLOYMENTS.
   Code deployed before schema migration OR after — never both simultaneously.
   Feature flags gate new code paths until migration is verified.
```

### Example Safe Migration Sequence

```sql
-- SCENARIO: Add normalized_text column to commitments
-- (Was forgotten in initial schema — being added in v1.2.0)

-- Step 1: Add nullable column (instant, no lock)
-- prisma/migrations/20260601000000_add_normalized_text/migration.sql
ALTER TABLE commitments ADD COLUMN normalized_text TEXT;

-- Step 2: Backfill in batches (avoid long transactions)
-- Run via separate backfill script, not in migration file:
DO $$
DECLARE
  batch_size INT := 1000;
  last_id VARCHAR(36) := '';
  rows_updated INT;
BEGIN
  LOOP
    UPDATE commitments
    SET normalized_text = LOWER(text)  -- Simplified; real logic in Python
    WHERE id IN (
      SELECT id FROM commitments
      WHERE normalized_text IS NULL AND id > last_id
      ORDER BY id
      LIMIT batch_size
    )
    RETURNING id INTO last_id;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    PERFORM pg_sleep(0.1);  -- Brief pause between batches
  END LOOP;
END;
$$;

-- Step 3: Add index concurrently (no table lock)
CREATE INDEX CONCURRENTLY idx_commit_normalized_text
  ON commitments (team_id, normalized_text)
  WHERE normalized_text IS NOT NULL;

-- Step 4: (Optional, if required) Add NOT NULL constraint
-- ALTER TABLE commitments ALTER COLUMN normalized_text SET NOT NULL;
-- (Only safe after backfill is 100% complete and verified)
```

---

## 14. Capacity Estimates

### Storage Projections

```
POSTGRESQL GROWTH (at 1,000 teams on GROWTH plan = 120 meetings/month each):

  TABLE                  ROWS/MONTH    AVG ROW SIZE    GB/MONTH
  ─────────────────────────────────────────────────────────────
  meetings               120,000       ~500 bytes      ~60MB
  commitments            360,000       ~400 bytes      ~144MB
    (avg 3 per meeting)
  action_items           600,000       ~350 bytes      ~210MB
    (avg 5 per meeting)
  meeting_participants   600,000       ~200 bytes      ~120MB
    (avg 5 per meeting)
  decisions              240,000       ~200 bytes      ~48MB
  blockers               120,000       ~200 bytes      ~24MB
  usage_events           120,000       ~200 bytes      ~24MB
  in_app_notifications   500,000       ~250 bytes      ~125MB
  ─────────────────────────────────────────────────────────────
  TOTAL/MONTH                                          ~755MB/month
  TOTAL/YEAR                                           ~9GB/year

  Supabase Pro (8GB included): upgrade to Pro+ at Month 12
  AWS RDS db.t3.medium (20GB SSD): comfortable for 2 years

MONGODB GROWTH:
  1,000 teams × 120 meetings × avg 60KB = 7.2GB/month
  Atlas M10 (10GB): replace with M30 at Month 2
  Atlas M30 ($57/mo, 40GB): comfortable for 6 months
  At scale: M50 ($200/mo, 160GB) handles 1M+ meetings

REDIS MEMORY:
  Cache entries:         ~500KB per team × 1,000 teams = ~500MB
  Bull queues:           ~1MB peak
  Rate limit counters:   ~100KB
  Dedup keys:            ~50KB
  Total:                 ~600MB
  Upstash free (256MB): upgrade to Pro ($20/mo) at Month 1
  At scale: Redis Cluster with 4GB per node
```

### Query Performance Targets

```
QUERY                                    TARGET    HOW
─────────────────────────────────────────────────────────────────────────
Monthly quota check (meetings_used)      < 5ms     Denormalized + Redis cache
Team commitment list (20 items)          < 20ms    Composite index + cursor page
Member commitment score                  < 5ms     Denormalized on users table
Dashboard analytics overview            < 100ms   Pre-computed + Redis cache
Transcript full-text search             < 200ms   MongoDB Atlas Search
Bot dedup check (Redis)                  < 1ms     Redis SETNX
Rate limit check (Lua atomic)            < 2ms     Redis sorted set + Lua
Cron: find overdue commitments           < 50ms    Partial index on status=PENDING
Cron: find expiring tokens               < 10ms    Partial index on is_active=TRUE
```

---

## 15. Cleanup & Retention Jobs

```sql
-- ── DAILY CLEANUP CRON (runs at 3:00 AM UTC) ─────────────────────────────

-- 1. Delete expired refresh tokens (old sessions)
DELETE FROM refresh_tokens WHERE expires_at < NOW();

-- 2. Delete expired email verification tokens
DELETE FROM email_verification_tokens WHERE expires_at < NOW();

-- 3. Delete expired OR used password reset tokens
DELETE FROM password_reset_tokens
  WHERE expires_at < NOW() OR used_at IS NOT NULL;

-- 4. Delete expired team invitations (unclaimed after 7 days)
DELETE FROM team_invitations
  WHERE expires_at < NOW() AND accepted_at IS NULL;

-- 5. Delete read in-app notifications older than 90 days
DELETE FROM in_app_notifications
  WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '90 days';

-- 6. Delete completed/failed async jobs older than 30 days
DELETE FROM async_jobs
  WHERE status IN ('COMPLETED', 'FAILED', 'CANCELLED')
  AND created_at < NOW() - INTERVAL '30 days';


-- ── WEEKLY CLEANUP (runs Sunday at 2:00 AM UTC) ───────────────────────────

-- 7. Archive usage_events older than 2 years
-- (Copy to S3 first via background job, then delete)
DELETE FROM usage_events WHERE occurred_at < NOW() - INTERVAL '2 years';

-- 8. Write weekly commitment score snapshots for all users
-- (See commitment_score_snapshots table — written by score service)
INSERT INTO commitment_score_snapshots (...)
  SELECT ... FROM commitments
  WHERE created_at >= DATE_TRUNC('week', NOW() - INTERVAL '1 week')
  GROUP BY user_id, team_id;


-- ── MONTHLY CLEANUP (runs 1st of month at 1:00 AM UTC) ─────────────────────

-- 9. Reset meetings_used counter when billing cycle starts
-- (Triggered by Stripe invoice.payment_succeeded webhook, not cron)
-- Shown here for completeness:
UPDATE teams SET meetings_used = 0
  WHERE billing_cycle_end < NOW() AND plan != 'FREE';

-- 10. Enforce plan-based data retention
-- FREE plan: delete meetings older than 7 days
-- STARTER plan: delete meetings older than 90 days
-- (Soft deletion — remove from queries, hard delete after grace period)
UPDATE meetings SET status = 'CANCELLED'
  WHERE team_id IN (SELECT id FROM teams WHERE plan = 'FREE')
  AND scheduled_at < NOW() - INTERVAL '7 days'
  AND status = 'DONE';

-- ── TOKEN REFRESH CRON (runs every 15 minutes) ────────────────────────────

-- 11. Find integration tokens expiring in next 30 minutes
SELECT id, team_id, provider
FROM team_integrations
WHERE is_active = TRUE
  AND token_expires_at IS NOT NULL
  AND token_expires_at < NOW() + INTERVAL '30 minutes'
  AND token_expires_at > NOW();  -- Not already expired
-- Action: For each row, call provider token refresh API, update token

-- 12. Same for user calendar tokens
SELECT id, user_id, provider
FROM user_integrations
WHERE sync_enabled = TRUE
  AND token_expires_at IS NOT NULL
  AND token_expires_at < NOW() + INTERVAL '30 minutes';
```

---

## 16. Critical Query Patterns

### Meeting Processing Pipeline

```sql
-- ── Find meeting by Recall.ai bot ID (webhook handler, < 5ms) ─────────────
SELECT id, team_id, status, started_at, mongo_transcript_id
FROM meetings
WHERE recall_bot_id = $1
LIMIT 1;
-- Uses: idx_mtg_recall_bot (unique partial index)

-- ── Update meeting status (bot.done webhook) ──────────────────────────────
UPDATE meetings
SET status = 'PROCESSING',
    ended_at = NOW(),
    duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60,
    processing_started_at = NOW(),
    updated_at = NOW()
WHERE recall_bot_id = $1
  AND status = 'RECORDING'  -- Guard against duplicate webhooks
RETURNING id, team_id, mongo_transcript_id;

-- ── Dedup check before scheduling bot ─────────────────────────────────────
SELECT id FROM meetings
WHERE team_id = $1
  AND platform_meeting_id = $2
  AND status NOT IN ('DONE', 'FAILED', 'CANCELLED')
LIMIT 1;
-- Uses: idx_mtg_platform_dedup
```

### Commitment Queries

```sql
-- ── Team commitment tracker (main dashboard query) ────────────────────────
SELECT
  c.id, c.text, c.due_date, c.due_date_raw, c.status,
  c.confidence_score, c.deferred_count, c.created_at,
  u.id AS owner_id, u.name AS owner_name,
  u.avatar_url AS owner_avatar,
  u.commitment_score AS owner_score,
  m.id AS meeting_id, m.title AS meeting_title,
  m.scheduled_at AS meeting_date
FROM commitments c
JOIN users u ON c.owner_id = u.id
JOIN meetings m ON c.meeting_id = m.id
WHERE c.team_id = $1
  AND c.status = ANY($2::commitment_status[])  -- e.g. ARRAY['PENDING','MISSED']
  AND (c.owner_id = $3 OR $3 IS NULL)          -- optional filter by member
  AND c.confidence_score >= 0.5               -- filter low-confidence
ORDER BY
  CASE WHEN c.status = 'MISSED'   THEN 1
       WHEN c.status = 'PENDING'  THEN 2
       WHEN c.status = 'DEFERRED' THEN 3
       ELSE 4 END,
  c.due_date ASC NULLS LAST,
  c.created_at DESC
LIMIT $4 OFFSET $5;
-- Uses: idx_commit_team_status, idx_commit_owner_id

-- ── Cron: mark PENDING commitments as MISSED (6 PM daily) ────────────────
WITH to_miss AS (
  SELECT id, team_id, owner_id
  FROM commitments
  WHERE status = 'PENDING'
    AND due_date < NOW()
    AND missed_alert_sent_at IS NULL  -- Not yet alerted
  LIMIT 500  -- Process in batches to avoid long transactions
)
UPDATE commitments c
SET status = 'MISSED',
    resolved_at = NOW(),
    missed_alert_sent_at = NOW(),
    updated_at = NOW()
FROM to_miss
WHERE c.id = to_miss.id
RETURNING c.id, c.team_id, c.owner_id, c.text, c.due_date;
-- Uses: idx_commit_missed_alert (critical partial index)

-- ── Commitment stats for team analytics ──────────────────────────────────
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'FULFILLED') AS fulfilled,
  COUNT(*) FILTER (WHERE status = 'MISSED')    AS missed,
  COUNT(*) FILTER (WHERE status = 'PENDING')   AS pending,
  COUNT(*) FILTER (WHERE status = 'DEFERRED')  AS deferred,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'FULFILLED')::NUMERIC
    / NULLIF(COUNT(*) FILTER (WHERE status IN ('FULFILLED','MISSED')), 0) * 100
  , 1) AS fulfillment_rate,
  ROUND(
    AVG(
      CASE WHEN status = 'MISSED' AND due_date IS NOT NULL
      THEN EXTRACT(EPOCH FROM (resolved_at - due_date)) / 86400.0
      END
    ), 1
  ) AS avg_days_overdue
FROM commitments
WHERE team_id = $1
  AND created_at >= $2  -- period_start
  AND created_at <  $3  -- period_end
  AND confidence_score >= 0.5;
-- Uses: idx_commit_team_created_at

-- ── Member analytics breakdown ────────────────────────────────────────────
SELECT
  u.id, u.name, u.avatar_url, u.role,
  u.commitment_score,
  COUNT(c.id) AS total,
  COUNT(c.id) FILTER (WHERE c.status = 'FULFILLED') AS fulfilled,
  COUNT(c.id) FILTER (WHERE c.status = 'MISSED')    AS missed,
  COUNT(c.id) FILTER (WHERE c.status = 'PENDING')   AS pending,
  ROUND(
    COUNT(c.id) FILTER (WHERE c.status = 'FULFILLED')::NUMERIC
    / NULLIF(COUNT(c.id) FILTER (WHERE c.status IN ('FULFILLED','MISSED')), 0) * 100
  , 1) AS fulfillment_rate
FROM users u
LEFT JOIN commitments c
  ON c.owner_id = u.id
  AND c.team_id = $1
  AND c.created_at >= $2
  AND c.created_at <  $3
  AND c.confidence_score >= 0.5
WHERE u.team_id = $1
  AND u.deleted_at IS NULL
GROUP BY u.id, u.name, u.avatar_url, u.role, u.commitment_score
ORDER BY u.commitment_score DESC;
```

### Monthly Quota Enforcement

```sql
-- ── Fast quota check (cached in Redis, fallback to this) ──────────────────
SELECT COUNT(*) AS meetings_this_month
FROM usage_events
WHERE team_id = $1
  AND type = 'MEETING_PROCESSED'
  AND occurred_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')
  AND occurred_at <  DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month';
-- Uses: idx_usage_monthly_quota (partial index on type='MEETING_PROCESSED')
-- Target: < 5ms. Cached in Redis for 1 hour after each meeting.

-- ── Verify quota before meeting creation (also check denormalized counter) ─
SELECT t.meetings_used, t.plan,
  CASE t.plan
    WHEN 'FREE'       THEN 5
    WHEN 'STARTER'    THEN 40
    WHEN 'GROWTH'     THEN 120
    WHEN 'BUSINESS'   THEN 300
    WHEN 'ENTERPRISE' THEN -1  -- Unlimited
  END AS meetings_limit
FROM teams t
WHERE t.id = $1;
-- Uses denormalized teams.meetings_used — no COUNT query needed.
-- Target: < 2ms (simple PK lookup + Redis cache hit).
```

---

## 17. Schema Summary

```
POSTGRESQL TABLES (23 total):

 #  TABLE                         ROWS ESTIMATE    KEY CONCERN
────────────────────────────────────────────────────────────────────────
 1  users                         Medium (10K–1M)  email unique, team_id
 2  refresh_tokens                High (50K–5M)    cleanup daily
 3  email_verification_tokens     Low               cleanup daily
 4  password_reset_tokens         Low               cleanup daily
 5  mfa_credentials               Low               webauthn future
 6  teams                         Medium (1K–50K)  slug unique
 7  team_invitations              Low               7-day TTL
 8  meetings                      High (100K–10M)  recall_bot dedup
 9  meeting_participants          High (500K–50M)  speaker mapping
10  commitments                   High (500K–50M)  CORE — cron indexes
11  action_items                  High (1M–100M)   jira sync index
12  decisions                     Medium            append only
13  blockers                      Medium            resolved tracking
14  team_integrations             Low (4/team max)  encrypted tokens
15  user_integrations             Low (2/user max)  encrypted tokens
16  subscriptions                 Low (1/team)      Stripe sync
17  invoices                      Low               financial retention
18  usage_events                  Very High         partitioned at scale
19  commitment_score_snapshots    Medium            weekly write
20  notification_preferences      Medium            JSONB config
21  in_app_notifications          High              90-day cleanup
22  api_keys                      Low               key_hash lookup
23  webhook_registrations         Low               event array GIN
24  async_jobs                    Low               30-day cleanup
────────────────────────────────────────────────────────────────────────

MONGODB COLLECTIONS (1):
  transcripts — variable-size documents, Atlas Search indexed

REDIS KEY NAMESPACES (10):
  bull:*          (queue jobs)
  oauth:state:*   (CSRF tokens)
  ratelimit:*     (sliding window)
  bot:scheduled:* (dedup flags)
  cache:*         (hot reads)
  notif:dedup:*   (alert dedup)
  sync:calendar:* (sync locks)
  idempotency:*   (safe retries)
  presence:*      (online users)
  webhook:*       (event dedup)

INDEXES: 50+ (35 PostgreSQL + Atlas Search config)
ENCRYPTION: AES-256-GCM on 6 columns
HASHING: SHA-256 on 7 columns, bcrypt on 1 column
TENANT ISOLATION: 3 layers (app + ORM + RLS)
TRIGGERS: 8 (updated_at × 6, business rules × 2)
RLS POLICIES: 9 tables
ENUMS: 13

SCALABILITY CEILING:
  PostgreSQL: 1M+ teams with read replicas + partitioning
  MongoDB:    Unlimited with Atlas sharding on team_id
  Redis:      Redis Cluster handles any throughput
```

---

*Document: DB-SCHEMA-001 | Vocaply | Version 2.0 | June 2026*
*Senior Database Architect Edition | Production-Grade | 1M+ Users*
*PostgreSQL (Supabase) + MongoDB (Atlas) + Redis (Upstash)*
*23 PostgreSQL tables · 1 MongoDB collection · 10 Redis namespaces*
*Multi-tenant | AES-256-GCM encryption | Row-Level Security | Zero-downtime migrations*
