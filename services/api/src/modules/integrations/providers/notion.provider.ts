// ─────────────────────────────────────────────────────────────────────────────
// notion.provider.ts — Notion Integration Provider
//
// PERMANENT LIMITATION (recorded in code, not just in docs):
//   Notion's stable public API does not support outbound webhooks as of this
//   build. Do NOT attempt to wire a notion.webhook.ts — there is nothing on
//   Notion's side to trigger it. If Notion adds webhook support in a future
//   API version, re-evaluate this file before building one.
//
// User directory caching:
//   The full workspace user list is fetched ONCE at connect-time and stored
//   in integration.metadata.userDirectory. This means createMeetingPage's
//   assignee-resolution step is a zero-API-call, in-memory lookup.
//   Staleness tradeoff: accepted. Manual "Reconnect" (re-running OAuth) refreshes
//   the directory. A periodic refresh cron is a Day 22+ enhancement.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios'
import type { TeamIntegration } from '@prisma/client'
import type { IntegrationProvider, ProviderTestResult } from './provider.interface'
import type { ProviderTokenResponse, NotionCreatePageResult } from '../integrations.types'
import { OAUTH_CONFIGS } from './oauth-config'
import { decrypt } from '../../../utils/crypto'
import { logger } from '../../../config/logger'

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_API_VERSION = '2022-06-28'

// ─────────────────────────────────────────────────────────────────────────────
// Workspace user directory type
// ─────────────────────────────────────────────────────────────────────────────

interface NotionUser {
    id: string
    name: string
    email?: string
    avatarUrl?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Axios client factory
// ─────────────────────────────────────────────────────────────────────────────

function buildNotionClient(accessToken: string) {
    return axios.create({
        baseURL: NOTION_API_BASE,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Notion-Version': NOTION_API_VERSION,
            'Content-Type': 'application/json',
        },
        timeout: 15_000,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure block builder function — no network calls, no side effects.
// Independently unit-testable: assert on exact JSON shape without mocking HTTP.
// ─────────────────────────────────────────────────────────────────────────────

export function buildNotionBlocks(
    commitments: Array<{ text: string; ownerEmail?: string | null; dueDate?: Date | null }>,
    actionItems: Array<{ text: string; assigneeEmail?: string | null }>
): object[] {
    const blocks: object[] = [
        {
            object: 'block',
            type: 'heading_2',
            heading_2: {
                rich_text: [{ type: 'text', text: { content: 'Commitments' } }],
            },
        },
        ...(commitments.length > 0
            ? commitments.map((c) => ({
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [
                        {
                            type: 'text',
                            text: {
                                content: `${c.text}${c.ownerEmail ? ` (${c.ownerEmail})` : ''}${c.dueDate ? ` — due ${c.dueDate.toLocaleDateString()}` : ''}`,
                            },
                        },
                    ],
                },
            }))
            : [
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ type: 'text', text: { content: 'No commitments recorded.' } }] },
                },
            ]),
        {
            object: 'block',
            type: 'heading_2',
            heading_2: {
                rich_text: [{ type: 'text', text: { content: 'Action Items' } }],
            },
        },
        ...(actionItems.length > 0
            ? actionItems.map((a) => ({
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [
                        {
                            type: 'text',
                            text: {
                                content: `${a.text}${a.assigneeEmail ? ` (${a.assigneeEmail})` : ''}`,
                            },
                        },
                    ],
                },
            }))
            : [
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ type: 'text', text: { content: 'No action items recorded.' } }] },
                },
            ]),
    ]

    return blocks
}

// ─────────────────────────────────────────────────────────────────────────────
// NotionProvider
// ─────────────────────────────────────────────────────────────────────────────

export class NotionProvider implements IntegrationProvider {

    // ── SharedInterface: OAuth exchange ──────────────────────────────────────
    // Notion uses HTTP Basic auth for token exchange.
    // Workspace metadata is returned inline — no follow-up call needed.
    // User directory is fetched ONCE at connect-time and stored in metadata.

