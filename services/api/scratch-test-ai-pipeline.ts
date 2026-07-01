import { MongoClient } from 'mongodb';
import axios from 'axios';
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db('vocaply');
  
  const transcript = await db.collection('transcripts').findOne({ "raw_transcript": { $exists: true, $ne: [] } }, { sort: { _id: -1 } });
  
  if (transcript) {
    try {
      const response = await axios.post("http://localhost:8001/api/v1/transcripts/cleanup", {
        meeting_id: transcript.meetingId,
        team_id: "test-team-123",
        raw_transcript: transcript.raw_transcript,
        participants: {}
      }, {
        headers: {
          'X-Internal-Service-Key': process.env.INTERNAL_API_SECRET
        }
      });
      console.log("Success:", response.status);
    } catch (err: any) {
      const errors = err.response?.data?.detail || [];
      errors.forEach((e: any) => {
         console.log(e.loc.join(" -> "), ":", e.msg);
      });
    }
  } else {
    console.log('No transcripts found');
  }
  await client.close();
}
run();
