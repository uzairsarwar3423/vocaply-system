import { Router } from 'express'
import { authController } from './auth.controller'
import { validate } from '../../middleware/validate.middleware'
import { loginRateLimiter, ipRateLimiter } from '../../middleware/rate-limit.middleware'
import { requireAuth } from '../../middleware/auth.middleware'
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateMeSchema,
  changePasswordSchema,
} from './auth.validator'

const router = Router()

/**
 * Route: POST /api/v1/auth/register
 */
router.post(
  '/register',
  validate({ body: registerSchema }),
  loginRateLimiter,
  authController.register
)

/**
 * Route: POST /api/v1/auth/login
 */
router.post(
  '/login',
  validate({ body: loginSchema }),
  loginRateLimiter,
  authController.login
)

/**
 * Route: POST /api/v1/auth/logout
 */
router.post('/logout', authController.logout)

/**
 * Route: POST /api/v1/auth/refresh
 */
router.post('/refresh', authController.refresh)

/**
 * Route: GET /api/v1/auth/verify-email
 */
router.get('/verify-email', authController.verifyEmail)

/**
 * Route: POST /api/v1/auth/forgot-password
 */
router.post(
  '/forgot-password',
  validate({ body: forgotPasswordSchema }),
  loginRateLimiter,
  authController.forgotPassword
)

/**
 * Route: POST /api/v1/auth/reset-password
 */
router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  loginRateLimiter,
  authController.resetPassword
)

/**
 * Route: GET /api/v1/auth/google
 */
router.get('/google', authController.googleInit)

/**
 * Route: GET /api/v1/auth/google/callback
 */
router.get('/google/callback', authController.googleCallback)

/**
 * Route: GET /api/v1/auth/google-calendar
 */
router.get('/google-calendar', requireAuth, authController.googleCalendarInit)

/**
 * Route: GET /api/v1/auth/google-calendar/check-config
 */
router.get('/google-calendar/check-config', requireAuth, authController.googleCalendarCheckConfig)

/**
 * Route: GET /api/v1/auth/google-calendar/callback
 */
router.get('/google-calendar/callback', authController.googleCalendarCallback)

/**
 * Route: GET /api/v1/auth/me
 */
router.get('/me', requireAuth, authController.getMe)

/**
 * Route: PATCH /api/v1/auth/me
 */
router.patch(
  '/me',
  requireAuth,
  validate({ body: updateMeSchema }),
  authController.updateMe
)

/**
 * Route: POST /api/v1/auth/change-password
 */
router.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  authController.changePassword
)


/**
 * Route: GET /api/v1/auth/sessions
 */
router.get('/sessions', requireAuth, authController.getSessions)

import { injectTenant } from '../../middleware/tenant.middleware'
import { requireRole } from '../../middleware/role.middleware'

/**
 * Route: DELETE /api/v1/auth/sessions/:id
 */
router.delete('/sessions/:id', requireAuth, authController.revokeSession)

/**
 * Route: GET /api/v1/auth/test-middleware
 * Temporary test route to check requireAuth, injectTenant, and requireRole middlewares
 */
router.get(
  '/test-middleware',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  (req, res) => {
    res.status(200).json({
      success: true,
      teamId: req.teamId,
      role: req.user?.role,
    })
  }
)



export const authRouter = router

