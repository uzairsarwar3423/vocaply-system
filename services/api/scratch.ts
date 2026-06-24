import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'

const prisma = new PrismaClient()
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

async function main() {
  const meetings = await prisma.meeting.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  })
  console.log('Recent meetings:')
  console.table(meetings.map(m => ({ id: m.id, status: m.status, botId: m.recallBotId })))

  if (meetings.length > 0) {
    const keys = await redis.keys(`webhook:processed:recall:${meetings[0].recallBotId}:*`)
    console.log('Redis keys for recent bot:', keys)
  }

  await prisma.$disconnect()
  redis.disconnect()
}

main().catch(console.error)
