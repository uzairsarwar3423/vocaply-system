import pino from 'pino'

// ─────────────────────────────────────────────────────────────────────────────
// PINO LOGGER
// Structured JSON logs in production.
// Human-readable pretty logs in development (via pino-pretty).
// All log lines include: level, time, msg, plus any extra context.
// ─────────────────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development'

export const logger = pino({
    level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),

    // In development: pretty-print with colors and human-readable timestamps
    // In production:  raw JSON (parsed by log aggregators like Datadog / Axiom)
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname',
                messageFormat: '{msg}',
                singleLine: false,
            },
        },
    }),

    // Base fields included in every log line
    base: {
        env: process.env.NODE_ENV,
        version: process.env.npm_package_version ?? 'unknown',
    },

    // Redact sensitive fields so they never appear in logs, even accidentally
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'body.password',
            'body.currentPassword',
            'body.newPassword',
            'body.token',
            '*.passwordHash',
            '*.accessToken',
            '*.refreshToken',
            '*.tokenHash',
        ],
        censor: '[REDACTED]',
    },
})