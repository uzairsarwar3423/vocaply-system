import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.user.deleteMany({
    where: { email: 'uzairsarwar3423@gmail.com' }
  });
  console.log('User deleted');
}
main().catch(console.error).finally(() => prisma.$disconnect());
