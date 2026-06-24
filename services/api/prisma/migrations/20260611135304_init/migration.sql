-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('ZOOM', 'GOOGLE_MEET', 'TEAMS', 'WEBEX', 'MANUAL');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'BOT_JOINING', 'RECORDING', 'PROCESSING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('PENDING', 'FULFILLED', 'MISSED', 'DEFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TeamProvider" AS ENUM ('JIRA', 'LINEAR', 'SLACK', 'NOTION');

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'trialing', 'past_due', 'paused', 'cancelled', 'incomplete', 'incomplete_expired', 'unpaid');

-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('MEETING_PROCESSED', 'AI_EXTRACTION', 'INTEGRATION_SYNC', 'EXPORT_GENERATED', 'API_CALL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('MEETING_PROCESS', 'MEETING_REPROCESS', 'TEAM_DATA_EXPORT', 'ANALYTICS_REPORT', 'JIRA_BULK_SYNC', 'CALENDAR_SYNC');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MEETING_PROCESSED', 'COMMITMENT_MISSED', 'COMMITMENT_FULFILLED', 'DEADLINE_TODAY', 'DEADLINE_TOMORROW', 'WEEKLY_DIGEST', 'PAYMENT_FAILED', 'PLAN_LIMIT_REACHED', 'TEAM_INVITE', 'MEMBER_JOINED', 'SCORE_MILESTONE');

