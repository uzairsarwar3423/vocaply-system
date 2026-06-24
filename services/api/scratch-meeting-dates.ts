import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const meetings = await prisma.meeting.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, title: true, status: true, scheduledAt: true, createdAt: true, recallBotId: true }
  })
  console.log('Most recent 3 meetings:')
  console.table(meetings)

  await prisma.$disconnect()
}

main().catch(console.error)
