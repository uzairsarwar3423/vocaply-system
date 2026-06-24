import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UnauthorizedError } from '../utils/errors'
import type { JwtPayload } from '../modules/auth/auth.types'

/**
 * Middleware to require authentication via a valid JWT access token.
 * Validates the token against signature, expiry, issuer, audience, and whitelisted algorithms.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization
  let token = ''

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]
  } else if (req.query.token) {
    token = req.query.token as string
  }

  if (!token) {
    return next(new UnauthorizedError('AUTH_REQUIRED', 'Authentication required'))
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'vocaply.com',
      audience: 'vocaply-api',
    }) as JwtPayload

    req.user = {
      id: payload.sub,
      teamId: payload.teamId,
      role: payload.role,
      email: payload.email,
    }

    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('TOKEN_EXPIRED', 'Access token expired'))
    }
    return next(new UnauthorizedError('TOKEN_INVALID', 'Invalid access token'))
  }
}
