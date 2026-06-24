import Redis from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    lazyConnect: true,
})

redis.on('error', (err) => {
    console.error('Redis connection error:', err)
})