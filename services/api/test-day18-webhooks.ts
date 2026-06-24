import 'dotenv/config'
import { createHmac } from 'crypto'
import request from 'supertest'
import app from './src/app'
import { prisma } from './src/db/client'
import { redis } from './src/config/redis'
import { transcribeQueue, extractQueue, notifyQueue } from './src/queues/queue.client'

const TEST_SECRET = 'test_secret'
process.env.RECALL_WEBHOOK_SECRET = TEST_SECRET
// Mock MongoDB URI if it's missing
if (!process.env.MONGODB_URL && !process.env.MONGODB_URI) {
    process.env.MONGODB_URL = 'mongodb://localhost:27017/vocaply_test'
}

function generateSignature(bodyString: string): string {
    const rawBody = Buffer.from(bodyString)
    const expected = createHmac('sha256', TEST_SECRET)
        .update(rawBody)
        .digest('hex')
    return `sha256=${expected}`
}

async function runTests() {
    console.log('🧪 Starting Day 18 E2E Webhooks & Queues Test...')

    // 1. Setup mock team and meeting
    const team = await prisma.team.create({
        data: { name: 'Test Team Day 18', plan: 'FREE', stripeCustomerId: 'cus_test18_' + Date.now(), slug: 'test-team-day-18-' + Date.now() }
    })
    
    const botId = 'bot_test_' + Date.now()
    const meeting = await prisma.meeting.create({
        data: {
            teamId: team.id,
            title: 'Test Meeting',
            platform: 'ZOOM',
            meetingUrl: 'https://zoom.us/j/123456789',
            recallBotId: botId,
            status: 'RECORDING',
            startedAt: new Date(),
            scheduledAt: new Date()
        }
    })

    console.log(`✅ Created Mock Meeting: ${meeting.id}`)

    // 2. Clear queues & redis idempotency keys
    await transcribeQueue.drain()
    await extractQueue.drain()
    await notifyQueue.drain()
    await redis.del(`webhook:processed:recall:${botId}:bot.done`)

    const payload = {
        event: 'bot.done',
        data: {
            bot_id: botId,
            transcript: [
                { speaker_tag: 'Speaker 1', text: 'Hello world', start_time: 0, end_time: 2 }
            ]
        }
    }

    const bodyString = JSON.stringify(payload)
    const signature = generateSignature(bodyString)

    // 3. Test Invalid Signature
    console.log('🔄 Testing Invalid Signature...')
    const resInvalid = await request(app)
        .post('/webhooks/recall')
        .set('x-recall-signature', 'sha256=invalid')
        .set('Content-Type', 'application/json')
        .send(bodyString)
    
    if (resInvalid.status === 400) {
        console.log('✅ Invalid signature rejected correctly (400)')
    } else {
        console.error('❌ Invalid signature bypass! Status:', resInvalid.status)
        process.exit(1)
    }

    // 4. Test Valid Signature & Queue dispatch
    console.log('🔄 Testing Valid bot.done event...')
    const resValid = await request(app)
        .post('/webhooks/recall')
        .set('x-recall-signature', signature)
        .set('Content-Type', 'application/json')
        .send(bodyString)

    if (resValid.status === 200) {
        console.log('✅ Webhook acknowledged immediately (200 OK)')
    } else {
        console.error('❌ Webhook failed! Status:', resValid.status, resValid.body)
        process.exit(1)
    }

    await new Promise(resolve => setTimeout(resolve, 500))
    const intermediateMeeting = await prisma.meeting.findUnique({ where: { id: meeting.id } })
    console.log('🔍 Meeting status right after webhook:', intermediateMeeting?.status)

    // 5. Test Idempotency
    console.log('🔄 Testing Idempotency (Sending duplicate event)...')
    const resDuplicate = await request(app)
        .post('/webhooks/recall')
        .set('x-recall-signature', signature)
        .set('Content-Type', 'application/json')
        .send(bodyString)

    if (resDuplicate.status === 200) {
        console.log('✅ Duplicate event accepted but will be skipped internally (200 OK)')
    }

    // Wait for the workers to process (transcribe → extract chain needs more time)
    console.log('⏳ Waiting for workers to process queues (up to 15s)...')
    let updatedMeeting = null
    for (let i = 0; i < 8; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        updatedMeeting = await prisma.meeting.findUnique({ where: { id: meeting.id } })
        if (updatedMeeting?.status === 'DONE') break
        console.log(`   ⏳ Status still: ${updatedMeeting?.status} (attempt ${i + 1}/8)...`)
    }

    // 6. Check Meeting Status
    if (updatedMeeting?.status === 'DONE') {
        console.log('✅ Workers processed the transcript successfully! Status is DONE.')
        console.log('✅ Mongo Transcript ID:', updatedMeeting.mongoTranscriptId)
    } else {
        console.error('❌ Meeting status is NOT DONE. Current status:', updatedMeeting?.status)
        console.error('   This may mean the worker process is not running. Start it with: npm run worker')
    }

    // Cleanup
    console.log('🧹 Cleaning up test data...')
    await prisma.meeting.delete({ where: { id: meeting.id } })
    await prisma.team.delete({ where: { id: team.id } })
    
    // Also disconnect Redis and Prisma so script can exit
    await redis.quit()
    await prisma.$disconnect()

    console.log('🎉 Test Completed!')
    process.exit(updatedMeeting?.status === 'DONE' ? 0 : 1)
}

runTests().catch((e) => {
    console.error('❌ Test crashed:', e)
    process.exit(1)
})
