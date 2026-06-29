// Canonical Event Name Registry for Socket.io

export const CLIENT_EVENTS = {
  JOIN_TEAM: "join:team",
  LEAVE_TEAM: "leave:team",
  JOIN_MEETING: "join:meeting",
  LEAVE_MEETING: "leave:meeting",
  PRESENCE_PING: "presence:ping",
} as const;

export const SERVER_EVENTS = {
  // Meeting lifecycle
  MEETING_BOT_JOINING: "meeting:bot_joining",
  MEETING_RECORDING: "meeting:recording",
  MEETING_PROCESSING: "meeting:processing",
  MEETING_PROCESSED: "meeting:processed",
  MEETING_FAILED: "meeting:failed",
  TRANSCRIPT_TURN: "transcript:turn",

  // Commitments
  COMMITMENT_CREATED: "commitment:created",
  COMMITMENT_FULFILLED: "commitment:fulfilled",
  COMMITMENT_MISSED: "commitment:missed",
  COMMITMENT_DEFERRED: "commitment:deferred",

  // Personal / deadline
  MY_DEADLINE_TODAY: "my:deadline_today",
  MY_DEADLINE_MISSED: "my:deadline_missed",
  MY_SCORE_UPDATED: "my:score_updated",

  // Team members
  MEMBER_SCORE_UPDATED: "member:score_updated",
  MEMBER_JOINED: "member:joined",
  MEMBER_REMOVED: "member:removed",

  // System
  SYSTEM_SESSION_EXPIRED: "system:session_expired",
  SYSTEM_PLAN_LIMIT: "system:plan_limit",

  // Integrations
  INTEGRATION_CONNECTED: "integration:connected",
  INTEGRATION_DISCONNECTED: "integration:disconnected",
  ACTION_ITEM_SYNCED: "action_item:synced",

  // Notifications
  NOTIFICATION_CREATED: "notification:created",
  NOTIFICATION_READ: "notification:read",
} as const;

export type ClientEvent = typeof CLIENT_EVENTS[keyof typeof CLIENT_EVENTS];
export type ServerEvent = typeof SERVER_EVENTS[keyof typeof SERVER_EVENTS];
