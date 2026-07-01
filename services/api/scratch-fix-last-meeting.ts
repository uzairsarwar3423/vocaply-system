import { MongoClient } from 'mongodb';
import axios from 'axios';
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db('vocaply');
  
  const transcript = await db.collection('transcripts').findOne({ "raw_transcript": { $exists: true, $ne: [] } }, { sort: { _id: -1 } });
  
  if (transcript) {
    console.log(`Rerunning pipeline for meeting ${transcript.meeting_id}...`);
    try {
      const response = await axios.post("http://localhost:8001/api/v1/transcripts/cleanup", {
        meeting_id: transcript.meeting_id,
        team_id: transcript.team_id,
        raw_transcript: transcript.raw_transcript,
        participants: {}
      }, {
        headers: {
          'X-Internal-Service-Key': process.env.INTERNAL_API_SECRET
        }
      });
      
      const cleaned = response.data.cleaned_transcript;
      console.log(`Pipeline returned ${cleaned.length} turns.`);
      
      await db.collection('transcripts').updateOne(
        { _id: transcript._id },
        { $set: { normalized_transcript: cleaned, processing_status: 'DONE' } }
      );
      
      console.log("Successfully updated MongoDB!");
    } catch (err: any) {
      console.error("Error calling pipeline:", err.response?.data || err.message);
    }
  } else {
    console.log('No transcripts found');
  }
  await client.close();
}
run();
