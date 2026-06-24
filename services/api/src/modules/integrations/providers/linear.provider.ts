// ─────────────────────────────────────────────────────────────────────────────
// linear.provider.ts — Linear Integration Provider
//
// GraphQL API (Linear has NO REST API for mutations).
// Architecture: ONE executeGraphQL() function wraps all HTTP calls.
// Every operation (createIssue, findUserByEmail, testConnection) is a
// different query/mutation string passed through that single client.
// This is the correct shape for GraphQL — not 5 separate Axios call sites.
//
// Priority mapping: explicit lookup table (NOT a formula).
// Linear's scale: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low (inverted vs intuition).
// An explicit table makes the inversion visible and unit-testable.
//
// Naming collision: linearTeamId (Linear's internal team concept) vs
// vocaplyTeamId. Always fully qualify in variable names.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios'
import type { TeamIntegration } from '@prisma/client'
import type { IntegrationProvider, ProviderTestResult } from './provider.interface'
import type { ProviderTokenResponse, LinearCreateIssueResult } from '../integrations.types'
import { OAUTH_CONFIGS } from './oauth-config'
import { decrypt } from '../../../utils/crypto'
import { logger } from '../../../config/logger'

const LINEAR_API_URL = 'https://api.linear.app/graphql'

// ─────────────────────────────────────────────────────────────────────────────
// Priority mapping — EXPLICIT table, never a formula.
// Linear's numeric scale is inverted from English intuition.
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_MAP: Record<string, number> = {
    LOW: 4,      // Linear "Low"
    MEDIUM: 3,   // Linear "Medium"
    HIGH: 2,     // Linear "High"
    URGENT: 1,   // Linear "Urgent"
}

// ─────────────────────────────────────────────────────────────────────────────
// Core GraphQL client — ONE function, used by every Linear operation
// ─────────────────────────────────────────────────────────────────────────────

async function executeGraphQL<T = unknown>(
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>
): Promise<T> {
    const response = await axios.post(
        LINEAR_API_URL,
        { query, variables: variables ?? {} },
        {
            headers: {
                Authorization: accessToken,
                'Content-Type': 'application/json',
            },
            timeout: 15_000,
        }
    )

    if (response.data.errors?.length) {
        const firstError = response.data.errors[0]
        logger.error({ linearError: firstError }, 'Linear GraphQL error')
        throw new Error(`Linear GraphQL error: ${firstError.message}`)
    }

    return response.data.data as T
}

// ─────────────────────────────────────────────────────────────────────────────
// LinearProvider — implements IntegrationProvider shared contract
// ─────────────────────────────────────────────────────────────────────────────

export class LinearProvider implements IntegrationProvider {

    // ── SharedInterface: OAuth exchange ──────────────────────────────────────
    // Linear's token exchange IS REST (even though most API ops are GraphQL).

    async exchangeCodeForTokens(code: string): Promise<ProviderTokenResponse> {
        const config = OAUTH_CONFIGS.LINEAR!

        const payload = new URLSearchParams({
            code,
            redirect_uri: config.callbackUrl,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: 'authorization_code',
        })

        const response = await axios.post(
            config.tokenUrl,
            payload.toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10_000,
            }
        )

        const accessToken: string = response.data.access_token

        // Follow-up GraphQL query to get workspace metadata
        type ViewerResult = { viewer: { id: string; name: string; organization: { id: string; name: string; urlKey: string } } }
        const viewerData = await executeGraphQL<ViewerResult>(
            accessToken,
            `query { viewer { id name organization { id name urlKey } } }`
        )

