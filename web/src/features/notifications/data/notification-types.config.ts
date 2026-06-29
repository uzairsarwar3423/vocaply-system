export type NotificationChannel = 'email' | 'slack' | 'inApp';

export interface NotificationTypeConfig {
  id: string;
  label: string;
  description: string;
  channels: NotificationChannel[];
  inAppLocked: boolean;
}

export const NOTIFICATION_TYPES: readonly NotificationTypeConfig[] = [
  {
    id: 'MEETING_PROCESSED',
    label: 'Meeting processed',
    description: 'A meeting finished and its summary is ready.',
    channels: ['email', 'slack', 'inApp'],
    inAppLocked: true,
  },
  {
    id: 'COMMITMENT_MISSED',
    label: 'Commitment missed',
    description: 'Someone missed a commitment deadline.',
    channels: ['email', 'slack', 'inApp'],
    inAppLocked: true,
  },
  {
    id: 'DEADLINE_REMINDER',
    label: 'Deadline reminder',
    description: 'Upcoming commitments due soon.',
    channels: ['email', 'slack', 'inApp'],
    inAppLocked: true,
  },
  {
    id: 'DEADLINE_TODAY',
    label: 'Deadline today',
    description: 'Commitments due today.',
    channels: ['email', 'slack', 'inApp'],
    inAppLocked: true,
  },
  {
    id: 'MANAGER_ALERT',
    label: 'Manager alert',
    description: 'Alert when team member misses a deadline.',
    channels: ['email', 'slack', 'inApp'],
    inAppLocked: true,
  },
  {
    id: 'WEEKLY_DIGEST',
    label: 'Weekly digest',
    description: 'A summary of commitments and action items from the past week.',
    channels: ['email', 'slack', 'inApp'],
    inAppLocked: true,
  },
] as const;

export const NOTIFICATION_TYPE_MAP: Record<string, { email: string; slack: string }> = {
  MEETING_PROCESSED: {
    email: 'meetingSummary',
    slack: 'meetingSummary',
  },
  COMMITMENT_MISSED: {
    email: 'commitmentMissed',
    slack: 'commitmentMissed',
  },
  DEADLINE_REMINDER: {
    email: 'deadlineReminder',
    slack: 'deadlineReminder',
  },
  DEADLINE_TODAY: {
    email: 'deadlineReminder',
    slack: 'deadlineReminder',
  },
  MANAGER_ALERT: {
    email: 'commitmentMissed',
    slack: 'commitmentMissed',
  },
  WEEKLY_DIGEST: {
    email: 'weeklyDigest',
    slack: 'dailyDigest',
  },
} as const;
