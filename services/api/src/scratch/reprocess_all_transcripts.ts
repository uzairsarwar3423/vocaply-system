import "dotenv/config"
import { mongoService } from "../services/mongo.service"
import { prisma } from "../db/client"

async function main() {
  console.log("Reprocessing all transcripts in MongoDB to enrich speaker names...")
  try {
    // 1. Get all meetings that have a transcript
    const meetings = await prisma.meeting.findMany({
      where: {
        mongoTranscriptId: { not: null },
      },
    })

    console.log(`Found ${meetings.length} meetings with transcript IDs.`)

    for (const m of meetings) {
      const transcriptId = m.mongoTranscriptId!
      console.log(`Processing meeting: "${m.title}" (ID: ${m.id}) -> Transcript ID: ${transcriptId}`)

      const transcript = await mongoService.findTranscript(transcriptId)
      if (!transcript) {
        console.log(`⚠️ Transcript not found in MongoDB for ID: ${transcriptId}`)
        continue
      }

      // Fetch participants for this meeting
      const participants = await prisma.meetingParticipant.findMany({
        where: { meetingId: m.id },
      })

      const speakerMap: Record<string, { userId?: string; name: string; email?: string }> = {}
      const nameMap: Record<string, { userId?: string; name: string; email?: string }> = {}

      for (const p of participants) {
        const info = {
          userId: p.userId ?? undefined,
          name:   p.name,
          email:  p.email ?? undefined,
        }
        if (p.speakerTag) {
          speakerMap[p.speakerTag.toLowerCase()] = info
        }
        if (p.name) {
          nameMap[p.name.toLowerCase()] = info
        }
        if (p.email) {
          nameMap[p.email.toLowerCase()] = info
        }
      }

      // Enrich raw transcript
      const rawTranscript = Array.isArray(transcript.raw_transcript) ? transcript.raw_transcript : []
      const enrichedTurns = rawTranscript.map((turn: any) => {
        let key = ""
        if (turn.speaker_tag) {
          key = turn.speaker_tag
        } else if (turn.participant?.name) {
          key = turn.participant.name
        } else if (turn.speaker_name) {
          key = turn.speaker_name
        } else if (typeof turn.speaker === "string") {
          key = turn.speaker
        }

        const match = speakerMap[key.toLowerCase()] || nameMap[key.toLowerCase()]

        return {
          ...turn,
          speaker_user_id: match?.userId ?? null,
          speaker_name:    match?.name ?? (key || "Unknown Speaker"),
          speaker_email:   match?.email ?? null,
        }
      })

      // Enrich normalized transcript
      const normalizedTranscript = Array.isArray(transcript.normalized_transcript) ? transcript.normalized_transcript : []
      const enrichedNormalizedTurns = normalizedTranscript.map((turn: any) => {
        const key = turn.speaker || ""
        const match = nameMap[key.toLowerCase()] || speakerMap[key.toLowerCase()]
        return {
          ...turn,
          speaker_user_id: match?.userId ?? null,
          speaker:         match?.name ?? (key || "Unknown Speaker"),
          speaker_email:   match?.email ?? null,
        }
      })

      // Build full text
      const fullText = enrichedNormalizedTurns
        .map((t: any) => `${t.speaker} [${formatTime(t.startTime || t.start_time || 0)}]: ${t.text || ""}`)
        .join('\n')

      await mongoService.updateTranscript(transcriptId, {
        raw_transcript:        enrichedTurns,
        normalized_transcript: enrichedNormalizedTurns,
        full_text:             fullText,
      })

      console.log(`✅ Successfully enriched transcript for: "${m.title}"`)
    }

    console.log("All transcripts reprocessed successfully!")
    process.exit(0)
  } catch (err: any) {
    console.error("❌ Reprocessing failed:", err)
    process.exit(1)
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

main()
