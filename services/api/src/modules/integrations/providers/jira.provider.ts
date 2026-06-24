import axios from 'axios'
import { TeamIntegration } from '@prisma/client'
import { IntegrationProvider, ProviderTestResult } from './provider.interface'
import { ProviderTokenResponse, JiraCreateIssueResult } from '../integrations.types'
import { OAUTH_CONFIGS } from './oauth-config'
import { encrypt, decrypt } from '../../../utils/crypto'
import { logger } from '../../../config/logger'

export class JiraProvider implements IntegrationProvider {
    private async getAccessibleResources(accessToken: string) {
        const response = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        const resource = response.data[0]
        if (!resource) throw new Error('No accessible Jira resources found')
        return { id: resource.id, name: resource.name, url: resource.url }
    }

    async exchangeCodeForTokens(code: string): Promise<ProviderTokenResponse> {
        const config = OAUTH_CONFIGS.JIRA!
        
        const response = await axios.post(config.tokenUrl, {
            grant_type: 'authorization_code',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: config.callbackUrl,
        })

        const accessToken = response.data.access_token
        const refreshToken = response.data.refresh_token
        const expiresIn = response.data.expires_in

        const workspaceMeta = await this.getAccessibleResources(accessToken)

        return {
            accessToken,
            refreshToken,
            expiresIn,
            workspaceMeta,
        }
    }

    async refreshAccessToken(
        refreshTokenEnc: string
    ): Promise<Omit<ProviderTokenResponse, 'workspaceMeta'>> {
        const config = OAUTH_CONFIGS.JIRA!
        const refreshToken = decrypt(refreshTokenEnc)

        const response = await axios.post(config.tokenUrl, {
            grant_type: 'refresh_token',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: refreshToken,
        })

        return {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresIn: response.data.expires_in,
        }
    }

    async testConnection(integration: TeamIntegration): Promise<ProviderTestResult> {
        try {
            const accessToken = decrypt(integration.accessTokenEnc)
            await axios.get(`https://api.atlassian.com/ex/jira/${integration.workspaceId}/rest/api/3/myself`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 10000,
            })
            return { healthy: true, workspaceName: integration.workspaceName || undefined }
        } catch (error: any) {
            logger.warn({ integrationId: integration.id, error: error.message }, 'Jira testConnection failed')
            return { healthy: false }
        }
    }

    async revokeToken(integration: TeamIntegration): Promise<void> {
        // Best effort
        try {
            // Placeholder for token revocation if supported by Atlassian
        } catch (error) {
            logger.warn({ error }, 'Failed to revoke Jira token')
        }
    }

    async createIssue(integration: TeamIntegration, actionItem: any): Promise<JiraCreateIssueResult> {
        const accessToken = decrypt(integration.accessTokenEnc)
        const baseUrl = `https://api.atlassian.com/ex/jira/${integration.workspaceId}/rest/api/3`
        
        let accountId: string | null = null
        if (actionItem.assignee?.email) {
            try {
                const searchRes = await axios.get(`${baseUrl}/user/search`, {
                    params: { query: actionItem.assignee.email },
                    headers: { Authorization: `Bearer ${accessToken}` }
                })
                if (searchRes.data && searchRes.data.length > 0) {
                    accountId = searchRes.data[0].accountId
                }
            } catch (err) {
                logger.warn('Jira user lookup failed, proceeding unassigned')
            }
        }

        let priorityName = 'Medium'
        switch(actionItem.priority) {
            case 'LOW': priorityName = 'Low'; break;
            case 'HIGH': priorityName = 'High'; break;
            case 'URGENT': priorityName = 'Highest'; break;
        }

        const projectKey = (integration.metadata as any)?.projectKey || 'PROJ'

        const issuePayload = {
            fields: {
                project: { key: projectKey },
                summary: actionItem.text.substring(0, 255),
                description: {
                    type: 'doc',
                    version: 1,
                    content: [
                        { type: 'paragraph', content: [{ type: 'text', text: actionItem.text }] }
                    ]
                },
                issuetype: { name: 'Task' },
                priority: { name: priorityName },
                ...(accountId ? { assignee: { id: accountId } } : {}),
            }
        }

        const res = await axios.post(`${baseUrl}/issue`, issuePayload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        })

        return {
            issueId: res.data.id,
            issueKey: res.data.key,
            issueUrl: `${integration.workspaceUrl}/browse/${res.data.key}`
        }
    }

    async updateIssueStatus(integration: TeamIntegration, issueKey: string, completed: boolean) {
        if (!completed) return { statusUpdated: false }

        const accessToken = decrypt(integration.accessTokenEnc)
        const baseUrl = `https://api.atlassian.com/ex/jira/${integration.workspaceId}/rest/api/3`

        const transitionsRes = await axios.get(`${baseUrl}/issue/${issueKey}/transitions`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        })

        const doneTransition = transitionsRes.data.transitions.find((t: any) => 
            t.name.toLowerCase().includes('done')
        )

        if (!doneTransition) {
            logger.warn({ issueKey }, 'No "done" transition found for Jira issue')
            return { statusUpdated: false }
        }

        await axios.post(`${baseUrl}/issue/${issueKey}/transitions`, {
            transition: { id: doneTransition.id }
        }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        })

        return { statusUpdated: true }
    }
}

export const jiraProvider = new JiraProvider()
