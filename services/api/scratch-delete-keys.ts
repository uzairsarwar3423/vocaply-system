import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

async function main() {
  const keys = await redis.keys('webhook:processed:recall:*')
  if (keys.length > 0) {
    console.log(`Deleting ${keys.length} keys...`)
    await redis.del(...keys)
    console.log('Keys deleted.')
  } else {
    console.log('No keys found.')
  }
  redis.disconnect()
}

main().catch(console.error)
