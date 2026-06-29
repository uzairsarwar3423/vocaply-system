export type NotificationType =
  | 'MEETING_PROCESSED'
  | 'COMMITMENT_MISSED'
  | 'COMMITMENT_FULFILLED'
  | 'DEADLINE_TODAY'
  | 'DEADLINE_TOMORROW'
  | 'WEEKLY_DIGEST'
  | 'PAYMENT_FAILED'
  | 'PLAN_LIMIT_REACHED'
  | 'TEAM_INVITE'
  | 'MEMBER_JOINED'
  | 'SCORE_MILESTONE';

export interface InAppNotification {
  id: string;
  userId: string;
  teamId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  isRead: boolean;
  readAt: string | null;
  meetingId: string | null;
  commitmentId: string | null;
  actionUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelPreferences {
  meetingSummary?: boolean;
  deadlineReminder?: boolean;
  commitmentMissed?: boolean;
  weeklyDigest?: boolean;
  dailyDigest?: boolean;
  personalDMs?: boolean;
  paymentAlerts?: boolean;
}

export interface NotificationPreferences {
  email: ChannelPreferences;
  slack: ChannelPreferences;
  inApp: {
    all: boolean;
  };
}

export interface PartialNotificationPreferences {
  email?: Partial<ChannelPreferences>;
  slack?: Partial<ChannelPreferences>;
  inApp?: {
    all?: boolean;
  };
}
