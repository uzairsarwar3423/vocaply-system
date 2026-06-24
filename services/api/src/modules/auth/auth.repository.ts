import { prisma } from '../../db/client'
import { CreateUserData, CreateRefreshTokenData } from './auth.types'
import { User, RefreshToken, Team, EmailVerificationToken, PasswordResetToken } from '@prisma/client'

export const authRepository = {
  /**
   * Find an active user by their email address.
   */
  async findByEmail(email: string): Promise<(User & { team: Team | null }) | null> {
    return prisma.user.findUnique({
      where: { email, deletedAt: null },
      include: { team: true },
    })
  },

  /**
   * Find an active user by their unique ID.
   */
  async findById(id: string): Promise<(User & { team: Team | null }) | null> {
    return prisma.user.findUnique({
      where: { id, deletedAt: null },
      include: { team: true },
    })
  },

  /**
   * Create a new user in the database.
   */
  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
      },
    })
  },

  /**
   * Update the failed login attempts counter and lockout timestamp for brute-force protection.
   */
  async updateFailedAttempts(
    id: string,
    attempts: number,
    lockedUntil: Date | null
  ): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil,
      },
    })
  },

  /**
   * Reset failed login attempts and lockout when a user logs in successfully.
   */
  async resetFailedAttempts(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })
  },

  /**
   * Record successful login timestamp and update active status.
   */
  async updateLastLogin(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
      },
    })
  },

  /**
   * Store a hashed refresh token session in the database.
   */
  async createRefreshToken(data: CreateRefreshTokenData): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    })
  },

  /**
   * Retrieve a refresh token session using its hash, including user details.
   */
  async findRefreshToken(tokenHash: string): Promise<(RefreshToken & { user: User }) | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })
  },

  /**
   * Delete a single refresh token session (logout).
   */
  async deleteRefreshToken(id: string): Promise<void> {
    await prisma.refreshToken.delete({
      where: { id },
    })
  },

  /**
   * Delete all refresh token sessions for a user (logout all devices).
   */
  async deleteAllRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    })
  },

  /**
   * Create an email verification token entry in the database.
   */
  async createEmailVerificationToken(data: {
    userId: string
    tokenHash: string
    expiresAt: Date
  }): Promise<void> {
    await prisma.emailVerificationToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    })
  },

  /**
   * Find an email verification token by its hash.
   */
  async findEmailVerificationToken(tokenHash: string): Promise<EmailVerificationToken | null> {
    return prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    })
  },

  /**
   * Delete an email verification token.
   */
  async deleteEmailVerificationToken(id: string): Promise<void> {
    await prisma.emailVerificationToken.delete({
      where: { id },
    })
  },

  /**
   * Create a password reset token entry in the database.
   */
  async createPasswordResetToken(data: {
    userId: string
    tokenHash: string
    expiresAt: Date
    ipAddress?: string | null
  }): Promise<PasswordResetToken> {
    return prisma.passwordResetToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress || null,
      },
    })
  },

  /**
   * Find a password reset token by its hash.
   */
  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
    return prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    })
  },

  /**
   * Mark a password reset token as used.
   */
  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    })
  },

  /**
   * Find a user by their Google ID.
   */
  async findUserByGoogleId(googleId: string): Promise<(User & { team: Team | null }) | null> {
    return prisma.user.findUnique({
      where: { googleId, deletedAt: null },
      include: { team: true },
    })
  },

  /**
   * Link a Google account ID and optional picture to an existing user.
   */
  async linkGoogleAccount(
    userId: string,
    googleId: string,
    avatarUrl?: string | null
  ): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        googleId,
        ...(avatarUrl ? { avatarUrl } : {}),
      },
    })
  },

  /**
   * Get all active refresh token sessions for a specific user.
   */
  async getSessionsByUserId(userId: string): Promise<RefreshToken[]> {
    return prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  },
}

