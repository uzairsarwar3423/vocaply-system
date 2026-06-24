import { z } from 'zod'

export const registerSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().toLowerCase().trim(),
  password: z.string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
  // Optional: invite token passed from /invite/:token page when a new user registers
  inviteToken: z.string().min(1).optional(),
})

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
})

export const updateMeSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  timezone: z.string().trim().optional(),
  avatarUrl: z.string().url().trim().or(z.literal('')).nullable().optional(),
  onboardingCompleted: z.boolean().optional(),
})

