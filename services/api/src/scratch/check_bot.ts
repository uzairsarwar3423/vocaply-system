import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = new PrismaClient();
const RECALL_BASE_URL = 'https://ap-northeast-1.recall.ai/api/v1';

async function main() {
  const meeting = await prisma.meeting.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  console.log("Bot:", meeting?.recallBotId);
  if (!meeting?.recallBotId) return;

  const res = await fetch(`${RECALL_BASE_URL}/bot/${meeting.recallBotId}/`, {
    headers: { 'Authorization': `Token ${env.RECALL_API_KEY}` }
  });
  const bot = await res.json();
  console.log(JSON.stringify(bot, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
