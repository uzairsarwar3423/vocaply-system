import { TeamIntegration } from '@prisma/client'
import { ProviderTokenResponse } from '../integrations.types'

export interface ProviderTestResult {
    healthy: boolean
    workspaceName?: string
}

export interface IntegrationProvider {
    exchangeCodeForTokens(code: string): Promise<ProviderTokenResponse>
    refreshAccessToken(
        refreshTokenEnc: string
    ): Promise<Omit<ProviderTokenResponse, 'workspaceMeta'>>
    testConnection(integration: TeamIntegration): Promise<ProviderTestResult>
    revokeToken(integration: TeamIntegration): Promise<void>
}
