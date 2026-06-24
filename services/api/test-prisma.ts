import { prisma } from './src/db/client';

async function run() {
  const user = await prisma.user.findFirst({
    where: { email: 'uzairsarwarofficial123@gmail.com' }
  });
  console.log('User from DB:', user?.email, 'Role:', user?.role, 'Team:', user?.teamId);
}
run().catch(console.error).finally(() => prisma.$disconnect());
