import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { env } from '../../config/env'
import { AuthUser } from './auth.types'

/**
 * Generates a stateless JWT access token valid for 15 minutes.
 */
export function generateAccessToken(user: { id: string; teamId: string | null; role: any; email: string }): string {
  return jwt.sign(
    {
      sub: user.id,
      teamId: user.teamId,
      role: user.role,
      email: user.email,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: '15m',
      algorithm: 'HS256',
      issuer: 'vocaply.com',
      audience: 'vocaply-api',
    }
  )
}

/**
 * Generates a high-entropy 64-character hex refresh token (random 32 bytes).
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hashes a token using SHA-256 before storing it in the database.
 * This prevents session hijacking in case of a database compromise.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Secure HTTP-only cookie configuration for the refresh token.
 */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth/refresh', // Restrict to the refresh route to optimize bandwidth
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
}
