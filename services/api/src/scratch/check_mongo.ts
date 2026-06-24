import "dotenv/config"
import { mongoService } from "../services/mongo.service"

async function main() {
  console.log("Checking MongoDB connection and fetching transcript...")
  try {
    const transcriptId = "6a3a2dd5baf3626794ce1ed6"
    const transcript = await mongoService.findTranscript(transcriptId)
    console.log("✅ MongoDB Connection Successful!")
    console.log("Fetched Transcript:", JSON.stringify(transcript, null, 2))
  } catch (err: any) {
    console.error("❌ MongoDB Query Failed:", err)
  }
}

main()
