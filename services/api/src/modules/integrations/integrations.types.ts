import { TeamProvider } from '@prisma/client'

export type ProviderType = TeamProvider

// ─────────────────────────────────────────────────────────────────────────────
// Shared Integration Shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamIntegrationSummary {
    provider: ProviderType
    workspaceName: string | null
    isActive: boolean
    lastSyncedAt: Date | null
    connectedBy: {
        id: string
        name: string
    } | null
    consecutiveErrors: number
}

export interface OAuthCallbackResult {
    redirectUrl: string
}

/**
 * Base workspace meta returned by all OAuth providers.
 * The `extra` field is for provider-specific metadata that doesn't
 * fit the generic id/name/url shape (e.g. Slack's botUserId).
 * Add provider-specific extras here rather than widening the shared interface.
 */
export interface WorkspaceMeta {
    id: string
    name?: string
    url?: string
    extra?: Record<string, unknown>
}

export interface ProviderTokenResponse {
    accessToken: string
    refreshToken?: string
    expiresIn?: number // in seconds
    workspaceMeta: WorkspaceMeta
}

export interface IntegrationErrorContext {
    provider: string
    teamId: string
    consecutiveErrors: number
    lastError: string
    disconnectUrl: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider-Specific Result Types (Day 21 + Day 22)
// ─────────────────────────────────────────────────────────────────────────────

export interface JiraCreateIssueResult {
    issueId: string
    issueKey: string
    issueUrl: string
}

/**
 * Slack workspace metadata (extends base WorkspaceMeta via extra field).
 * botUserId is stored in extra.botUserId — needed by slack.webhook.ts to
 * distinguish bot-posted messages from human-posted messages.
 */
export interface SlackWorkspaceMeta extends WorkspaceMeta {
    extra: {
        botUserId: string
    }
}

/**
 * Linear issue creation result.
 * NOTE: Linear has no separate issue key concept (unlike Jira's PROJECT-123).
 * The UI-facing identifier is always embedded in the issueUrl.
 */
export interface LinearCreateIssueResult {
    issueId: string
    issueUrl: string
}

/**
 * Notion page creation result.
 */
export interface NotionCreatePageResult {
    pageId: string
    pageUrl: string
}

/**
 * Calendar sync operation summary.
 * Returned by syncUserCalendar() and logged per-job by the worker.
 * Future: surfaced in an admin "sync activity" view without a new audit table.
 */
export interface CalendarSyncResult {
    synced: number
    skipped: number
    duplicates: number
    errors: number
    message: string
    nextSyncToken?: string
}

/**
 * Result of extracting a meeting URL from a Google Calendar event.
 * The `source` field is kept (not just the URL) so tests can assert
 * WHICH extraction path succeeded for a given fixture event.
 */
export interface ExtractedMeetingUrl {
    url: string
    source: 'conferenceData' | 'description' | 'location'
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Refresh Cron Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenRefreshOutcome {
    integrationId: string
    provider: string
    success: boolean
    latencyMs: number
    error?: string
}

export interface TokenRefreshBatch {
    teamIntegrations: TokenRefreshOutcome[]
    userIntegrations: TokenRefreshOutcome[]
    processedAt: Date
}
