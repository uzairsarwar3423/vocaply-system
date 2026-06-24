const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const meetings = await prisma.meeting.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  console.log("Recent meetings:");
  console.log(meetings);
}
main().catch(console.error).finally(() => prisma.$disconnect());