    async exchangeCodeForTokens(code: string): Promise<ProviderTokenResponse> {
        const config = OAUTH_CONFIGS.NOTION!
        const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

        const tokenRes = await axios.post(
            config.tokenUrl,
            {
                grant_type: 'authorization_code',
                code,
                redirect_uri: config.callbackUrl,
            },
            {
                headers: {
                    Authorization: `Basic ${credentials}`,
                    'Content-Type': 'application/json',
                },
                timeout: 10_000,
            }
        )

        const data = tokenRes.data
        const accessToken: string = data.access_token
        const workspaceId: string = data.workspace_id
        const workspaceName: string = data.workspace_name || ''
        const workspaceIcon: string | undefined = data.workspace_icon || undefined

        // Fetch full workspace user directory at connect-time (ONCE)
        let userDirectory: NotionUser[] = []
        try {
            const notionClient = buildNotionClient(accessToken)
            const usersRes = await notionClient.get('/users')
            userDirectory = (usersRes.data.results || []).map((u: any) => ({
                id: u.id,
                name: u.name || '',
                email: u.person?.email || undefined,
                avatarUrl: u.avatar_url || undefined,
            }))
        } catch (err: any) {
            logger.warn({ error: err.message }, 'Notion: failed to fetch user directory at connect-time (non-fatal)')
        }

        return {
            accessToken,
            // Notion does not provide a refresh token in the standard flow
            refreshToken: undefined,
            expiresIn: undefined,
            workspaceMeta: {
                id: workspaceId,
                name: workspaceName,
                url: undefined,
                extra: {
                    botId: data.bot_id,
                    workspaceIcon,
                    userDirectory,
                },
            },
        }
    }

    async refreshAccessToken(
        _refreshTokenEnc: string
    ): Promise<Omit<ProviderTokenResponse, 'workspaceMeta'>> {
        // Notion tokens do not expire (similar to Slack bot tokens).
        // This is a documented NO-OP satisfying the shared interface contract.
        return {
            accessToken: _refreshTokenEnc,
            refreshToken: undefined,
            expiresIn: undefined,
        }
    }

    // ── SharedInterface: testConnection ──────────────────────────────────────

    async testConnection(integration: TeamIntegration): Promise<ProviderTestResult> {
        try {
            const accessToken = decrypt(integration.accessTokenEnc)
            const client = buildNotionClient(accessToken)
            await client.get('/users/me')
            return { healthy: true, workspaceName: integration.workspaceName || undefined }
        } catch (err: any) {
            logger.warn({ integrationId: integration.id, error: err.message }, 'Notion testConnection failed')
            return { healthy: false }
        }
    }

    // ── SharedInterface: revokeToken — best-effort ────────────────────────────

    async revokeToken(integration: TeamIntegration): Promise<void> {
        // Notion does not provide a REST token revocation endpoint.
        logger.info({ integrationId: integration.id }, 'Notion revokeToken: no-op (no revocation endpoint)')
    }

    // ── Notion-specific: createMeetingPage ────────────────────────────────────
    // Assignee resolution uses cached userDirectory — ZERO live API calls.

    async createMeetingPage(
        integration: TeamIntegration,
        meeting: {
            id: string
            title: string
            scheduledAt?: Date | null
        },
        summary: {
            commitments: Array<{ text: string; ownerEmail?: string | null; dueDate?: Date | null }>
            actionItems: Array<{ text: string; assigneeEmail?: string | null }>
        }
    ): Promise<NotionCreatePageResult> {
        const accessToken = decrypt(integration.accessTokenEnc)
        const client = buildNotionClient(accessToken)
        const meta = integration.metadata as any

        const databaseId: string = meta?.databaseId
        if (!databaseId) {
            throw new Error('Notion integration missing databaseId in metadata')
        }

        // Resolve assignees from cached userDirectory — zero network calls
        const userDirectory: NotionUser[] = meta?.extra?.userDirectory || []
        const resolvedAssignees = summary.commitments
            .filter(c => c.ownerEmail)
            .map(c => userDirectory.find(u => u.email === c.ownerEmail))
            .filter(Boolean)
            .map(u => ({ object: 'user', id: u!.id }))

        const blocks = buildNotionBlocks(summary.commitments, summary.actionItems)

        const pageRes = await client.post('/pages', {
            parent: { database_id: databaseId },
            properties: {
                Name: {
                    title: [{ text: { content: meeting.title.substring(0, 2000) } }],
                },
                Status: {
                    select: { name: 'Not Started' },
                },
                ...(meeting.scheduledAt
                    ? {
                        'Due Date': {
                            date: { start: meeting.scheduledAt.toISOString().split('T')[0] },
                        },
                    }
                    : {}),
                ...(resolvedAssignees.length > 0
                    ? { Assignee: { people: resolvedAssignees } }
                    : {}),
            },
            children: blocks,
        })

        const pageId: string = pageRes.data.id
        const pageUrl: string = pageRes.data.url

        logger.info({ integrationId: integration.id, meetingId: meeting.id, pageId }, 'Notion: page created')
        return { pageId, pageUrl }
    }
}

export const notionProvider = new NotionProvider()
