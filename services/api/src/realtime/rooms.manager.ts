// ─────────────────────────────────────────────────────────────────────────────
// rooms.manager.ts — Room Name Construction + Join/Leave Authorization
//
// ONLY place room-name strings are constructed.
// ONLY place opt-in room join/leave authorization logic lives.
//
// Tenant isolation principle applied to WebSocket layer:
// - Auto-joins (team:, user:) happen at handshake via socket.server.ts
// - Opt-in joins (meeting:) are authorized here before the join is allowed
// - Silent rejection on cross-tenant meeting join (never reveal existence)
// ─────────────────────────────────────────────────────────────────────────────

import type { Socket } from 'socket.io'
import { prisma } from '../db/client'
import { logger } from '../config/logger'

// ── Room Name Builders ────────────────────────────────────────────────────────

export function teamRoom(teamId: string): string {
  return `team:${teamId}`
}

export function userRoom(userId: string): string {
  return `user:${userId}`
}

export function meetingRoom(meetingId: string): string {
  return `meeting:${meetingId}`
}

// ── Meeting Room Handlers (with authorization) ────────────────────────────────

/**
 * Handles a client's request to join a meeting room.
 * Verifies the meeting belongs to the socket's own team before allowing the join.
 * Silent rejection on mismatch — per the "never reveal cross-tenant existence" principle.
 */
export async function handleJoinMeeting(
  socket: Socket & { data: { userId: string; teamId: string; role: string } },
  payload: unknown
): Promise<void> {
  try {
    const meetingId = (payload as { meetingId?: string })?.meetingId
    if (!meetingId || typeof meetingId !== 'string') return

    // Verify meeting belongs to this socket's team
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { teamId: true },
    })

    // Silent rejection: do NOT emit an error — reveals nothing about whether
    // the meeting exists for another team
    if (!meeting || meeting.teamId !== socket.data.teamId) {
      logger.debug(
        { userId: socket.data.userId, meetingId },
        'rooms.manager: join:meeting rejected (cross-tenant or not found)'
      )
      return
    }

    await socket.join(meetingRoom(meetingId))
    logger.debug(
      { userId: socket.data.userId, meetingId },
      'rooms.manager: socket joined meeting room'
    )
  } catch (error) {
    logger.error({ error }, 'rooms.manager: error in handleJoinMeeting')
  }
}

/**
 * Handles a client's request to leave a meeting room.
 * No authorization needed — leaving a room you're not in is always safe.
 */
export async function handleLeaveMeeting(
  socket: Socket,
  payload: unknown
): Promise<void> {
  try {
    const meetingId = (payload as { meetingId?: string })?.meetingId
    if (!meetingId || typeof meetingId !== 'string') return

    await socket.leave(meetingRoom(meetingId))
    logger.debug(
      { userId: (socket.data as any)?.userId, meetingId },
      'rooms.manager: socket left meeting room'
    )
  } catch (error) {
    logger.error({ error }, 'rooms.manager: error in handleLeaveMeeting')
  }
}
