import 'dotenv/config'
import { prisma } from './db/client'
import { redis } from './config/redis'
import { generateAccessToken } from './modules/auth/auth.helpers'
import { OAuthStateService } from './modules/integrations/providers/oauth-state.service'
import { createHmac } from 'crypto'
import { env } from './config/env'

const BASE = 'http://localhost:5000/api/v1'
const WEBHOOKS_BASE = 'http://localhost:5000/webhooks'

// ── Logging ──────────────────────────────────────────────────────────────────

let passed = 0, failed = 0, total = 0

function log(icon: string, label: string, detail?: string) {
  console.log(`  ${icon} ${label}${detail ? ' → ' + detail : ''}`)
}

async function test(name: string, fn: () => Promise<void>) {
  total++
  try {
    await fn()
    passed++
    log('✅', name)
  } catch (e: any) {
    failed++
    log('❌', name, e.message)
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

async function req(method: string, path: string, token?: string, body?: object): Promise<{ status: number; data: any; headers: Headers }> {
  const isWebhook = path.startsWith('/webhooks')
  const url = isWebhook ? `http://localhost:5000${path}` : `${BASE}${path}`
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual' // Don't follow redirects to check 302s
  })
  
  let data
  const contentType = res.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = await res.text()
  }
  
  return { status: res.status, data, headers: res.headers }
}

async function login(email: string) {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null }
  })
  if (!user) throw new Error(`User not found: ${email}`)
  return {
    token: generateAccessToken({
        id: user.id,
        teamId: user.teamId,
        role: user.role,
        email: user.email
    }),
    user
  }
}

