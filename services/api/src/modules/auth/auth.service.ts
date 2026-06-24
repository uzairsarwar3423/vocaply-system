import bcrypt from 'bcrypt'
import crypto from 'crypto'
import type { Request, Response } from 'express'
import { authRepository } from './auth.repository'
import { encrypt } from '../../utils/crypto'
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  COOKIE_OPTIONS,
} from './auth.helpers'
import { emailService } from '../notifications/email.service'
import {
  DuplicateError,
  UnauthorizedError,
  RateLimitError,
  AppError,
  ForbiddenError,
} from '../../utils/errors'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { env } from '../../config/env'
import { logger } from '../../config/logger'
import { teamsService } from '../teams/teams.service'

// Redis TTL for pending invite token (must outlive email verification window)
const PENDING_INVITE_TTL = 24 * 60 * 60 // 24 hours

/**
 * Store the raw invite token against the email verification token hash so it can
 * be retrieved when the user clicks their verification link (even in a new tab).
 */
async function storePendingInviteForVerification(
  emailVerificationTokenHash: string,
  inviteToken: string
): Promise<void> {
  await redis.set(
    `pending_invite:verify:${emailVerificationTokenHash}`,
    inviteToken,
    'EX',
    PENDING_INVITE_TTL
  )
}

/**
 * Retrieve and delete the pending invite token linked to an email verification token.
 * Returns null if none was stored.
 */
async function consumePendingInviteForVerification(
  emailVerificationTokenHash: string
): Promise<string | null> {
  const key = `pending_invite:verify:${emailVerificationTokenHash}`
  const inviteToken = await redis.get(key)
  if (inviteToken) await redis.del(key)
  return inviteToken
}

/**
 * Attempt to accept a team invitation for the given user.
 * Silent failure — never blocks primary auth flow.
 */
async function tryAcceptInvitation(userId: string, inviteToken: string): Promise<void> {
  try {
    await teamsService.acceptInvitation(inviteToken, userId)
    logger.info({ userId }, 'Auto-accepted team invitation after account creation/verification')
  } catch (err: unknown) {
    // Log but do NOT rethrow — failing to accept an invite should never break signup/login
    logger.warn({ err, userId }, 'Could not auto-accept invite (token may be expired/invalid/already used)')
  }
}


// A structurally valid cost-12 bcrypt hash of "password" to waste exactly ~300ms
const BCRYPT_FAKE_HASH = '$2b$12$LpyP0uH6O/5j1Z2/V271uO1bHqT9Doz7mFj2.N8F3H5y7kL.Z.fNu'