-- CreateEnum
CREATE TYPE "MfaMethod" AS ENUM ('TOTP', 'WEBAUTHN', 'BACKUP_CODE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "googleId" TEXT,
    "githubId" TEXT,
    "microsoftId" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSecretEnc" TEXT,
    "teamId" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "commitmentScore" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "reuseDetectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "MfaMethod" NOT NULL,
    "totpSecretEnc" TEXT,
    "webauthnCredentialId" BYTEA,
    "webauthnPublicKey" BYTEA,
    "webauthnSignCount" BIGINT DEFAULT 0,
    "backupCodeHash" TEXT,
    "backupCodeUsed" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubId" TEXT,
    "meetingsUsed" INTEGER NOT NULL DEFAULT 0,
    "billingCycleStart" TIMESTAMP(3),
    "billingCycleEnd" TIMESTAMP(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "ssoProvider" TEXT,
    "ssoMetadataUrl" TEXT,
    "ssoEntityId" TEXT,
    "scimTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "invitedRole" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "invitedById" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "platformMeetingId" TEXT,
    "recallBotId" TEXT,
    "recallBotStatus" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "calendarEventId" TEXT,
    "calendarSourceUserId" TEXT,
    "mongoTranscriptId" TEXT,
    "summary" TEXT,
    "commitmentCount" INTEGER NOT NULL DEFAULT 0,
    "actionItemCount" INTEGER NOT NULL DEFAULT 0,
    "decisionCount" INTEGER NOT NULL DEFAULT 0,
    "blockerCount" INTEGER NOT NULL DEFAULT 0,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "processingError" TEXT,
    "reprocessedAt" TIMESTAMP(3),
    "reprocessedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "speakerTag" TEXT,
    "speakerConfidence" DOUBLE PRECISION,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "manuallyCorrected" BOOLEAN NOT NULL DEFAULT false,
    "correctedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitments" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT,
    "dueDate" TIMESTAMP(3),
    "dueDateRaw" TEXT,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'PENDING',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "extractionModel" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedInMeetingId" TEXT,
    "originalDueDate" TIMESTAMP(3),
    "deferredCount" INTEGER NOT NULL DEFAULT 0,
    "deferredNote" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "missedAlertSentAt" TIMESTAMP(3),
    "managerAlertSentAt" TIMESTAMP(3),
    "manualStatusById" TEXT,
    "cancellationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "assigneeNameRaw" TEXT,
    "text" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "dueDateRaw" TEXT,
    "priority" "PriorityLevel" NOT NULL DEFAULT 'MEDIUM',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "jiraIssueId" TEXT,
    "jiraIssueUrl" TEXT,
    "jiraIssueSyncedAt" TIMESTAMP(3),
    "linearIssueId" TEXT,
    "linearIssueUrl" TEXT,
    "linearIssueSyncedAt" TIMESTAMP(3),
    "notionPageId" TEXT,
    "notionPageUrl" TEXT,
    "notionPageSyncedAt" TIMESTAMP(3),
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "madeBy" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockers" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "affectedUser" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_integrations" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "provider" "TeamProvider" NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "workspaceId" TEXT,
    "workspaceName" TEXT,
    "workspaceUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "connectedById" TEXT,
    "disconnectedById" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "calendarId" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "nextSyncToken" TEXT,
    "lastError" TEXT,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripePriceId" TEXT,
    "stripeProductId" TEXT,
    "plan" "PlanType" NOT NULL,
    "billingInterval" TEXT,
    "status" "SubscriptionStatus" NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "unitAmount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "number" TEXT,
    "amountDue" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "description" TEXT,
    "hostedInvoiceUrl" TEXT,
    "invoicePdfUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "UsageEventType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_score_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "commitmentScore" INTEGER NOT NULL,
    "fulfillmentRate" INTEGER NOT NULL,
    "onTimeRate" INTEGER NOT NULL,
    "totalCommitments" INTEGER NOT NULL DEFAULT 0,
    "fulfilledCount" INTEGER NOT NULL DEFAULT 0,
    "missedCount" INTEGER NOT NULL DEFAULT 0,
    "deferredCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commitment_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "commitmentId" TEXT,
    "meetingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT,
    "keyHash" TEXT NOT NULL,
    "keyHint" TEXT,
    "keyPrefix" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_registrations" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "signingKeyHash" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalDeliveries" INTEGER NOT NULL DEFAULT 0,
    "failedDeliveries" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureCode" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "async_jobs" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "initiatedById" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "result" JSONB,
    "errorMessage" TEXT,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "estimatedMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "async_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_githubId_key" ON "users"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "users_microsoftId_key" ON "users"("microsoftId");

-- CreateIndex
CREATE INDEX "users_teamId_idx" ON "users"("teamId");

-- CreateIndex
CREATE INDEX "users_teamId_role_idx" ON "users"("teamId", "role");

-- CreateIndex
CREATE INDEX "users_teamId_commitmentScore_idx" ON "users"("teamId", "commitmentScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "mfa_credentials_userId_idx" ON "mfa_credentials"("userId");

-- CreateIndex
CREATE INDEX "mfa_credentials_userId_method_idx" ON "mfa_credentials"("userId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "teams_stripeCustomerId_key" ON "teams"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_stripeSubId_key" ON "teams"("stripeSubId");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_tokenHash_key" ON "team_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "team_invitations_teamId_idx" ON "team_invitations"("teamId");

-- CreateIndex
CREATE INDEX "team_invitations_invitedEmail_idx" ON "team_invitations"("invitedEmail");

-- CreateIndex
CREATE INDEX "meetings_teamId_idx" ON "meetings"("teamId");

-- CreateIndex
CREATE INDEX "meetings_teamId_status_idx" ON "meetings"("teamId", "status");

-- CreateIndex
CREATE INDEX "meetings_teamId_scheduledAt_idx" ON "meetings"("teamId", "scheduledAt" DESC);

-- CreateIndex
CREATE INDEX "meetings_teamId_platformMeetingId_idx" ON "meetings"("teamId", "platformMeetingId");

-- CreateIndex
CREATE INDEX "meeting_participants_meetingId_idx" ON "meeting_participants"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_participants_userId_idx" ON "meeting_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meetingId_email_key" ON "meeting_participants"("meetingId", "email");

-- CreateIndex
CREATE INDEX "commitments_teamId_idx" ON "commitments"("teamId");

-- CreateIndex
CREATE INDEX "commitments_teamId_status_idx" ON "commitments"("teamId", "status");

-- CreateIndex
CREATE INDEX "commitments_ownerId_idx" ON "commitments"("ownerId");

-- CreateIndex
CREATE INDEX "commitments_meetingId_idx" ON "commitments"("meetingId");

-- CreateIndex
CREATE INDEX "commitments_teamId_ownerId_status_idx" ON "commitments"("teamId", "ownerId", "status");

-- CreateIndex
CREATE INDEX "commitments_teamId_createdAt_idx" ON "commitments"("teamId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "action_items_teamId_idx" ON "action_items"("teamId");

-- CreateIndex
CREATE INDEX "action_items_meetingId_idx" ON "action_items"("meetingId");

-- CreateIndex
CREATE INDEX "action_items_assigneeId_idx" ON "action_items"("assigneeId");

-- CreateIndex
CREATE INDEX "action_items_teamId_completed_idx" ON "action_items"("teamId", "completed");

-- CreateIndex
CREATE INDEX "decisions_meetingId_idx" ON "decisions"("meetingId");

-- CreateIndex
CREATE INDEX "decisions_teamId_idx" ON "decisions"("teamId");

-- CreateIndex
CREATE INDEX "blockers_meetingId_idx" ON "blockers"("meetingId");

-- CreateIndex
CREATE INDEX "blockers_teamId_resolved_idx" ON "blockers"("teamId", "resolved");

-- CreateIndex
CREATE INDEX "team_integrations_teamId_idx" ON "team_integrations"("teamId");

-- CreateIndex
CREATE INDEX "team_integrations_tokenExpiresAt_idx" ON "team_integrations"("tokenExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "team_integrations_teamId_provider_key" ON "team_integrations"("teamId", "provider");

-- CreateIndex
CREATE INDEX "user_integrations_userId_idx" ON "user_integrations"("userId");

-- CreateIndex
CREATE INDEX "user_integrations_lastSyncedAt_idx" ON "user_integrations"("lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_integrations_userId_provider_key" ON "user_integrations"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_teamId_key" ON "subscriptions"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripeInvoiceId_key" ON "invoices"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "invoices_teamId_createdAt_idx" ON "invoices"("teamId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "usage_events_teamId_idx" ON "usage_events"("teamId");

-- CreateIndex
CREATE INDEX "usage_events_teamId_type_idx" ON "usage_events"("teamId", "type");

-- CreateIndex
CREATE INDEX "usage_events_teamId_occurredAt_idx" ON "usage_events"("teamId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "usage_events_occurredAt_idx" ON "usage_events"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "commitment_score_snapshots_teamId_weekStart_idx" ON "commitment_score_snapshots"("teamId", "weekStart" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "commitment_score_snapshots_userId_weekStart_key" ON "commitment_score_snapshots"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "in_app_notifications_userId_isRead_createdAt_idx" ON "in_app_notifications"("userId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "in_app_notifications_userId_createdAt_idx" ON "in_app_notifications"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_teamId_idx" ON "api_keys"("teamId");

-- CreateIndex
CREATE INDEX "webhook_registrations_teamId_idx" ON "webhook_registrations"("teamId");

-- CreateIndex
CREATE INDEX "async_jobs_teamId_createdAt_idx" ON "async_jobs"("teamId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "async_jobs_status_idx" ON "async_jobs"("status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_credentials" ADD CONSTRAINT "mfa_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_calendarSourceUserId_fkey" FOREIGN KEY ("calendarSourceUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_reprocessedById_fkey" FOREIGN KEY ("reprocessedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_resolvedInMeetingId_fkey" FOREIGN KEY ("resolvedInMeetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_manualStatusById_fkey" FOREIGN KEY ("manualStatusById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_integrations" ADD CONSTRAINT "team_integrations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_integrations" ADD CONSTRAINT "team_integrations_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_integrations" ADD CONSTRAINT "team_integrations_disconnectedById_fkey" FOREIGN KEY ("disconnectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_score_snapshots" ADD CONSTRAINT "commitment_score_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_score_snapshots" ADD CONSTRAINT "commitment_score_snapshots_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "commitments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_registrations" ADD CONSTRAINT "webhook_registrations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_registrations" ADD CONSTRAINT "webhook_registrations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "async_jobs" ADD CONSTRAINT "async_jobs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "async_jobs" ADD CONSTRAINT "async_jobs_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
