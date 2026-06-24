import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

async function main() {
  const keys = await redis.keys('webhook:processed:recall:*')
  console.log('Redis keys:', keys)
  redis.disconnect()
}

main().catch(console.error)
