import { PrismaClient } from '@prisma/client'
import { redis } from './config/redis'
import { connectMongoDB } from './db/mongo.client'

const directPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL
    }
  }
})

async function run() {
  console.log('Testing Postgres (DIRECT)...')
  try {
    await directPrisma.$queryRaw`SELECT 1`
    console.log('Postgres (DIRECT) OK')
  } catch (err) {
    console.error('Postgres (DIRECT) error:', err)
  }

  console.log('Testing Mongo...')
  try {
    await connectMongoDB()
    console.log('Mongo OK')
  } catch (err) {
    console.error('Mongo error:', err)
  }

  console.log('Testing Redis...')
  try {
    await redis.connect()
    console.log('Redis OK')
    await redis.disconnect()
  } catch (err) {
    console.error('Redis error:', err)
  }
}

run().catch(console.error)
