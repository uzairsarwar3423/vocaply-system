import type { Request, Response, NextFunction } from 'express'
import { ForbiddenError } from '../utils/errors'

const ROLE_LEVELS: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  MEMBER: 1,
}

/**
 * Middleware factory to enforce minimum role level requirement.
 * @param roles Roles that are allowed to access (the minimum of these levels is required).
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError('Access denied: not authenticated'))
    }

    const userLevel = ROLE_LEVELS[req.user.role] ?? 0
    const required = Math.min(...roles.map((r) => ROLE_LEVELS[r] ?? 99))

    if (userLevel < required) {
      return next(new ForbiddenError(`Requires role: ${roles.join(' or ')}`))
    }

    next()
  }
}
