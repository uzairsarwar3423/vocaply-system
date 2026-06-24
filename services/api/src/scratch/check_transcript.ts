import { PrismaClient } from '@prisma/client';
import { getTranscript, getBotStatus } from '../services/recall.service';

const prisma = new PrismaClient();

async function main() {
  const meeting = await prisma.meeting.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  console.log("Latest Meeting:", meeting?.id, "Bot:", meeting?.recallBotId);
  
  if (meeting?.recallBotId) {
    const status = await getBotStatus(meeting.recallBotId);
    console.log("Bot Status:", JSON.stringify(status, null, 2));
    
    const transcript = await getTranscript(meeting.recallBotId);
    console.log("Transcript length:", transcript?.length);
    if (transcript?.length) {
      console.log("First 2 segments:", JSON.stringify(transcript.slice(0, 2), null, 2));
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
