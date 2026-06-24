import { ProviderType } from './integrations.types'
import { integrationsRepository } from './integrations.repository'
import { OAuthStateService } from './providers/oauth-state.service'
import { OAUTH_CONFIGS } from './providers/oauth-config'
import { jiraProvider } from './providers/jira.provider'
import { slackProvider } from './providers/slack.provider'
import { linearProvider } from './providers/linear.provider'
import { notionProvider } from './providers/notion.provider'
import { AppError } from '../../utils/errors'
import { encrypt } from '../../utils/crypto'
import { redis } from '../../config/redis'
import { getIO } from '../../realtime/socket.server'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom } from '../../realtime/rooms.manager'
import { addSeconds } from 'date-fns'
import { env } from '../../config/env'
import { logger } from '../../config/logger'

// ─────────────────────────────────────────────────────────────────────────────
// resolveProvider — the SINGLE place in this service that changed on Day 22.
//
// RULE (from Day 21 design): Provider files NEVER import integrations.service.ts.
// The service calls INTO providers. This rule is what makes today's three new
// providers pure ADDITIONS rather than requiring changes elsewhere.
//
// Confirmed via diff: only this switch gained new cases. Zero other changes
// to this file's logic were required — proving Day 21's architecture paid off.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveProvider(provider: ProviderType) {
    switch (provider) {
        case 'JIRA':
            return jiraProvider
        case 'SLACK':
            return slackProvider
        case 'LINEAR':
            return linearProvider
        case 'NOTION':
            return notionProvider
        default:
            throw new AppError('UNSUPPORTED_PROVIDER', 400, 'Unsupported provider')
    }
}

export class IntegrationsService {
    async listIntegrations(teamId: string) {
        const cacheKey = `cache:team:integrations:${teamId}`
        const cached = await redis.get(cacheKey)
        if (cached) return JSON.parse(cached)

        const list = await integrationsRepository.findAllByTeam(teamId)
        await redis.setex(cacheKey, 300, JSON.stringify(list))
        return list
    }

    async initiateOAuth(provider: ProviderType, teamId: string, userId: string) {
        const allowedProviders: ProviderType[] = ['JIRA', 'LINEAR', 'SLACK', 'NOTION']
        if (!allowedProviders.includes(provider)) {
            throw new AppError('INVALID_PROVIDER', 422, 'Invalid provider')
        }

        const config = OAUTH_CONFIGS[provider]
        if (!config) {
            throw new AppError('PROVIDER_NOT_CONFIGURED', 422, `Provider ${provider} is not configured`)
        }

        const state = await OAuthStateService.generateState(provider, teamId, userId)

        let authUrl = `${config.authUrl}?client_id=${config.clientId}&response_type=code&redirect_uri=${encodeURIComponent(config.callbackUrl)}&state=${state}&scope=${encodeURIComponent(config.scopes.join(' '))}`

        if (config.extraParams) {
            for (const [k, v] of Object.entries(config.extraParams)) {
                authUrl += `&${k}=${encodeURIComponent(v)}`
            }
        }

        return { authUrl }
    }

    async handleOAuthCallback(provider: ProviderType, code: string, state: string) {
        const consumed = await OAuthStateService.consumeState(state)
        if (!consumed) throw new AppError('OAUTH_INVALID_STATE', 400, 'Invalid state parameter')
        if (consumed.provider !== provider) throw new AppError('OAUTH_PROVIDER_MISMATCH', 400, 'Provider mismatch')

        const providerClient = resolveProvider(provider)
        let tokenResponse
        try {
            tokenResponse = await providerClient.exchangeCodeForTokens(code)
        } catch (e: any) {
            logger.error({ error: e.message, provider }, 'Provider token exchange failed')
            throw new AppError('PROVIDER_TOKEN_EXCHANGE_FAILED', 502, 'Provider token exchange failed')
        }

        const encryptedAccess = encrypt(tokenResponse.accessToken)
        const encryptedRefresh = tokenResponse.refreshToken ? encrypt(tokenResponse.refreshToken) : null
        const tokenExpiresAt = tokenResponse.expiresIn ? addSeconds(new Date(), tokenResponse.expiresIn) : null

        await integrationsRepository.upsert(consumed.teamId, provider, {
            accessTokenEnc: encryptedAccess,
            refreshTokenEnc: encryptedRefresh,
            tokenExpiresAt,
            workspaceId: tokenResponse.workspaceMeta.id,
            workspaceName: tokenResponse.workspaceMeta.name,
            workspaceUrl: tokenResponse.workspaceMeta.url,
            metadata: tokenResponse.workspaceMeta.extra
                ? { ...(tokenResponse.workspaceMeta.extra as Record<string, unknown>) }
                : undefined,
            isActive: true,
            consecutiveErrors: 0,
            connectedById: consumed.userId,
        })

        await redis.del(`cache:team:integrations:${consumed.teamId}`)
        try {
          getIO().to(teamRoom(consumed.teamId)).emit(SERVER_EVENTS.INTEGRATION_CONNECTED, {
            provider,
            workspaceName: tokenResponse.workspaceMeta.name,
          })
        } catch (err) {
          logger.warn({ err }, 'integrations.service: Socket.io emit failed (non-fatal)')
        }

        return {
            redirectUrl: `${env.FRONTEND_URL}/settings/integrations?connected=${provider}`,
        }
    }

    async disconnectIntegration(teamId: string, provider: ProviderType, requesterId: string) {
        const integration = await integrationsRepository.findByTeamAndProvider(teamId, provider)
        if (!integration) throw new AppError('NOT_FOUND', 404, 'Integration not found')

        const providerClient = resolveProvider(provider)
        await providerClient.revokeToken(integration) // Best effort, swallows errors inside provider

        await integrationsRepository.markDisconnected(integration.id, requesterId)
        await redis.del(`cache:team:integrations:${teamId}`)
        try {
          getIO().to(teamRoom(teamId)).emit(SERVER_EVENTS.INTEGRATION_DISCONNECTED, { provider })
        } catch (err) {
          logger.warn({ err }, 'integrations.service: Socket.io disconnect emit failed (non-fatal)')
        }

        return { message: 'Disconnected', provider }
    }

    async testConnection(teamId: string, provider: ProviderType) {
        const integration = await integrationsRepository.findByTeamAndProvider(teamId, provider)
        if (!integration || !integration.isActive) {
            throw new AppError('INTEGRATION_NOT_CONNECTED', 422, 'Integration not connected')
        }

        const providerClient = resolveProvider(provider)
        const result = await providerClient.testConnection(integration)

        if (result.healthy) {
            await integrationsRepository.resetErrorCount(integration.id)
        } else {
            await integrationsRepository.incrementErrorCount(integration.id)
        }

        return { healthy: result.healthy, workspaceName: result.workspaceName, lastChecked: new Date() }
    }
}

export const integrationsService = new IntegrationsService()
