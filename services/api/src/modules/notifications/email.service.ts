import { env } from '../../config/env'
import { logger } from '../../config/logger'

// Check if Brevo is configured
const isBrevoConfigured =
  env.BREVO_API_KEY &&
  env.BREVO_API_KEY !== 'xkeysib-your_brevo_api_key_here'

export const emailService = {
  /**
   * Sends a verification email to a newly registered user via Brevo's Transactional Email API.
   */
  async sendVerificationEmail(data: {
    to: string
    name: string
    verificationToken: string
  }): Promise<void> {
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'
    const url = `${frontendUrl}/verify-email?token=${data.verificationToken}`
    const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@vocaply.com'

    logger.info({ to: data.to }, 'Preparing verification email')

    if (!isBrevoConfigured) {
      logger.warn(
        { url, to: data.to },
        'BREVO_API_KEY is not configured. Verification URL printed to console.'
      )
      return
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': env.BREVO_API_KEY!,
        },
        body: JSON.stringify({
          sender: {
            name: 'Vocaply',
            email: fromEmail,
          },
          to: [
            {
              email: data.to,
              name: data.name,
            },
          ],
          subject: 'Verify your Vocaply account',
          htmlContent: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2>Verify Your Email</h2>
              <p>Hi ${data.name},</p>
              <p>Thank you for signing up with Vocaply. Please click the button below to verify your email address:</p>
              <div style="margin: 24px 0;">
                <a href="${url}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email Address</a>
              </div>
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p><a href="${url}">${url}</a></p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="font-size: 12px; color: #666;">This link will expire in 24 hours. If you did not sign up for Vocaply, you can safely ignore this email.</p>
            </div>
          `,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Brevo API returned status ${response.status}: ${errorText}`)
      }

      logger.info({ to: data.to }, 'Verification email sent successfully via Brevo')
    } catch (error) {
      logger.error({ error, to: data.to }, 'Failed to send verification email via Brevo')
      throw error
    }
  },

  /**
   * Sends a password reset email to a user via Brevo's Transactional Email API.
   */
  async sendPasswordResetEmail(data: {
    to: string
    name: string
    token: string
  }): Promise<void> {
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'
    const url = `${frontendUrl}/reset-password?token=${data.token}`
    const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@vocaply.com'

    logger.info({ to: data.to }, 'Preparing password reset email')

    if (!isBrevoConfigured) {
      logger.warn(
        { url, to: data.to },
        'BREVO_API_KEY is not configured. Password reset URL printed to console.'
      )
      return
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': env.BREVO_API_KEY!,
        },
        body: JSON.stringify({
          sender: {
            name: 'Vocaply',
            email: fromEmail,
          },
          to: [
            {
              email: data.to,
              name: data.name,
            },
          ],
          subject: 'Reset your Vocaply password',
          htmlContent: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2>Reset Your Password</h2>
              <p>Hi ${data.name},</p>
              <p>We received a request to reset your password for your Vocaply account. Click the button below to choose a new password:</p>
              <div style="margin: 24px 0;">
                <a href="${url}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
              </div>
              <p>If you did not request a password reset, please ignore this email or contact support if you have questions.</p>
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p><a href="${url}">${url}</a></p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="font-size: 12px; color: #666;">This link will expire in 1 hour. For security reasons, please do not share this email or link.</p>
            </div>
          `,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Brevo API returned status ${response.status}: ${errorText}`)
      }

      logger.info({ to: data.to }, 'Password reset email sent successfully via Brevo')
    } catch (error) {
      logger.error({ error, to: data.to }, 'Failed to send password reset email via Brevo')
      throw error
    }
  },

  /**
   * Sends a team invitation email to an invited user via Brevo.
   */
  async sendTeamInviteEmail(data: {
    to: string
    teamName: string
    inviterName: string
    joinUrl: string
    role: string
    expiresAt: Date
  }): Promise<void> {
    const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@vocaply.com'
    const expiryStr = data.expiresAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    logger.info({ to: data.to, teamName: data.teamName }, 'Preparing team invite email')

    if (!isBrevoConfigured) {
      logger.warn(
        { joinUrl: data.joinUrl, to: data.to },
        'BREVO_API_KEY not configured. Team invite URL printed to console.'
      )
      return
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': env.BREVO_API_KEY!,
        },
        body: JSON.stringify({
          sender: { name: 'Vocaply', email: fromEmail },
          to: [{ email: data.to }],
          subject: `${data.inviterName} invited you to join ${data.teamName} on Vocaply`,
          htmlContent: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px;">
              <h2>You're invited to join <strong>${data.teamName}</strong></h2>
              <p>${data.inviterName} has invited you to join their team on Vocaply as <strong>${data.role}</strong>.</p>
              <p>Vocaply helps teams track meeting commitments and accountability automatically.</p>
              <div style="margin: 24px 0;">
                <a href="${data.joinUrl}" style="background-color: #6366f1; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Accept Invitation
                </a>
              </div>
              <p style="color: #666; font-size: 13px;">This invitation expires on ${expiryStr}. If you did not expect this invite, you can safely ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="font-size: 12px; color: #999;">Or copy this link: <a href="${data.joinUrl}">${data.joinUrl}</a></p>
            </div>
          `,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Brevo API returned status ${response.status}: ${errorText}`)
      }

      logger.info({ to: data.to, teamName: data.teamName }, 'Team invite email sent via Brevo')
    } catch (error) {
      logger.error({ error, to: data.to }, 'Failed to send team invite email via Brevo')
      throw error
    }
  },


  /**
   * Sends a meeting summary notification to a participant/user.
   */
  async sendMeetingSummary(data: {
    to: string
    name: string
    meetingTitle: string
    summary: string
    commitmentsCount: number
    actionItemsCount: number
    viewUrl: string
  }): Promise<void> {
    const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@vocaply.com'
    logger.info({ to: data.to, meetingTitle: data.meetingTitle }, 'Preparing meeting summary email')

    if (!isBrevoConfigured) {
      logger.warn(
        { viewUrl: data.viewUrl, to: data.to },
        'BREVO_API_KEY not configured. Meeting summary URL printed to console.'
      )
      return
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': env.BREVO_API_KEY!,
        },
        body: JSON.stringify({
          sender: { name: 'Vocaply', email: fromEmail },
          to: [{ email: data.to, name: data.name }],
          subject: `Meeting Summary: ${data.meetingTitle}`,
          htmlContent: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; line-height: 1.6;">
              <h2 style="color: #10b981; margin-bottom: 8px;">Meeting Summary</h2>
              <h3 style="margin-top: 0; color: #555;">${data.meetingTitle}</h3>
              <p>Hi ${data.name},</p>
              <p>Here is a summary and key highlights extracted from your recent meeting:</p>
              <div style="background-color: #f9fafb; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; font-style: italic; white-space: pre-line;">${data.summary || 'No summary text available.'}</p>
              </div>
              <div style="display: flex; gap: 20px; margin-bottom: 24px;">
                <div style="flex: 1; background-color: #f3f4f6; padding: 12px; border-radius: 6px; text-align: center;">
                  <strong style="font-size: 20px; color: #10b981;">${data.commitmentsCount}</strong>
                  <div style="font-size: 12px; color: #666;">Commitments</div>
                </div>
                <div style="flex: 1; background-color: #f3f4f6; padding: 12px; border-radius: 6px; text-align: center;">
                  <strong style="font-size: 20px; color: #10b981;">${data.actionItemsCount}</strong>
                  <div style="font-size: 12px; color: #666;">Action Items</div>
                </div>
              </div>
              <div style="margin: 24px 0;">
                <a href="${data.viewUrl}" style="background-color: #10b981; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  View Meeting Details
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="font-size: 12px; color: #999;">If the button doesn't work, copy this link: <a href="${data.viewUrl}">${data.viewUrl}</a></p>
            </div>
          `,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Brevo API returned status ${response.status}: ${errorText}`)
      }

      logger.info({ to: data.to }, 'Meeting summary email sent successfully')
    } catch (error) {
      logger.error({ error, to: data.to }, 'Failed to send meeting summary email')
      throw error
    }
  },

  /**
   * Sends a notification to a user indicating they missed a commitment deadline.
   */
  async sendCommitmentMissed(data: {
    to: string
    name: string
    commitmentText: string
    dueDate: Date
    actionUrl: string
  }): Promise<void> {
    const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@vocaply.com'
    const dueStr = data.dueDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    logger.info({ to: data.to }, 'Preparing commitment missed email')

    if (!isBrevoConfigured) {
      logger.warn(
        { actionUrl: data.actionUrl, to: data.to },
        'BREVO_API_KEY not configured. Commitment missed URL printed to console.'
      )
      return
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': env.BREVO_API_KEY!,
        },
        body: JSON.stringify({
          sender: { name: 'Vocaply', email: fromEmail },
          to: [{ email: data.to, name: data.name }],
          subject: `⚠️ Commitment Overdue: Action required`,
          htmlContent: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; line-height: 1.6;">
              <h2 style="color: #ef4444; margin-bottom: 8px;">Overdue Commitment Alert</h2>
              <p>Hi ${data.name},</p>
              <p>You have missed the deadline for the following commitment:</p>
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; font-weight: bold; color: #991b1b;">"${data.commitmentText}"</p>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #7f1d1d;">Was due on: ${dueStr}</p>
              </div>
              <p>Missing commitments impacts your team's velocity and your personal Accountability Score. Please update the status of this commitment or request an extension.</p>
              <div style="margin: 24px 0;">
                <a href="${data.actionUrl}" style="background-color: #ef4444; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Resolve Commitment
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="font-size: 12px; color: #999;">If the button doesn't work, copy this link: <a href="${data.actionUrl}">${data.actionUrl}</a></p>
            </div>
          `,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Brevo API returned status ${response.status}: ${errorText}`)
      }

      logger.info({ to: data.to }, 'Commitment missed email sent successfully')
    } catch (error) {
      logger.error({ error, to: data.to }, 'Failed to send commitment missed email')
      throw error
    }
  },

  /**
   * Sends a manager alert email when a team member misses a commitment deadline.
   */
  async sendManagerAlert(data: {
    to: string
    name: string
    assigneeName: string
    commitmentText: string
    dueDate: Date
    actionUrl: string
  }): Promise<void> {
    const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@vocaply.com'
    const dueStr = data.dueDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    logger.info({ to: data.to }, 'Preparing manager alert email')

    if (!isBrevoConfigured) {
      logger.warn(
        { actionUrl: data.actionUrl, to: data.to },
        'BREVO_API_KEY not configured. Manager alert URL printed to console.'
      )
      return
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': env.BREVO_API_KEY!,
        },
        body: JSON.stringify({
          sender: { name: 'Vocaply', email: fromEmail },
          to: [{ email: data.to, name: data.name }],
          subject: `Alert: ${data.assigneeName} missed a commitment deadline`,
          htmlContent: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; line-height: 1.6;">
              <h2 style="color: #f59e0b; margin-bottom: 8px;">Manager Accountability Alert</h2>
              <p>Hi ${data.name},</p>
              <p>This is an automated alert to notify you that a member of your team has missed their commitment deadline:</p>
              <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; font-weight: bold; color: #92400e;">Owner: ${data.assigneeName}</p>
                <p style="margin: 8px 0 0 0; font-weight: 500; color: #78350f;">"${data.commitmentText}"</p>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #78350f;">Was due on: ${dueStr}</p>
              </div>
              <p>As their manager, you can follow up on their progress or adjust deadlines in the dashboard.</p>
              <div style="margin: 24px 0;">
                <a href="${data.actionUrl}" style="background-color: #f59e0b; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  View Team Dashboard
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="font-size: 12px; color: #999;">If the button doesn't work, copy this link: <a href="${data.actionUrl}">${data.actionUrl}</a></p>
            </div>
          `,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Brevo API returned status ${response.status}: ${errorText}`)
      }

      logger.info({ to: data.to }, 'Manager alert email sent successfully')
    } catch (error) {
      logger.error({ error, to: data.to }, 'Failed to send manager alert email')
      throw error
    }
  },

  /**
   * Sends a digest of upcoming/today deadlines to a user.
   */
  async sendDeadlineReminder(data: {
    to: string
    name: string
    commitments: Array<{ id: string; text: string; dueDate: Date }>
    actionUrl: string
  }): Promise<void> {
    const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@vocaply.com'
    logger.info({ to: data.to }, 'Preparing deadline reminder email')

    if (!isBrevoConfigured) {
      logger.warn(
        { actionUrl: data.actionUrl, to: data.to },
        'BREVO_API_KEY not configured. Deadline reminder URL printed to console.'
      )
      return
    }

    const commitmentsListHtml = data.commitments
      .map(
        (c) => `
        <li style="margin-bottom: 12px; padding: 12px; background-color: #f9fafb; border-radius: 6px; list-style-type: none; border-left: 3px solid #10b981;">
          <strong style="color: #374151;">"${c.text}"</strong><br/>
          <span style="font-size: 12px; color: #6b7280;">Due date: ${new Date(c.dueDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}</span>
        </li>
      `
      )
      .join('')

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': env.BREVO_API_KEY!,
        },
        body: JSON.stringify({
          sender: { name: 'Vocaply', email: fromEmail },
          to: [{ email: data.to, name: data.name }],
          subject: `Reminder: You have ${data.commitments.length} commitments due soon`,
          htmlContent: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; line-height: 1.6;">
              <h2 style="color: #10b981; margin-bottom: 8px;">Upcoming Commitment Deadlines</h2>
              <p>Hi ${data.name},</p>
              <p>This is a reminder that you have the following commitments due today or tomorrow. Completing them on time preserves your high Accountability Score!</p>
              <ul style="padding: 0; margin: 20px 0;">
                ${commitmentsListHtml}
              </ul>
              <div style="margin: 24px 0;">
                <a href="${data.actionUrl}" style="background-color: #10b981; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  View My Commitments
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="font-size: 12px; color: #999;">If the button doesn't work, copy this link: <a href="${data.actionUrl}">${data.actionUrl}</a></p>
            </div>
          `,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Brevo API returned status ${response.status}: ${errorText}`)
      }

      logger.info({ to: data.to }, 'Deadline reminder email sent successfully')
    } catch (error) {
      logger.error({ error, to: data.to }, 'Failed to send deadline reminder email')
      throw error
    }
  },
}

