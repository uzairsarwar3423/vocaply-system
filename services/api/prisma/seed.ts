import { PrismaClient, PlanType, UserRole, PlatformType, MeetingStatus, CommitmentStatus, PriorityLevel } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
})

// Bcrypt hash for 'Test@1234'
const PASSWORD_HASH = '$2b$12$G5bf48c3FycGcm3ldP2I4uZF0KfSYMWG4qssCFObfaPVLLjUPSvUu'

async function main() {
  console.log('🌱 Starting seed database...')

  // Clean existing data
  await prisma.actionItem.deleteMany()
  await prisma.commitment.deleteMany()
  await prisma.meetingParticipant.deleteMany()
  await prisma.meeting.deleteMany()
  await prisma.user.deleteMany()
  await prisma.team.deleteMany()

  console.log('🧹 Cleaned existing database tables.')

  // 1. Create Team
  const team = await prisma.team.create({
    data: {
      name: 'TechFlow Engineering',
      slug: 'techflow-eng',
      plan: PlanType.GROWTH,
      settings: {},
    },
  })
  console.log(`🏢 Created Team: ${team.name} (${team.id})`)

  // 2. Create Users
  const ali = await prisma.user.create({
    data: {
      email: 'ali@techflow.eng',
      name: 'Ali',
      passwordHash: PASSWORD_HASH,
      role: UserRole.MANAGER,
      teamId: team.id,
      emailVerified: true,
      onboardingCompleted: true,
    },
  })

  const sara = await prisma.user.create({
    data: {
      email: 'sara@techflow.eng',
      name: 'Sara',
      passwordHash: PASSWORD_HASH,
      role: UserRole.MEMBER,
      teamId: team.id,
      emailVerified: true,
      onboardingCompleted: true,
    },
  })

  const ahmed = await prisma.user.create({
    data: {
      email: 'ahmed@techflow.eng',
      name: 'Ahmed',
      passwordHash: PASSWORD_HASH,
      role: UserRole.MEMBER,
      teamId: team.id,
      emailVerified: true,
      onboardingCompleted: true,
    },
  })

  console.log('👥 Created Users: Ali (MANAGER), Sara (MEMBER), Ahmed (MEMBER)')

  // 3. Create Meetings
  const now = new Date()

  const mondayStandup = await prisma.meeting.create({
    data: {
      teamId: team.id,
      title: 'Monday Standup',
      platform: PlatformType.GOOGLE_MEET,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      status: MeetingStatus.DONE,
      scheduledAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      startedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      endedAt: new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000) + 30 * 60 * 1000),
      durationMinutes: 30,
    },
  })

  const sprintReview = await prisma.meeting.create({
    data: {
      teamId: team.id,
      title: 'Sprint Review',
      platform: PlatformType.ZOOM,
      meetingUrl: 'https://zoom.us/j/1234567890',
      status: MeetingStatus.DONE,
      scheduledAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      startedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      endedAt: new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000) + 60 * 60 * 1000),
      durationMinutes: 60,
    },
  })

  const wednesdayStandup = await prisma.meeting.create({
    data: {
      teamId: team.id,
      title: 'Wednesday Standup',
      platform: PlatformType.GOOGLE_MEET,
      meetingUrl: 'https://meet.google.com/xyz-pdq-rst',
      status: MeetingStatus.SCHEDULED,
      scheduledAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
    },
  })

  console.log('📅 Created 3 Meetings: Monday Standup, Sprint Review, Wednesday Standup')

  // 4. Create Commitments
  const commitments = await prisma.commitment.createMany({
    data: [
      {
        teamId: team.id,
        meetingId: mondayStandup.id,
        ownerId: ali.id,
        text: 'Ali will finish the schema migration by tonight',
        status: CommitmentStatus.FULFILLED,
        dueDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        resolvedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        confidenceScore: 0.95,
      },
      {
        teamId: team.id,
        meetingId: mondayStandup.id,
        ownerId: sara.id,
        text: 'Sara will prepare the presentation slides',
        status: CommitmentStatus.PENDING,
        dueDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        confidenceScore: 0.88,
      },
      {
        teamId: team.id,
        meetingId: mondayStandup.id,
        ownerId: ahmed.id,
        text: 'Ahmed will deploy the container to ECS',
        status: CommitmentStatus.MISSED,
        dueDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        confidenceScore: 0.91,
      },
      {
        teamId: team.id,
        meetingId: sprintReview.id,
        ownerId: sara.id,
        text: 'Sara will write tests for authentication module',
        status: CommitmentStatus.PENDING,
        dueDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        confidenceScore: 0.85,
      },
      {
        teamId: team.id,
        meetingId: sprintReview.id,
        ownerId: ali.id,
        text: 'Ali will review the PR from Sara',
        status: CommitmentStatus.FULFILLED,
        dueDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        resolvedAt: new Date(now.getTime()),
        confidenceScore: 0.99,
      },
      {
        teamId: team.id,
        meetingId: sprintReview.id,
        ownerId: ahmed.id,
        text: 'Ahmed will check the server log files for error rate spikes',
        status: CommitmentStatus.DEFERRED,
        dueDate: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
        confidenceScore: 0.82,
      },
    ],
  })

  console.log(`🤝 Created ${commitments.count} Commitments`)

  // 5. Create Action Items
  const actionItems = await prisma.actionItem.createMany({
    data: [
      {
        teamId: team.id,
        meetingId: mondayStandup.id,
        assigneeId: ali.id,
        text: 'Setup prisma schema',
        completed: true,
        completedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        priority: PriorityLevel.HIGH,
      },
      {
        teamId: team.id,
        meetingId: mondayStandup.id,
        assigneeId: sara.id,
        text: 'Create MongoDB/Redis configs',
        completed: true,
        completedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        priority: PriorityLevel.MEDIUM,
      },
      {
        teamId: team.id,
        meetingId: sprintReview.id,
        assigneeId: ahmed.id,
        text: 'Verify database connections in test environment',
        completed: false,
        priority: PriorityLevel.HIGH,
      },
      {
        teamId: team.id,
        meetingId: sprintReview.id,
        assigneeId: ali.id,
        text: 'Write dev data seed script',
        completed: false,
        priority: PriorityLevel.MEDIUM,
      },
    ],
  })

  console.log(`✅ Created ${actionItems.count} Action Items`)
  console.log('🎉 Database seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
