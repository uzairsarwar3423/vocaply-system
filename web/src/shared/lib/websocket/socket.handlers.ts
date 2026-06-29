export interface RealtimeEventEntry {
  owner: string;
  patches: readonly string[];
  toast?: "manager-only";
  effect?: string;
}

export const REALTIME_EVENT_MAP = {
  // Meetings (Day 32 — unchanged, registered here for completeness)
  "meeting:bot_joining": {
    owner: "useRealtimeMeeting",
    patches: ["meetings.detail", "meetings.list"],
  },
  "meeting:recording": {
    owner: "useRealtimeMeeting",
    patches: ["meetings.detail", "meetings.list"],
  },
  "meeting:processed": {
    owner: "useRealtimeMeeting",
    patches: ["meetings.detail", "meetings.list", "commitments.all"],
  },

  // Commitments — NEW today
  "commitment:created": {
    owner: "useRealtimeCommitments",
    patches: ["commitments.all"],
  },
  "commitment:fulfilled": {
    owner: "useRealtimeCommitments",
    patches: ["commitments.all", "team.members", "team.member"],
  },
  "commitment:missed": {
    owner: "useRealtimeCommitments",
    patches: ["commitments.all", "team.members", "team.member"],
    toast: "manager-only",
  },
  "commitment:deferred": {
    owner: "useRealtimeCommitments",
    patches: ["commitments.all"],
  },
  "member:score_updated": {
    owner: "useRealtimeCommitments",
    patches: ["team.members", "team.member"],
  },

  // Action Items — NEW today
  "action_item:synced": {
    owner: "useRealtimeActionItems",
    patches: ["actionItems.all"],
  },

  // Team — NEW today
  "member:joined": {
    owner: "useRealtimeTeam",
    patches: ["team.members"],
    effect: "insert-with-highlight",
  },
  "member:removed": {
    owner: "useRealtimeTeam",
    patches: ["team.members"],
    effect: "remove-row",
  },
  "system:removed_from_team": {
    owner: "useRealtimeTeam",
    patches: [],
    effect: "force-redirect-self",
  },
  "my:role_updated": {
    owner: "useRealtimeTeam",
    patches: ["auth.me"],
    effect: "refresh-permissions-self",
  },

  // Notifications — Day 43 (settings matrix and topbar bell updates)
  "notification:created": {
    owner: "useInAppNotifications",
    patches: ["notifications.inApp", "notifications.unreadCount"],
  },
  "notification:read": {
    owner: "useInAppNotifications",
    patches: ["notifications.inApp", "notifications.unreadCount"],
  },
} as const satisfies Record<string, RealtimeEventEntry>;
