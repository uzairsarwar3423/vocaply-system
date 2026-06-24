import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.user.update({
    where: { email: 'testuzair1@example.com' },
    data: { emailVerified: true }
  });
  console.log('User verified');
}
main().catch(console.error).finally(() => prisma.$disconnect());