export const authService = {
  /**
   * Registers a new user, hashes their password, and creates an unverified account.
   * If an inviteToken is provided (user came from an invite link), it is persisted in
   * Redis so it can be auto-accepted when the user clicks the email verification link.
   */
  async register(data: { name: string; email: string; password: string; inviteToken?: string }) {
    const emailLower = data.email.toLowerCase().trim()

    // 1. Check for duplicate email
    const existingUser = await authRepository.findByEmail(emailLower)
    if (existingUser) {
      throw new DuplicateError('Email already registered')
    }

    // 2. Hash password with cost factor 12
    const passwordHash = await bcrypt.hash(data.password, 12)

    // 3. Create user (Prisma generates the cuid automatically)
    const user = await authRepository.create({
      name: data.name,
      email: emailLower,
      passwordHash,
    })

    // 4. Generate verification token (32 random bytes)
    const verificationToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(verificationToken)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // 5. Store hashed verification token in DB
    await authRepository.createEmailVerificationToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    // 6. If user registered via an invite link, store the invite token in Redis
    //    so it can be auto-accepted after email verification (even in a new browser tab).
    if (data.inviteToken) {
      await storePendingInviteForVerification(tokenHash, data.inviteToken)
    }

    // 7. Send verification email
    await emailService.sendVerificationEmail({
      to: user.email,
      name: user.name,
      verificationToken,
    })

    // Return message indicating unverified state (no session tokens returned)
    return {
      message: 'Check your email to verify your account',
      email: user.email,
    }
  },

  /**
   * Log in a user, validating credentials and issuing session cookies/tokens.
   */
  async login(
    data: { email: string; password: string },
    req: Request,
    res: Response
  ) {
    const emailLower = data.email.toLowerCase().trim()

    // 1. Fetch user by email
    const user = await authRepository.findByEmail(emailLower)

    // 2. Handle invalid user (Timing Attack Prevention)
    if (!user) {
      await bcrypt.compare(data.password, BCRYPT_FAKE_HASH)
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    // 3. Brute force: Check account lockout status
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
      throw new RateLimitError(`Account locked. Try again in ${minutesLeft} minutes.`)
    }

    // 4. Check email verification
    if (!user.emailVerified) {
      throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Please verify your email address')
    }

    // 5. Check if OAuth-only account (no password hash)
    if (!user.passwordHash) {
      throw new UnauthorizedError(
        'USE_OAUTH',
        'This account was created using Google/GitHub login. Please sign in using OAuth.'
      )
    }

    // 6. Validate password
    const passwordMatch = await bcrypt.compare(data.password, user.passwordHash)

    // 7. Handle wrong password
    if (!passwordMatch) {
      const newAttempts = user.failedLoginAttempts + 1
      const lockedUntil =
        newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null // 15 min lock

      await authRepository.updateFailedAttempts(user.id, newAttempts, lockedUntil)
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    // 8. Successful login cleanup
    await authRepository.resetFailedAttempts(user.id)
    await authRepository.updateLastLogin(user.id)

    // 9. Generate access & refresh tokens
    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken()

    // 10. Store hashed refresh token in DB
    await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    })

    // 11. Set secure HTTP-only cookie
    res.cookie('vocaply_refresh', refreshToken, COOKIE_OPTIONS)

    // 12. Return payload (omitting sensitive fields)
    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
        team: user.team || null,
        onboardingCompleted: user.onboardingCompleted,
      },
    }
  },

  /**
   * Log out a user by clearing their cookie and deleting the session from the DB.
   */
  async logout(req: Request, res: Response) {
    const refreshToken = req.cookies.vocaply_refresh

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken)
      const storedToken = await authRepository.findRefreshToken(tokenHash)

      if (storedToken) {
        await authRepository.deleteRefreshToken(storedToken.id)
      }
    }

    // Clear client-side cookie
    res.clearCookie('vocaply_refresh', {
      httpOnly: COOKIE_OPTIONS.httpOnly,
      secure: COOKIE_OPTIONS.secure,
      sameSite: COOKIE_OPTIONS.sameSite,
      path: COOKIE_OPTIONS.path,
    })

    return { message: 'Logged out successfully' }
  },

  /**
   * Refresh the user's access token, rotating the refresh token.
   */
  async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies.vocaply_refresh
    if (!refreshToken) {
      throw new UnauthorizedError('NO_REFRESH_TOKEN', 'No refresh token provided')
    }

    const tokenHash = hashToken(refreshToken)
    const stored = await authRepository.findRefreshToken(tokenHash)

    if (!stored) {
      throw new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Invalid refresh token')
    }

    if (stored.expiresAt < new Date()) {
      await authRepository.deleteRefreshToken(stored.id)
      throw new UnauthorizedError('REFRESH_TOKEN_EXPIRED', 'Refresh token has expired')
    }

    const user = await authRepository.findById(stored.userId)
    if (!user) {
      throw new UnauthorizedError('USER_NOT_FOUND', 'User not found')
    }

    // ROTATION — delete old token, issue new
    await authRepository.deleteRefreshToken(stored.id)

    const newAccessToken = generateAccessToken(user)
    const newRefreshToken = generateRefreshToken()

    await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    })

    res.cookie('vocaply_refresh', newRefreshToken, COOKIE_OPTIONS)

    return { accessToken: newAccessToken }
  },

  /**
   * Verify a user's email verification token, update status, and perform auto-login.
   * If a pending invite token was stored during registration (Redis), it is
   * automatically accepted here — works even when the link opens in a new browser tab.
   */
  async verifyEmail(token: string, req: Request, res: Response) {
    if (!token) {
      throw new AppError('TOKEN_REQUIRED', 400, 'Verification token is required')
    }

    const tokenHash = hashToken(token)
    const stored = await authRepository.findEmailVerificationToken(tokenHash)

    if (!stored) {
      throw new AppError('TOKEN_INVALID', 400, 'Invalid verification token')
    }

    if (stored.expiresAt < new Date()) {
      await authRepository.deleteEmailVerificationToken(stored.id)
      throw new AppError('TOKEN_EXPIRED', 410, 'Verification token has expired')
    }

    const user = await authRepository.findById(stored.userId)
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found')
    }

    // Consume pending invite token BEFORE we delete the verification record
    // (Redis key is based on the verification tokenHash, which we still have)
    const pendingInviteToken = await consumePendingInviteForVerification(tokenHash)

    // Mark user verified and delete token in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.delete({
        where: { id: stored.id },
      }),
    ])

    // Auto-accept invite if the user registered via an invite link.
    // We do this AFTER verification is committed so the user is a valid, verified account.
    if (pendingInviteToken) {
      await tryAcceptInvitation(stored.userId, pendingInviteToken)
    }

    // Re-fetch user to get updated teamId/role after potential invite acceptance
    const updatedUser = (await authRepository.findById(stored.userId)) ?? user

    // Generate tokens for auto-login
    const accessToken = generateAccessToken(updatedUser)
    const refreshToken = generateRefreshToken()

    await authRepository.createRefreshToken({
      userId: updatedUser.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    })

    res.cookie('vocaply_refresh', refreshToken, COOKIE_OPTIONS)

    return {
      accessToken,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        teamId: updatedUser.teamId,
        team: updatedUser.team || null,
        onboardingCompleted: updatedUser.onboardingCompleted,
      },
      message: 'Email verified successfully',
      // Inform frontend whether an invite was auto-accepted
      inviteAccepted: !!pendingInviteToken,
    }
  },

  /**
   * Initiates forgot password flow (always 200).
   */
  async forgotPassword(email: string) {
    const emailLower = email.toLowerCase().trim()
    const user = await authRepository.findByEmail(emailLower)

    // User enumeration protection: always return same response
    const defaultResponse = { message: 'If that email exists, a reset link has been sent' }

    if (!user) {
      // Prevent timing attacks
      await bcrypt.compare('dummy_password', BCRYPT_FAKE_HASH)
      return defaultResponse
    }

    // Only send reset if email is verified
    if (!user.emailVerified) {
      return defaultResponse
    }

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour

    await authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    await emailService.sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token,
    })

    return defaultResponse
  },

  /**
   * Reset a user's password using reset token.
   */
  async resetPassword(data: { token: string; newPassword?: string }, req: Request, res: Response) {
    if (!data.token) {
      throw new AppError('TOKEN_REQUIRED', 400, 'Reset token is required')
    }
    if (!data.newPassword) {
      throw new AppError('PASSWORD_REQUIRED', 400, 'New password is required')
    }

    const tokenHash = hashToken(data.token)
    const stored = await authRepository.findPasswordResetToken(tokenHash)

    if (!stored || stored.usedAt) {
      throw new AppError('TOKEN_INVALID', 400, 'Invalid or already used reset token')
    }

    if (stored.expiresAt < new Date()) {
      throw new AppError('TOKEN_EXPIRED', 410, 'Reset token has expired')
    }

    const user = await authRepository.findById(stored.userId)
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found')
    }

    // Verify they are not using the same password
    if (user.passwordHash) {
      const isSame = await bcrypt.compare(data.newPassword, user.passwordHash)
      if (isSame) {
        throw new AppError('PASSWORD_MUST_BE_DIFFERENT', 400, 'New password must be different from current password')
      }
    }

    const newHash = await bcrypt.hash(data.newPassword, 12)

    // Run updates in transaction: update user password, mark token used, and delete ALL active refresh tokens
    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash: newHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      prisma.refreshToken.deleteMany({
        where: { userId: stored.userId },
      }),
    ])

    // Auto-login with a fresh session
    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken()

    await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    })

    res.cookie('vocaply_refresh', refreshToken, COOKIE_OPTIONS)

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
        team: user.team || null,
        onboardingCompleted: user.onboardingCompleted,
      },
      message: 'Password reset successful',
    }
  },

  /**
   * Google OAuth Initiate.
   * Accepts an optional inviteToken query param (passed from frontend when user
   * clicks "Continue with Google" on /login or /register from an invite link).
   * The invite token is stored in Redis alongside the OAuth state so it can be
   * auto-accepted after successful OAuth — no redirects or extra steps required.
   */
  async googleInit(query: { inviteToken?: string }, res: Response) {
    const state = crypto.randomBytes(32).toString('hex')
    // Store state → '1' (or invite token if present) in Redis (TTL 10 min)
    await redis.set(`oauth:state:${state}`, '1', 'EX', 600)

    if (query.inviteToken) {
      await redis.set(`oauth:invite:${state}`, query.inviteToken, 'EX', 600)
    }

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: env.GOOGLE_REDIRECT_URI!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    })

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  },

  /**
   * Google OAuth Callback.
   */
  async googleCallback(
    query: { code?: string; state?: string; error?: string },
    req: Request,
    res: Response
  ) {
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'

    if (query.state) {
      const calendarUserId = await redis.get(`oauth:state:calendar:${query.state}`)
      if (calendarUserId) {
        return authService.googleCalendarCallback(query, res, env.GOOGLE_REDIRECT_URI!)
      }
    }

    if (query.error === 'access_denied') {
      return res.redirect(`${frontendUrl}/login?error=oauth_denied`)
    }

    if (!query.state || !query.code) {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`)
    }

    // Verify state
    const storedState = await redis.get(`oauth:state:${query.state}`)
    if (!storedState) {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`)
    }
    // Delete state (one-time use)
    await redis.del(`oauth:state:${query.state}`)

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: query.code,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: env.GOOGLE_REDIRECT_URI!,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Google token exchange failed')
      }

      const tokens = (await tokenResponse.json()) as any
      const idToken = tokens.id_token

      // Verify Google Token securely using Google's tokeninfo endpoint
      const tokenInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
      )
      if (!tokenInfoResponse.ok) {
        throw new Error('Google token verification failed')
      }

      const payload = (await tokenInfoResponse.json()) as any

      // Account linking logic (3 cases)
      let user = await authRepository.findUserByGoogleId(payload.sub)

      if (!user) {
        // Find by email
        user = await authRepository.findByEmail(payload.email)
        if (user) {
          // CASE 2: email exists, link Google
          user = (await authRepository.linkGoogleAccount(
            user.id,
            payload.sub,
            payload.picture
          )) as any
          // Fetch user details again to include team
          user = await authRepository.findById(user!.id)
        } else {
          // CASE 3: create new user
          const name = payload.name || payload.email.split('@')[0]
          user = (await prisma.user.create({
            data: {
              email: payload.email,
              name,
              googleId: payload.sub,
              emailVerified: true,
              emailVerifiedAt: new Date(),
              avatarUrl: payload.picture || null,
            },
            include: { team: true },
          })) as any
        }
      }

      // Check for pending invite token stored at OAuth initiation
      const pendingInviteToken = query.state
        ? await redis.get(`oauth:invite:${query.state}`)
        : null
      if (pendingInviteToken) {
        await redis.del(`oauth:invite:${query.state!}`)
      }

      // Auto-accept invite if user arrived via an invite link (works for both
      // new OAuth signups and existing users linking their Google account)
      if (pendingInviteToken && user) {
        await tryAcceptInvitation(user.id, pendingInviteToken)
        // Re-fetch user to get updated teamId after invite acceptance
        user = await authRepository.findById(user.id)
      }

      // Generate session tokens
      const accessToken = generateAccessToken(user!)
      const refreshToken = generateRefreshToken()

      await authRepository.createRefreshToken({
        userId: user!.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      })

      res.cookie('vocaply_refresh', refreshToken, COOKIE_OPTIONS)

      // Redirect to dashboard or onboarding
      const redirectUrl =
        user!.onboardingCompleted || user!.teamId
          ? `${frontendUrl}/dashboard`
          : `${frontendUrl}/onboarding`

      res.redirect(redirectUrl)
    } catch (error) {
      logger.error({ error }, 'Google OAuth callback handling failed')
      res.redirect(`${frontendUrl}/login?error=oauth_failed`)
    }
  },

  /**
   * Get authenticated user's profile.
   */
  async getMe(userId: string) {
    const user = await authRepository.findById(userId)
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found')
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
        team: user.team || null,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        lastLoginAt: user.lastLoginAt,
        onboardingCompleted: user.onboardingCompleted,
      },
    }
  },

  /**
   * Update authenticated user's profile.
   */
  async updateMe(
    userId: string,
    data: { name?: string; timezone?: string; avatarUrl?: string | null; onboardingCompleted?: boolean }
  ) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      include: { team: true },
    })

    return {
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        teamId: updated.teamId,
        team: updated.team || null,
        avatarUrl: updated.avatarUrl,
        timezone: updated.timezone,
        lastLoginAt: updated.lastLoginAt,
        onboardingCompleted: updated.onboardingCompleted,
      },
    }
  },

  /**
   * Retrieve active refresh token sessions.
   */
  async getSessions(userId: string, currentToken: string) {
    const sessions = await authRepository.getSessionsByUserId(userId)
    const currentHash = hashToken(currentToken)

    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt || session.createdAt,
      isCurrent: session.tokenHash === currentHash,
    }))
  },

  /**
   * Google Calendar OAuth Initiate.
   */
  async googleCalendarInit(userId: string, res: Response) {
    const state = crypto.randomBytes(32).toString('hex')
    // Store in Redis (TTL 10 min) linking state to the user ID
    await redis.set(`oauth:state:calendar:${state}`, userId, 'EX', 600)

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: env.GOOGLE_REDIRECT_URI!,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      state,
      access_type: 'offline',
      prompt: 'consent',
    })

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  },

  /**
   * Google Calendar OAuth Callback.
   */
  async googleCalendarCallback(
    query: { code?: string; state?: string; error?: string },
    res: Response,
    redirectUri?: string
  ) {
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'

    if (query.error === 'access_denied') {
      return res.redirect(`${frontendUrl}/onboarding/connect-calendar?error=oauth_denied`)
    }

    if (!query.state || !query.code) {
      return res.redirect(`${frontendUrl}/onboarding/connect-calendar?error=oauth_failed`)
    }

    // Verify state
    const userId = await redis.get(`oauth:state:calendar:${query.state}`)
    if (!userId) {
      return res.redirect(`${frontendUrl}/onboarding/connect-calendar?error=state_mismatch`)
    }
    // Delete state (one-time use)
    await redis.del(`oauth:state:calendar:${query.state}`)

    try {
      const activeRedirectUri = redirectUri || `${env.API_URL || 'http://localhost:4000'}/api/v1/auth/google-calendar/callback`
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: query.code,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: activeRedirectUri,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Google token exchange failed')
      }

      const tokens = (await tokenResponse.json()) as any
      const { access_token, refresh_token, expires_in } = tokens

      if (!access_token) {
        throw new Error('No access token returned from Google')
      }

      // Encrypt sensitive tokens using crypto utility
      const accessTokenEnc = encrypt(access_token)
      const refreshTokenEnc = refresh_token ? encrypt(refresh_token) : null
      const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000)

      // Store / Update user integration in database
      await prisma.userIntegration.upsert({
        where: {
          userId_provider: {
            userId,
            provider: 'GOOGLE_CALENDAR',
          },
        },
        create: {
          userId,
          provider: 'GOOGLE_CALENDAR',
          accessTokenEnc,
          refreshTokenEnc,
          tokenExpiresAt,
          calendarId: 'primary',
          syncEnabled: true,
        },
        update: {
          accessTokenEnc,
          ...(refreshTokenEnc && { refreshTokenEnc }),
          tokenExpiresAt,
          syncEnabled: true,
        },
      })

      res.redirect(`${frontendUrl}/onboarding/connect-calendar?connected=true`)
    } catch (error) {
      logger.error({ error }, 'Google Calendar OAuth callback handling failed')
      res.redirect(`${frontendUrl}/onboarding/connect-calendar?error=oauth_failed`)
    }
  },

  /**
   * Revoke a refresh token session (remote logout).
   */
  async revokeSession(userId: string, sessionId: string) {
    const session = await prisma.refreshToken.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      throw new AppError('SESSION_NOT_FOUND', 404, 'Session not found')
    }

    if (session.userId !== userId) {
      throw new ForbiddenError('You do not have permission to revoke this session')
    }

    await authRepository.deleteRefreshToken(sessionId)

    return { message: 'Session revoked successfully' }
  },
}

