// ─────────────────────────────────────────────────────────────────────────────
// notifications.types.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The full JSONB shape stored in notification_preferences.preferences.
 * Every field is a boolean toggle.
 */
export interface NotificationPreferences {
  email: {
    meetingSummary: boolean
    deadlineReminder: boolean
    commitmentMissed: boolean
    weeklyDigest: boolean
    paymentAlerts: boolean
  }
  slack: {
    meetingSummary: boolean
    deadlineReminder: boolean
    commitmentMissed: boolean
    dailyDigest: boolean
    personalDMs: boolean
  }
  inApp: {
    all: boolean
  }
}

/**
 * Partial variant accepted by PATCH /notifications/preferences.
 * Every nested key is optional — the service performs a true deep merge.
 */
export interface PartialNotificationPreferences {
  email?: Partial<NotificationPreferences['email']>
  slack?: Partial<NotificationPreferences['slack']>
  inApp?: Partial<NotificationPreferences['inApp']>
}

/**
 * Body accepted by POST /notifications/test.
 */
export interface TestNotificationRequest {
  channel: 'email' | 'slack'
  type: NotificationType
}

/**
 * Response returned by POST /notifications/test.
 * A { sent: false, reason } 200 response is used for graceful non-error states
 * (e.g., Slack not connected) — NOT a thrown error.
 */
export interface TestNotificationResult {
  sent: boolean
  channel: 'email' | 'slack'
  type: NotificationType
  sentAt?: string
  reason?: string
}

/**
 * Notification types that can be test-sent.
 * Mirrors the NotificationType enum values documented in the DB schema.
 */
export type NotificationType =
  | 'MEETING_PROCESSED'
  | 'COMMITMENT_MISSED'
  | 'DEADLINE_REMINDER'
  | 'DEADLINE_TODAY'
  | 'MANAGER_ALERT'
  | 'WEEKLY_DIGEST'

/**
 * The system-level default preferences returned when no row exists yet.
 * Returned as a READ-ONLY fallback — never written to DB on a read-miss.
 */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: {
    meetingSummary: true,
    deadlineReminder: true,
    commitmentMissed: true,
    weeklyDigest: true,
    paymentAlerts: true,
  },
  slack: {
    meetingSummary: true,
    deadlineReminder: true,
    commitmentMissed: true,
    dailyDigest: false,
    personalDMs: true,
  },
  inApp: {
    all: true,
  },
}
