import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

async function main() {
  const keys = await redis.keys('webhook:processed:recall:de0f6cd1-60f9-43ff-8eed-38565981b8f3:*')
  console.log('Redis keys for bot de0f6cd1...', keys)
  redis.disconnect()
}

main().catch(console.error)
