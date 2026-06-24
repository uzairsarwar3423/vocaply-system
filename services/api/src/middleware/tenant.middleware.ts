import type { Request, Response, NextFunction } from 'express'
import { ForbiddenError } from '../utils/errors'

/**
 * Middleware to check if user has teamId, and inject req.teamId.
 */
export function injectTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.teamId) {
    return next(new ForbiddenError('You must be part of a team to access this resource'))
  }
  req.teamId = req.user.teamId
  next()
}
