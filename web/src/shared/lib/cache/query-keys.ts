export const queryKeys = {
  meetings: {
    all: () => ["meetings"] as const,
    list: (filters: any) => ["meetings", "list", filters] as const,
    detail: (id: string) => ["meetings", "detail", id] as const,
    transcript: (meetingId: string) => ["meetings", meetingId, "transcript"] as const,
  },
  actionItems: {
    all: (teamId: string) => ["teams", teamId, "action-items"] as const,
    list: (teamId: string, filters: any) =>
      [...queryKeys.actionItems.all(teamId), "list", filters] as const,
    detail: (teamId: string, id: string) =>
      [...queryKeys.actionItems.all(teamId), id] as const,
    byMeeting: (meetingId: string) => ["actionItems", "byMeeting", meetingId] as const,
  },
  commitments: {
    all: () => ["commitments"] as const,
    byMeeting: (meetingId: string) => ["commitments", "byMeeting", meetingId] as const,
    counts: (teamId: string) => ["commitments", "counts", teamId] as const,
    list: (teamId: string, filters: any) => ["commitments", "list", teamId, filters] as const,
    detail: (id: string) => ["commitments", "detail", id] as const,
    stats: (teamId: string, filters: any) => ["commitments", "stats", teamId, filters] as const,
  },
  team: {
    all: (teamId: string) => ["teams", teamId] as const,
    detail: (teamId: string) => ["teams", teamId, "detail"] as const,
    members: (teamId: string) => ["teams", teamId, "members"] as const,
    health: (teamId: string) => ["teams", teamId, "health"] as const,
    member: (teamId: string, memberId: string) => ["teams", teamId, "members", memberId] as const,
    memberTrend: (teamId: string, memberId: string) => ["teams", teamId, "members", memberId, "trend"] as const,
  },
  integrations: {
    all: (teamId: string) => ["teams", teamId, "integrations"] as const,
    calendarPreview: (userId: string) => ["users", userId, "calendar-preview"] as const,
    config: (provider: string) => ["integrations", provider, "options"] as const,
  },
  billing: {
    subscription: (teamId: string) => ["teams", teamId, "billing", "subscription"] as const,
    usage: (teamId: string) => ["teams", teamId, "billing", "usage"] as const,
    invoices: (teamId: string, cursor?: string) =>
      cursor
        ? (["teams", teamId, "billing", "invoices", cursor] as const)
        : (["teams", teamId, "billing", "invoices"] as const),
    plans: () => ["billing", "plans"] as const,
  },
  notifications: {
    preferences: (userId: string) => ["users", userId, "notifications", "preferences"] as const,
    inApp: (userId: string, cursor?: string) =>
      cursor
        ? (["users", userId, "notifications", "in-app", cursor] as const)
        : (["users", userId, "notifications", "in-app"] as const),
    unreadCount: (userId: string) => ["users", userId, "notifications", "unread-count"] as const,
  },
} as const;