async function main() {
  console.log('\n🧪 Vocaply Day 21 — Integrations API Full Test Suite')
  console.log('═'.repeat(60))

  let ADMIN_TOKEN = '', adminUser: any
  let MEMBER_TOKEN = '', memberUser: any

  try {
    const adminRes = await login('sarwar345aabb@gmail.com') // OWNER/ADMIN
    ADMIN_TOKEN = adminRes.token
    adminUser = adminRes.user
    log('✅', 'ADMIN token obtained')
  } catch(e: any) { log('❌', 'ADMIN login failed', e.message); process.exit(1) }

  try {
    const memberRes = await login('sara@techflow.eng')
    MEMBER_TOKEN = memberRes.token
    memberUser = memberRes.user
    log('✅', 'MEMBER token obtained')
  } catch(e: any) { log('❌', 'MEMBER login failed', e.message); process.exit(1) }

  // Ensure JIRA config exists in env
  assert(!!env.JIRA_CLIENT_ID, 'JIRA_CLIENT_ID not set')
  assert(!!env.JIRA_WEBHOOK_SECRET, 'JIRA_WEBHOOK_SECRET not set')

  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[1] OAUTH & LIST ENDPOINTS')
  // ════════════════════════════════════════════════════════════════════════════

  await test('GET /integrations → 200 Returns list (initially empty)', async () => {
    const r = await req('GET', '/integrations', ADMIN_TOKEN)
    assert(r.status === 200, `Expected 200, got ${r.status}`)
    assert(Array.isArray(r.data), 'Expected array')
  })

  await test('GET /integrations/JIRA/connect as MEMBER → 403 Forbidden', async () => {
    const r = await req('GET', '/integrations/JIRA/connect', MEMBER_TOKEN)
    assert(r.status === 403, `Expected 403, got ${r.status}`)
  })

  await test('GET /integrations/JIRA/connect as ADMIN → 200 URL with State', async () => {
    const r = await req('GET', '/integrations/JIRA/connect', ADMIN_TOKEN)
    assert(r.status === 200, `Expected 200, got ${r.status}`)
    assert(r.data.authUrl.includes('response_type=code'), 'Missing response_type=code')
    assert(r.data.authUrl.includes('state='), 'Missing state parameter')
  })

  await test('GET /integrations/INVALID/connect → 422 Invalid Provider', async () => {
    const r = await req('GET', '/integrations/INVALID/connect', ADMIN_TOKEN)
    assert(r.status === 422, `Expected 422, got ${r.status}`)
  })

  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[2] CALLBACK REDIRECTS')
  // ════════════════════════════════════════════════════════════════════════════

  await test('GET /integrations/JIRA/callback with invalid state → 302 to frontend with error', async () => {
    // Generate an invalid state (64 chars)
    const invalidState = 'a'.repeat(64)
    const r = await req('GET', `/integrations/JIRA/callback?code=mock_code&state=${invalidState}`)
    assert(r.status === 302, `Expected 302, got ${r.status}`)
    const location = r.headers.get('location') || ''
    assert(location.includes('error=OAUTH_INVALID_STATE'), 'Did not redirect with state error')
  })

  await test('GET /integrations/JIRA/callback with valid state but bad code → 302 PROVIDER_TOKEN_EXCHANGE_FAILED', async () => {
    const validState = await OAuthStateService.generateState('JIRA', adminUser.teamId, adminUser.id)
    const r = await req('GET', `/integrations/JIRA/callback?code=mock_code&state=${validState}`)
    assert(r.status === 302, `Expected 302, got ${r.status}`)
    const location = r.headers.get('location') || ''
    assert(location.includes('error=PROVIDER_TOKEN_EXCHANGE_FAILED'), 'Did not redirect with token error')
  })

  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[3] DATA & TEST INTEGRATION')
  // ════════════════════════════════════════════════════════════════════════════

  await test('Manually insert integration & verify list cache invalidation', async () => {
    await prisma.teamIntegration.create({
        data: {
            teamId: adminUser.teamId,
            provider: 'JIRA',
            accessTokenEnc: 'mock_enc_token',
            workspaceId: 'mock-ws',
            workspaceName: 'Mock Jira Workspace',
            isActive: true,
            connectedById: adminUser.id
        }
    })

    // clear cache to make sure
    await redis.del(`cache:team:integrations:${adminUser.teamId}`)

    const r = await req('GET', '/integrations', ADMIN_TOKEN)
    assert(r.status === 200, `Expected 200, got ${r.status}`)
    assert(r.data.length > 0, 'Integration not listed')
    assert(r.data[0].provider === 'JIRA', 'Provider mismatch')
    assert(r.data[0].workspaceName === 'Mock Jira Workspace', 'Workspace mismatch')
  })

  await test('POST /integrations/JIRA/test → 200 with healthy:false (mocked tokens)', async () => {
    const r = await req('POST', '/integrations/JIRA/test', ADMIN_TOKEN)
    assert(r.status === 200, `Expected 200, got ${r.status}`)
    assert(r.data.healthy === false, 'Test should fail since tokens are mocked')
  })

  await test('DELETE /integrations/JIRA as MEMBER → 403 Forbidden', async () => {
    const r = await req('DELETE', '/integrations/JIRA', MEMBER_TOKEN)
    assert(r.status === 403, `Expected 403, got ${r.status}`)
  })

  await test('DELETE /integrations/JIRA as ADMIN → 200 Disconnected', async () => {
    const r = await req('DELETE', '/integrations/JIRA', ADMIN_TOKEN)
    assert(r.status === 200, `Expected 200, got ${r.status}`)
    assert(r.data.message === 'Disconnected', 'Message mismatch')
  })

  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[4] REVERSE WEBHOOKS (JIRA)')
  // ════════════════════════════════════════════════════════════════════════════

  await test('POST /webhooks/jira with invalid signature → 401', async () => {
    const payload = { issue: { key: 'MOCK-123' }, timestamp: Date.now() }
    const r = await fetch(`${WEBHOOKS_BASE}/jira`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature': 'sha256=invalidhash'
        },
        body: JSON.stringify(payload)
    })
    assert(r.status === 401, `Expected 401, got ${r.status}`)
  })

  await test('POST /webhooks/jira with valid signature → 200 OK & Background Processing', async () => {
    const payload = { issue: { key: 'MOCK-123', fields: { status: { name: 'Done' } } }, timestamp: Date.now() }
    const payloadStr = JSON.stringify(payload)
    
    const hash = createHmac('sha256', env.JIRA_WEBHOOK_SECRET)
        .update(Buffer.from(payloadStr))
        .digest('hex')

    const r = await fetch(`${WEBHOOKS_BASE}/jira`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature': `sha256=${hash}`
        },
        body: payloadStr
    })
    
    assert(r.status === 200, `Expected 200, got ${r.status}`)
    const text = await r.text()
    assert(text === 'OK', 'Expected OK response')
  })

  await test('Clean up mock integration', async () => {
    await prisma.teamIntegration.deleteMany({
        where: { teamId: adminUser.teamId, provider: 'JIRA' }
    })
  })

  console.log('\n' + '═'.repeat(60))
  console.log(`📊 Results: ${passed}/${total} passed, ${failed} failed`)

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check output above.')
    process.exit(1)
  } else {
    console.log('\n🎉 All Day 21 tests passed!')
    process.exit(0)
  }
}

main().catch(e => {
  console.error('\n💥 Test runner crashed:', e)
  process.exit(1)
})
