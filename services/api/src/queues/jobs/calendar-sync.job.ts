// ─────────────────────────────────────────────────────────────────────────────
// calendar-sync.job.ts — Calendar Sync Job Payload Contract
//
// RULE: Job payload types are defined HERE, not scattered across worker files.
// The worker and the enqueuer both import from this file — single source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export interface CalendarSyncJobData {
    /** Vocaply userId (NOT teamId — calendar sync is user-scoped) */
    userId: string
}
