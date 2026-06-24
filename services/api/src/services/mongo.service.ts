import { MongoClient, ObjectId } from 'mongodb'

let client: MongoClient | null = null;
let db: any = null;

async function init() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URL || process.env.MONGODB_URI!)
    await client.connect()
    db = client.db('vocaply')
  }
}

export const mongoService = {
  async storeTranscript(data: any): Promise<string> {
    await init()
    const result = await db.collection('transcripts').insertOne(data)
    return result.insertedId.toString()
  },

  async findTranscript(id: string): Promise<any> {
    await init()
    return db.collection('transcripts').findOne({ _id: new ObjectId(id) })
  },

  async getTranscript(id: string, filters?: any): Promise<any> {
    return this.findTranscript(id)
  },

  async deleteTranscript(id: string): Promise<void> {
    await init()
    await db.collection('transcripts').deleteOne({ _id: new ObjectId(id) })
  },

  async updateTranscript(id: string, data: any): Promise<void> {
    await init()
    await db.collection('transcripts').updateOne(
      { _id: new ObjectId(id) },
      { $set: data }
    )
  }
}
