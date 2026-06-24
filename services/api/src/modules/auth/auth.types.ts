import { UserRole } from '@prisma/client'

export interface CreateUserData {
  email: string
  name: string
  passwordHash: string
}

export interface CreateRefreshTokenData {
  userId: string
  tokenHash: string
  expiresAt: Date
  ipAddress?: string | null
  userAgent?: string | null
}

export interface JwtPayload {
  sub: string
  teamId: string | null
  role: UserRole
  email: string
}

export interface AuthUser {
  id: string
  teamId: string | null
  role: UserRole
  email: string
}
