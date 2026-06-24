import { MongoClient, Db } from 'mongodb'

let client: MongoClient
let db: Db

export async function connectMongoDB(): Promise<Db> {
    if (db) return db
    client = new MongoClient(process.env.MONGODB_URL!)
    await client.connect()
    db = client.db('vocaply')
    return db
}

export function getMongoDB(): Db {
    if (!db) throw new Error('MongoDB not connected. Call connectMongoDB() first.')
    return db
}