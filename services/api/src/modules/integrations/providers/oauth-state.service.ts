import crypto from 'crypto'
import { redis } from '../../../config/redis'
import { ProviderType } from '../integrations.types'

export interface OAuthStatePayload {
    provider: ProviderType
    teamId: string
    userId: string
}

export class OAuthStateService {
    private static TTL_SECONDS = 600 // 10 minutes

    static async generateState(
        provider: ProviderType,
        teamId: string,
        userId: string
    ): Promise<string> {
        const state = crypto.randomBytes(32).toString('hex')
        const payload: OAuthStatePayload = { provider, teamId, userId }

        await redis.setex(
            `oauth:state:${state}`,
            this.TTL_SECONDS,
            JSON.stringify(payload)
        )

        return state
    }

    static async consumeState(state: string): Promise<OAuthStatePayload | null> {
        const key = `oauth:state:${state}`

        // Multi to ensure atomic read and delete
        const result = await redis.multi().get(key).del(key).exec()

        if (!result || !result[0] || result[0][0] || !result[0][1]) {
            return null
        }

        const dataStr = result[0][1] as string

        try {
            return JSON.parse(dataStr) as OAuthStatePayload
        } catch (e) {
            return null
        }
    }
}