        const org = viewerData.viewer.organization
        return {
            accessToken,
            refreshToken: response.data.refresh_token,
            expiresIn: response.data.expires_in,
            workspaceMeta: {
                id: org.id,
                name: org.name,
                url: `https://linear.app/${org.urlKey}`,
            },
        }
    }

    async refreshAccessToken(
        refreshTokenEnc: string
    ): Promise<Omit<ProviderTokenResponse, 'workspaceMeta'>> {
        const config = OAUTH_CONFIGS.LINEAR!
        const refreshToken = decrypt(refreshTokenEnc)

        const payload = new URLSearchParams({
            refresh_token: refreshToken,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: 'refresh_token',
        })

        const response = await axios.post(
            config.tokenUrl,
            payload.toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10_000,
            }
        )

        return {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresIn: response.data.expires_in,
        }
    }

    // ── SharedInterface: testConnection ──────────────────────────────────────

    async testConnection(integration: TeamIntegration): Promise<ProviderTestResult> {
        try {
            const accessToken = decrypt(integration.accessTokenEnc)
            type ViewerResult = { viewer: { id: string; name: string } }
            const data = await executeGraphQL<ViewerResult>(
                accessToken,
                `query { viewer { id name } }`
            )
            if (data.viewer?.id) {
                return { healthy: true, workspaceName: integration.workspaceName || undefined }
            }
            return { healthy: false }
        } catch (err: any) {
            logger.warn({ integrationId: integration.id, error: err.message }, 'Linear testConnection failed')
            return { healthy: false }
        }
    }

    // ── SharedInterface: revokeToken — best-effort ────────────────────────────

    async revokeToken(integration: TeamIntegration): Promise<void> {
        // Linear does not currently provide a REST revocation endpoint.
        // The token simply stops being used from Vocaply's side.
        logger.info({ integrationId: integration.id }, 'Linear revokeToken: no-op (Linear has no revocation endpoint)')
    }

    // ── Linear-specific: find user by email ───────────────────────────────────
    // Called per-job, in-memory-scoped result. NOT cached in Redis.
    // Per-job lookup is the correct cost/complexity tradeoff here:
    // caching adds invalidation complexity for a value read exactly once per job.

    async findUserByEmail(integration: TeamIntegration, email: string): Promise<string | null> {
        try {
            const accessToken = decrypt(integration.accessTokenEnc)
            type UsersResult = { users: { nodes: Array<{ id: string; name: string }> } }
            const data = await executeGraphQL<UsersResult>(
                accessToken,
                `query($email: String!) { users(filter: { email: { eq: $email } }) { nodes { id name } } }`,
                { email }
            )
            return data.users.nodes[0]?.id ?? null
        } catch (err: any) {
            logger.warn({ email, error: err.message }, 'Linear findUserByEmail failed')
            return null
        }
    }

    // ── Linear-specific: createIssue ──────────────────────────────────────────

    async createIssue(
        integration: TeamIntegration,
        actionItem: {
            text: string
            priority?: string
            assignee?: { email?: string | null } | null
        }
    ): Promise<LinearCreateIssueResult> {
        const accessToken = decrypt(integration.accessTokenEnc)
        const meta = integration.metadata as any

        // linearTeamId is Linear's own internal team concept (NOT Vocaply's teamId)
        const linearTeamId: string = meta?.linearTeamId
        if (!linearTeamId) {
            throw new Error('Linear integration missing linearTeamId in metadata')
        }

        // User resolution — proceed without assignee rather than fail (same philosophy as Jira)
        let assigneeId: string | null = null
        if (actionItem.assignee?.email) {
            assigneeId = await this.findUserByEmail(integration, actionItem.assignee.email)
            if (!assigneeId) {
                logger.info({ email: actionItem.assignee.email }, 'Linear: assignee email not found, creating unassigned')
            }
        }

        const priorityNum = PRIORITY_MAP[actionItem.priority ?? 'MEDIUM'] ?? 3

        type CreateIssueResult = {
            issueCreate: {
                success: boolean
                issue: { id: string; url: string; identifier: string }
            }
        }

        const data = await executeGraphQL<CreateIssueResult>(
            accessToken,
            `mutation CreateIssue($input: IssueCreateInput!) {
                issueCreate(input: $input) {
                    success
                    issue { id url identifier }
                }
            }`,
            {
                input: {
                    title: actionItem.text.substring(0, 255),
                    teamId: linearTeamId,
                    priority: priorityNum,
                    ...(assigneeId ? { assigneeId } : {}),
                },
            }
        )

        if (!data.issueCreate.success) {
            throw new Error('Linear issue creation returned success:false')
        }

        return {
            issueId: data.issueCreate.issue.id,
            issueUrl: data.issueCreate.issue.url,
        }
    }
}

export const linearProvider = new LinearProvider()
