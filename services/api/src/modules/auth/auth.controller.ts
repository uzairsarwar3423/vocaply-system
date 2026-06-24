import { authService } from './auth.service'
import { success } from '../../utils/response'
import { asyncHandler } from '../../utils/async-handler'

export const authController = {
  /**
   * Endpoint: POST /auth/register
   */
  register: asyncHandler(async (req, res) => {
    const result = await authService.register(req.body)
    res.status(201).json(success(result))
  }),

  /**
   * Endpoint: POST /auth/login
   */
  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, req, res)
    res.status(200).json(success(result))
  }),

  /**
   * Endpoint: POST /auth/logout
   */
  logout: asyncHandler(async (req, res) => {
    const result = await authService.logout(req, res)
    res.status(200).json(success(result))
  }),

  /**
   * Endpoint: POST /auth/refresh
   */
  refresh: asyncHandler(async (req, res) => {
    const result = await authService.refresh(req, res)
    res.status(200).json(success(result))
  }),

  /**
   * Endpoint: GET /auth/verify-email
   */
  verifyEmail: asyncHandler(async (req, res) => {
    const token = req.query.token as string
    const result = await authService.verifyEmail(token, req, res)
    res.status(200).json(success(result))
  }),

  /**
   * Endpoint: POST /auth/forgot-password
   */
  forgotPassword: asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body.email)
    res.status(200).json(success(result))
  }),

  /**
   * Endpoint: POST /auth/reset-password
   */
  resetPassword: asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body, req, res)
    res.status(200).json(success(result))
  }),

  /**
   * Endpoint: GET /auth/google
   * Accepts optional ?inviteToken=<token> query param so invite auto-accept
   * works for users who sign up via Google OAuth from an invite link.
   */
  googleInit: asyncHandler(async (req, res) => {
    await authService.googleInit(req.query as { inviteToken?: string }, res)
  }),

  /**
   * Endpoint: GET /auth/google/callback
   */
  googleCallback: asyncHandler(async (req, res) => {
    await authService.googleCallback(req.query as any, req, res)
  }),

  /**
   * Endpoint: GET /auth/google-calendar
   */
  googleCalendarInit: asyncHandler(async (req, res) => {
    await authService.googleCalendarInit(req.user!.id, res)
  }),

  /**
   * Endpoint: GET /auth/google-calendar/callback
   */
  googleCalendarCallback: asyncHandler(async (req, res) => {
    await authService.googleCalendarCallback(req.query as any, res)
  }),

  /**
   * Endpoint: GET /auth/me
   */
  getMe: asyncHandler(async (req, res) => {
    const result = await authService.getMe(req.user!.id)
    res.status(200).json(success(result))
  }),

  /**
   * Endpoint: PATCH /auth/me
   */
  updateMe: asyncHandler(async (req, res) => {
    const result = await authService.updateMe(req.user!.id, req.body)
    res.status(200).json(success(result))
  }),

  /**
   * Endpoint: GET /auth/sessions
   */
  getSessions: asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.vocaply_refresh || ''
    const result = await authService.getSessions(req.user!.id, refreshToken)
    res.status(200).json(success(result))
  }),

  /**
   * Endpoint: DELETE /auth/sessions/:id
   */
  revokeSession: asyncHandler(async (req, res) => {
    const result = await authService.revokeSession(req.user!.id, req.params.id as string)
    res.status(200).json(success(result))
  }),
}
