import type { NextFunction, Request, Response } from 'express'
import crypto from 'node:crypto'

import { redis } from '../config/redis'
import { RateLimitError } from '../utils/errors'

type IdentifierFn = (req: Request) => string | null

interface RateLimitOptions {
    limit: number
    windowSeconds: number
    keyPrefix: string
    identifier: IdentifierFn
}

interface RateLimitResult {
    allowed: boolean
    remaining: number
    resetAt: number
}

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]

local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

local minScore = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', minScore)

local current = redis.call('ZCARD', key)

if current >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')

  local resetAt = now + window

  if oldest[2] ~= nil then
    resetAt = tonumber(oldest[2]) + window
  end

  return {0, limit - current, resetAt}
end

local member = tostring(now) .. '-' .. tostring(math.random())

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)

local remaining = limit - current - 1

return {1, remaining, now + window}
`

let scriptSha: string | undefined

async function getScriptSha(): Promise<string> {
    if (scriptSha) {
        return scriptSha
    }

    const sha = await redis.script('LOAD', SLIDING_WINDOW_LUA)

    scriptSha = String(sha)

    return scriptSha
}

async function consumeToken(
    key: string,
    limit: number,
    windowSeconds: number,
): Promise<RateLimitResult> {
    const now = Date.now()

    const sha = await getScriptSha()

    const result = (await redis.evalsha(
        sha,
        1,
        key,
        String(now),
        String(windowSeconds * 1000),
        String(limit),
    )) as unknown as [number, number, number]

    return {
        allowed: Number(result[0]) === 1,
        remaining: Math.max(0, Number(result[1])),
        resetAt: Number(result[2]),
    }
}

function setHeaders(
    res: Response,
    limit: number,
    remaining: number,
    resetAt: number,
) {
    res.setHeader('X-RateLimit-Limit', String(limit))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    res.setHeader(
        'X-RateLimit-Reset',
        String(Math.ceil(resetAt / 1000)),
    )
}

export function createRateLimiter(
    options: RateLimitOptions,
) {
    return async (
        req: Request,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const identifier = options.identifier(req)

            if (!identifier) {
                return next()
            }

            const key = `${options.keyPrefix}:${identifier}`

            const result = await consumeToken(
                key,
                options.limit,
                options.windowSeconds,
            )

            setHeaders(
                res,
                options.limit,
                result.remaining,
                result.resetAt,
            )

            if (!result.allowed) {
                throw new RateLimitError(
                    'Rate limit exceeded. Please try again later.',
                )
            }

            next()
        } catch (error) {
            next(error)
        }
    }
}

/* -------------------------------------------------------------------------- */
/* IP LIMIT */
/* -------------------------------------------------------------------------- */

export const ipRateLimiter = createRateLimiter({
    limit: 100,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:ip',
    identifier: (req) => req.ip ?? null,
})

/* -------------------------------------------------------------------------- */
/* USER LIMIT */
/* -------------------------------------------------------------------------- */

export const apiRateLimiter = createRateLimiter({
    limit: 200,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:api',

    // Day 13 auth middleware ke baad replace karna
    identifier: () => null,
})

/* -------------------------------------------------------------------------- */
/* LOGIN LIMIT */
/* -------------------------------------------------------------------------- */

export const loginRateLimiter = createRateLimiter({
    limit: 5,
    windowSeconds: 15 * 60,
    keyPrefix: 'ratelimit:login',

    identifier: (req) => {
        const email = req.body?.email

        if (typeof email !== 'string') {
            return null
        }

        return crypto
            .createHash('sha256')
            .update(email.trim().toLowerCase())
            .digest('hex')
    },
})