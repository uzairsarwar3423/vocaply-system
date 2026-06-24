// ─────────────────────────────────────────────────────────────────────────────
// meetings.types.ts — All TypeScript interfaces for the Meetings module
//
// These are module-specific types. Shared Prisma types (Meeting, MeetingStatus,
// PlatformType) are imported from @prisma/client — never redefined here.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Meeting,
  MeetingStatus,
  PlatformType,
  MeetingParticipant,
  Commitment,
  ActionItem,
  Decision,
  Blocker,
} from '@prisma/client'

// Re-export prisma enums for use within module without direct @prisma/client coupling
export type { Meeting, MeetingStatus, PlatformType }

// ── Input Types (Service Layer) ───────────────────────────────────────────────

/**
 * Input for meetingService.createMeeting()
 * Combines validated request body + auth context (userId, teamId never from user input)
 */
export interface CreateMeetingInput {
  title: string
  platform: PlatformType
  meetingUrl: string
  scheduledAt: Date
  calendarEventId?: string
  // Injected from auth context — NEVER from request body
  userId: string
  teamId: string
}

/**
 * Input for meetingService.addBotManually()
 */
export interface AddBotInput {
  meetingUrl: string
  userId: string
  teamId: string
}

// ── Filter Types (Repository Layer) ──────────────────────────────────────────

/**
 * Parsed filter object for listMeetings.
 * Dates are Date objects (not strings) — converted in the controller.
 */
export interface MeetingListFilters {
  status?: MeetingStatus | MeetingStatus[]
  platform?: PlatformType
  from?: Date
  to?: Date
  search?: string
  limit: number
  cursor?: string
  sortBy?: 'scheduledAt' | 'createdAt' | 'title'
  sortOrder?: 'asc' | 'desc'
}

// ── Cursor Types ──────────────────────────────────────────────────────────────

/**
 * Decoded cursor shape for meeting pagination.
 * Encodes (scheduledAt, id) for composite index cursor.
 */
export interface MeetingCursorData {
  scheduledAt: string // ISO 8601
  id: string
}

// ── Relation Include Options ──────────────────────────────────────────────────

/**
 * Which relations to eager-load on getMeeting.
 * All default to true — clients use ?include= to select subset.
 */
export interface MeetingIncludeOptions {
  participants?: boolean
  commitments?: boolean
  actionItems?: boolean
  decisions?: boolean
  blockers?: boolean
}

// ── Relation Types (Repository Return) ───────────────────────────────────────

export interface MeetingWithRelations extends Meeting {
  participants?: MeetingParticipant[]
  commitments?: Commitment[]
  actionItems?: ActionItem[]
  decisions?: Decision[]
  blockers?: Blocker[]
}

// ── Transcript Types (MongoDB) ────────────────────────────────────────────────

/**
 * Filters for fetching transcript segments from MongoDB.
 */
export interface TranscriptFilters {
  search?: string
  speakerEmail?: string
  fromTime?: number // seconds
  toTime?: number   // seconds
}

/**
 * A single turn (utterance) in a meeting transcript.
 */
export interface TranscriptTurn {
  speaker: string
  speakerEmail?: string
  text: string
  startTime: number // seconds
  endTime: number   // seconds
  confidence?: number
}

/**
 * Full transcript document returned to clients.
 */
export interface TranscriptDocument {
  meetingId: string
  mongoId: string
  totalTurns: number
  durationSeconds?: number
  turns: TranscriptTurn[]
  matchedTurns?: number  // populated when search filter applied
}

/**
 * Data for storing a new transcript in MongoDB. (Scaffold for Day 18)
 */
export interface StoreTranscriptData {
  meetingId: string
  teamId: string
  recallBotId: string
  platform: PlatformType
  rawTranscript: TranscriptTurn[]
  fullText: string // concatenated for Atlas Search indexing
}

// ── Platform Detection Result ─────────────────────────────────────────────────

export interface PlatformDetectResult {
  platform: PlatformType
  platformMeetingId: string | null
}

// ── Recall.ai Types ───────────────────────────────────────────────────────────

export interface RecallScheduleBotInput {
  meetingUrl: string
  joinAt: Date       // 2 minutes before scheduledAt
  teamId: string
  meetingId?: string // set after DB write for metadata
}

export interface RecallScheduleBotResult {
  botId: string      // stored as recallBotId in meetings table
}

// ── Meeting List Response ─────────────────────────────────────────────────────

export interface MeetingListItem {
  id: string
  title: string
  platform: PlatformType
  status: MeetingStatus
  scheduledAt: Date
  startedAt: Date | null
  endedAt: Date | null
  durationMinutes: number | null
  participantCount: number
  commitmentCount: number
  actionItemCount: number
  decisionCount: number
  summary: string | null
  createdAt: Date
}

// ── Repository Data Types ─────────────────────────────────────────────────────

export interface CreateMeetingData {
  teamId: string
  title: string
  platform: PlatformType
  meetingUrl: string
  platformMeetingId: string | null
  recallBotId: string
  scheduledAt: Date
  calendarEventId?: string
  status: MeetingStatus
}

export interface UpdateMeetingData {
  recallBotId?: string
  recallBotStatus?: string
  status?: MeetingStatus
  startedAt?: Date
  endedAt?: Date
  durationMinutes?: number
  mongoTranscriptId?: string
  summary?: string
  commitmentCount?: number
  actionItemCount?: number
  decisionCount?: number
  blockerCount?: number
  participantCount?: number
  processingStartedAt?: Date
  processingCompletedAt?: Date
  processingAttempts?: number
  processingError?: string
  reprocessedAt?: Date
  reprocessedById?: string
}
