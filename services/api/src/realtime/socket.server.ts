// ─────────────────────────────────────────────────────────────────────────────
// socket.server.ts — Formal Socket.io Server Stand-Up
//
// This REPLACES the previous stub. Key differences from stub:
//  1. JWT handshake auth (same secret/algo/issuer/audience as requireAuth REST middleware)
//  2. Redis adapter for multi-server fan-out (pub + sub on SEPARATE connections)
//  3. CORS scoped to FRONTEND_URL (not wildcard '*')
//  4. transports: ['websocket'] only (no long-polling)
//  5. setIO()/getIO() singleton — getIO() THROWS if called before setIO()
//  6. Auto-joins team: and user: rooms on connection
//  7. Delegates opt-in meeting room join/leave to rooms.manager.ts
// ─────────────────────────────────────────────────────────────────────────────

import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Server as HttpServer } from 'http'
import Redis from 'ioredis'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { teamRoom, userRoom, handleJoinMeeting, handleLeaveMeeting } from './rooms.manager'
import { CLIENT_EVENTS } from './socket.events'

// ── Singleton ─────────────────────────────────────────────────────────────────

let _io: Server | null = null

/**
 * Returns the initialized Socket.io server instance.
 * THROWS a clear, loud error if called before setIO() has run — this is
 * intentional fail-fast behavior so a misconfigured boot sequence is
 * immediately visible rather than silently no-op'ing.
 */
export function getIO(): Server {
  if (!_io) {
    throw new Error(
      '[socket.server] Socket.io not initialized — getIO() called before setIO(). ' +
      'Ensure initializeSocketServer() and setIO() are called in server.ts BEFORE httpServer.listen().'
    )
  }
  return _io
}

export function setIO(io: Server): void {
  _io = io
}

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Initializes the Socket.io server with JWT auth, Redis adapter, and room handlers.
 * Caller (server.ts) MUST call setIO(io) immediately after this function returns,
 * before calling httpServer.listen().
 */
export function initializeSocketServer(httpServer: HttpServer): Server {
  const frontendUrl = env.FRONTEND_URL

  const io = new Server(httpServer, {
    cors: {
      // NEVER '*' — an open CORS policy on an authenticated WebSocket server
      // is a real cross-origin data-leak vector
      origin: frontendUrl || 'http://localhost:3000',
      credentials: true,
    },
    // Skip long-polling: adds load-balancer/sticky-session complexity for
    // marginal benefit in a business environment of modern browsers
    transports: ['websocket'],
    pingTimeout: 20000,
    pingInterval: 25000,
  })

  // ── Redis Adapter ──────────────────────────────────────────────────────────
  // TWO SEPARATE Redis connections required — a client in subscribe mode
  // cannot issue normal commands on the same connection.
  // This is the single most important line for horizontal scalability:
  // any event emitted on Server A immediately reaches clients on Server B.
  const redisPubClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  })
  const redisSubClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  })

  redisPubClient.on('error', (err) => logger.error({ err }, 'socket.server: Redis pub client error'))
  redisSubClient.on('error', (err) => logger.error({ err }, 'socket.server: Redis sub client error'))

  io.adapter(createAdapter(redisPubClient, redisSubClient))
  logger.info('socket.server: Redis adapter attached (pub/sub) — multi-server fan-out enabled')

  // ── JWT Handshake Auth ─────────────────────────────────────────────────────
  // IDENTICAL secret, algorithm, issuer, audience as requireAuth REST middleware.
  // One token lifecycle — a revoked token, forced logout, or expiry affects
  // BOTH REST and realtime access simultaneously.
  io.use(async (socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ||
                  (socket.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '')

    if (!token) {
      return next(new Error('NO_TOKEN'))
    }

    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: 'vocaply.com',
        audience: 'vocaply-api',
      }) as { sub: string; teamId: string; role: string; email: string }

      // Attach to socket.data — available for all subsequent handlers
      socket.data = {
        userId: payload.sub,
        teamId: payload.teamId,
        role: payload.role,
        email: payload.email,
      }

      next()
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return next(new Error('TOKEN_EXPIRED'))
      }
      return next(new Error('INVALID_TOKEN'))
    }
  })

  // ── Connection Lifecycle ───────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const { userId, teamId } = socket.data as { userId: string; teamId: string; role: string }

    logger.debug({ userId, teamId }, 'socket.server: client connected')

    // Auto-join team and user rooms — never an arbitrary/requested room,
    // always this socket's OWN team and user rooms from the JWT payload
    socket.join(teamRoom(teamId))
    socket.join(userRoom(userId))

    // Opt-in meeting room — verified against socket's teamId before joining
    socket.on(CLIENT_EVENTS.JOIN_MEETING, (payload) => handleJoinMeeting(socket as any, payload))
    socket.on(CLIENT_EVENTS.LEAVE_MEETING, (payload) => handleLeaveMeeting(socket, payload))

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, teamId, reason }, 'socket.server: client disconnected')
    })
  })

  logger.info({ frontend: frontendUrl }, 'socket.server: initialized with JWT auth + Redis adapter')

  return io
}
