import { MongoClient } from 'mongodb';
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db('vocaply');
  
  const transcript = await db.collection('transcripts').findOne({ "raw_transcript": { $exists: true, $ne: [] } }, { sort: { _id: -1 } });
  
  if (transcript) {
    console.log(JSON.stringify(transcript.normalized_transcript.slice(0, 5), null, 2));
  }
  await client.close();
}
run();
