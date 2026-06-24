import { ProviderType } from '../integrations.types'
import { env } from '../../../config/env'

export interface OAuthConfig {
    clientId: string
    clientSecret: string
    authUrl: string
    tokenUrl: string
    callbackUrl: string
    scopes: string[]
    extraParams?: Record<string, string>
}

export const OAUTH_CONFIGS: Partial<Record<ProviderType, OAuthConfig>> = {
    JIRA: {
        clientId: env.JIRA_CLIENT_ID,
        clientSecret: env.JIRA_CLIENT_SECRET,
        authUrl: 'https://auth.atlassian.com/authorize',
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        callbackUrl: env.JIRA_CALLBACK_URL,
        scopes: [
            'read:jira-user',
            'write:jira-work',
            'read:jira-work',
            'offline_access',
        ],
        extraParams: {
            audience: 'api.atlassian.com',
            prompt: 'consent',
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Slack — Bot token flow (oauth.v2.access)
    // Scope strategy: minimum viable — chat:write, channels:read, users:read.email, im:write
    // NO admin scopes. NO channels:manage. Vocaply only posts into pre-configured channels.
    // refreshAccessToken() is a documented NO-OP for Slack bot tokens — they do not expire.
    // ─────────────────────────────────────────────────────────────────────────
    SLACK: {
        clientId: env.SLACK_CLIENT_ID ?? '',
        clientSecret: env.SLACK_CLIENT_SECRET ?? '',
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        callbackUrl: env.SLACK_CALLBACK_URL ?? '',
        scopes: [
            'chat:write',
            'channels:read',
            'users:read',
            'users:read.email',
            'im:write',
        ],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Linear — Standard OAuth2
    // Scope strategy: issues:create + issues:read ONLY.
    // Explicitly NOT requesting admin:* or organization:* even though convenient.
    // ─────────────────────────────────────────────────────────────────────────
    LINEAR: {
        clientId: env.LINEAR_CLIENT_ID ?? '',
        clientSecret: env.LINEAR_CLIENT_SECRET ?? '',
        authUrl: 'https://linear.app/oauth/authorize',
        tokenUrl: 'https://api.linear.app/oauth/token',
        callbackUrl: env.LINEAR_CALLBACK_URL ?? '',
        scopes: ['read', 'write'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Notion — Standard OAuth2
    // Scope strategy: default integration capabilities (read + insert content).
    // NO "update content" beyond what page creation itself requires.
    // NOTE: Notion's stable API does NOT support outbound webhooks. Do not
    // attempt to build a notion.webhook.ts. Re-evaluate if they add support.
    // ─────────────────────────────────────────────────────────────────────────
    NOTION: {
        clientId: env.NOTION_CLIENT_ID ?? '',
        clientSecret: env.NOTION_CLIENT_SECRET ?? '',
        authUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        callbackUrl: env.NOTION_CALLBACK_URL ?? '',
        scopes: [],
        extraParams: {
            owner: 'user',
        },
    },
}
