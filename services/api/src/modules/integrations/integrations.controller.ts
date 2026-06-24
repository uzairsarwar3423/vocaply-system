import { Request, Response, NextFunction } from 'express'
import { integrationsService } from './integrations.service'
import { ProviderType } from './integrations.types'
import { env } from '../../config/env'

export const listIntegrationsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const list = await integrationsService.listIntegrations(teamId)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
}

export const connectController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const userId = req.user!.id
        const provider = req.params.provider as ProviderType
        
        const result = await integrationsService.initiateOAuth(provider, teamId, userId)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const callbackController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const provider = req.params.provider as ProviderType
        const { code, state, error } = req.query

        if (error) {
            // User denied consent or provider error
            return res.redirect(`${env.FRONTEND_URL}/settings/integrations?error=${error}`)
        }

        const result = await integrationsService.handleOAuthCallback(provider, code as string, state as string)
        res.redirect(result.redirectUrl)
    } catch (e: any) {
        let errorCode = 'UNKNOWN_ERROR'
        if (e.code === 'OAUTH_INVALID_STATE') errorCode = 'OAUTH_INVALID_STATE'
        if (e.code === 'OAUTH_PROVIDER_MISMATCH') errorCode = 'OAUTH_PROVIDER_MISMATCH'
        if (e.code === 'PROVIDER_TOKEN_EXCHANGE_FAILED') errorCode = 'PROVIDER_TOKEN_EXCHANGE_FAILED'
        
        res.redirect(`${env.FRONTEND_URL}/settings/integrations?error=${errorCode}`)
    }
}

export const disconnectController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const userId = req.user!.id
        const provider = req.params.provider as ProviderType

        const result = await integrationsService.disconnectIntegration(teamId, provider, userId)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}

export const testConnectionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teamId = req.teamId!
        const provider = req.params.provider as ProviderType

        const result = await integrationsService.testConnection(teamId, provider)
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
}
