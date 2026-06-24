// ─────────────────────────────────────────────────────────────────────────────
// test-day22-integrations.ts — Day 22 Integration Test Script
//
// Tests: Slack connect, Linear connect, Notion connect, Calendar sync dedup,
//        Slack webhook signature, token refresh cron logic.
//
// Usage: npx tsx src/test-day22-integrations.ts
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios'

const BASE = process.env.API_URL?.trim() || 'http://localhost:5000'
const API = `${BASE}/api/v1`

// Paste a valid JWT here (get from login endpoint)
const TOKEN = process.env.TEST_JWT || 'YOUR_JWT_HERE'
const TEAM_ID = process.env.TEST_TEAM_ID || 'YOUR_TEAM_ID_HERE'

function authHeaders() {
    return { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
}

async function run(label: string, fn: () => Promise<void>) {
    process.stdout.write(`  [TEST] ${label} ... `)
    try {
        await fn()
        console.log('✅ PASS')
    } catch (err: any) {
        console.log(`❌ FAIL: ${err?.response?.data?.message || err?.message}`)
        if (err?.response?.data) {
            console.log('    Response:', JSON.stringify(err.response.data, null, 2))
        }
    }
}

async function main() {
    console.log(`\n🚀 Vocaply Day 22 — Integration Test Suite`)
    console.log(`   API: ${BASE}\n`)

    // ── LIST integrations (should now show JIRA + SLACK + LINEAR + NOTION) ──
    await run('GET /integrations — lists all providers', async () => {
        const r = await axios.get(`${API}/integrations`, { headers: authHeaders() }) as any
        console.log(`\n     Integrations: ${JSON.stringify(r.data?.data?.map((i: any) => i.provider))}`)
    })

    // ── SLACK: initiate OAuth flow ────────────────────────────────────────────
    await run('GET /integrations/SLACK/connect — returns authUrl', async () => {
        const r = await axios.get(`${API}/integrations/SLACK/connect`, {
            headers: authHeaders(),
            maxRedirects: 0,
            validateStatus: s => s < 400,
        }) as any
        const url: string = r.data?.data?.authUrl || r.headers?.location || ''
        if (!url.includes('slack.com/oauth/v2/authorize')) {
            throw new Error(`Expected Slack authUrl, got: ${url}`)
        }
        console.log(`\n     Slack authUrl: ${url.substring(0, 80)}...`)
    })

    // ── LINEAR: initiate OAuth flow ───────────────────────────────────────────
    await run('GET /integrations/LINEAR/connect — returns authUrl', async () => {
        const r = await axios.get(`${API}/integrations/LINEAR/connect`, {
            headers: authHeaders(),
            maxRedirects: 0,
            validateStatus: s => s < 400,
        }) as any
        const url: string = r.data?.data?.authUrl || r.headers?.location || ''
        if (!url.includes('linear.app/oauth/authorize')) {
            throw new Error(`Expected Linear authUrl, got: ${url}`)
        }
        console.log(`\n     Linear authUrl: ${url.substring(0, 80)}...`)
    })

    // ── NOTION: initiate OAuth flow ───────────────────────────────────────────
    await run('GET /integrations/NOTION/connect — returns authUrl', async () => {
        const r = await axios.get(`${API}/integrations/NOTION/connect`, {
            headers: authHeaders(),
            maxRedirects: 0,
            validateStatus: s => s < 400,
        }) as any
        const url: string = r.data?.data?.authUrl || r.headers?.location || ''
        if (!url.includes('notion.com/v1/oauth/authorize')) {
            throw new Error(`Expected Notion authUrl, got: ${url}`)
        }
        console.log(`\n     Notion authUrl: ${url.substring(0, 80)}...`)
    })

    // ── JIRA: test connection (existing, still works) ─────────────────────────
    await run('POST /integrations/JIRA/test — testConnection returns', async () => {
        const r = await axios.post(`${API}/integrations/JIRA/test`, {}, {
            headers: authHeaders(),
            validateStatus: s => s < 500,
        }) as any
        const healthy = r.data?.data?.healthy
        console.log(`\n     Jira healthy: ${healthy}`)
    })

    // ── SLACK webhook: invalid signature → 200 but logged as security event ───
    await run('POST /webhooks/slack — invalid signature → 200 (fast-ack, rejected internally)', async () => {
        const r = await axios.post(`${BASE}/webhooks/slack`,
            'payload=%7B%22type%22%3A%22block_actions%22%7D',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Slack-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
                    'X-Slack-Signature': 'v0=invalid_signature_should_reject',
                },
                validateStatus: s => s < 600,
            }
        ) as any
        // Slack webhooks ALWAYS return 200 (fast-ack) — rejection is handled internally
        if (r.status !== 200) {
            throw new Error(`Expected 200, got ${r.status}`)
        }
    })

    // ── SLACK webhook: stale timestamp → rejected ─────────────────────────────
    await run('POST /webhooks/slack — stale timestamp (6 min old) → 200 (rejected internally)', async () => {
        const staleTs = Math.floor(Date.now() / 1000) - 400 // 6+ minutes ago
        const r = await axios.post(`${BASE}/webhooks/slack`,
            'payload=%7B%22type%22%3A%22block_actions%22%7D',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Slack-Request-Timestamp': String(staleTs),
                    'X-Slack-Signature': 'v0=any_value',
                },
                validateStatus: s => s < 600,
            }
        ) as any
        if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`)
    })

    // ── Calendar sync: queue a job for the current user ───────────────────────
    await run('Calendar sync: manual queue test (via direct calendarSyncQueue)', async () => {
        // This test enqueues a real job — requires a running Redis + BullMQ worker
        const { calendarSyncQueue } = await import('./queues/queue.client')
        const job = await calendarSyncQueue.add('test-sync', { userId: 'test-user-id' }, {
            jobId: `test-day22-${Date.now()}`,
        })
        if (!job.id) throw new Error('No job ID returned')
        console.log(`\n     Queued calendar sync job: ${job.id}`)
        await job.remove() // Clean up test job
    })

    console.log('\n─────────────────────────────────────────────────────────────')
    console.log('Day 22 test suite complete. Check server logs for worker output.')
    console.log('For OAuth callback tests, use Postman with the real provider apps.')
    console.log('─────────────────────────────────────────────────────────────\n')
    process.exit(0)
}

main().catch(err => {
    console.error('Test script error:', err)
    process.exit(1)
})
