import { Emitter } from '@socket.io/redis-emitter'
import Redis from 'ioredis'
import { env } from '../config/env'
import { logger } from '../config/logger'

const redisClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
})

redisClient.on('error', (err) => logger.error({ err }, 'socket.emitter: Redis client error'))

export const socketEmitter = new Emitter(redisClient)
