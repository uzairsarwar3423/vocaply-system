import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const meetings = await prisma.meeting.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, title: true, status: true, recallBotId: true, createdAt: true }
  })
  console.log('Most recent 5 meetings:')
  console.table(meetings)

  const specificMeeting = await prisma.meeting.findUnique({
    where: { id: 'cmq9k8bjh0008h2wv3qusosyn' },
    select: { id: true, status: true, title: true }
  })
  console.log('\nSpecific meeting (from logs):', specificMeeting)

  await prisma.$disconnect()
}

main().catch(console.error)
