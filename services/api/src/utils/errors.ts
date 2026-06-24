// ─────────────────────────────────────────────────────────────────────────────
// ERROR CLASS HIERARCHY
// All application errors extend AppError. Controllers NEVER throw plain Error.
// error.middleware maps each class to the correct HTTP status code.
// ─────────────────────────────────────────────────────────────────────────────

export class AppError extends Error {
    constructor(
        public readonly code: string,
        public readonly statusCode: number,
        message: string,
        public readonly details?: Record<string, unknown>
    ) {
        super(message)
        this.name = 'AppError'
        // Maintains proper stack trace in V8
        Error.captureStackTrace(this, this.constructor)
    }
}

// 401 — No valid auth / session expired
export class UnauthorizedError extends AppError {
    constructor(code: string, message: string, details?: Record<string, unknown>) {
        super(code, 401, message, details)
        this.name = 'UnauthorizedError'
    }
}

// 403 — Valid auth, but insufficient permissions
export class ForbiddenError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super('FORBIDDEN', 403, message, details)
        this.name = 'ForbiddenError'
    }
}

// 404 — Resource does not exist
export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
        super(
            'NOT_FOUND',
            404,
            id ? `${resource} '${id}' not found` : `${resource} not found`
        )
        this.name = 'NotFoundError'
    }
}

// 409 — Duplicate resource (unique constraint violation)
export class DuplicateError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super('DUPLICATE', 409, message, details)
        this.name = 'DuplicateError'
    }
}

// 422 — Valid JSON but semantically invalid (field-level errors)
export class ValidationError extends AppError {
    constructor(fields: Record<string, string>) {
        super('VALIDATION_ERROR', 422, 'Validation failed', { fields })
        this.name = 'ValidationError'
    }
}

// 402 — Plan quota exceeded
export class PlanLimitError extends AppError {
    constructor(
        resource: string,
        used: number,
        limit: number,
        upgradeUrl: string
    ) {
        super(
            'PLAN_LIMIT',
            402,
            `${resource} limit reached (${used}/${limit})`,
            { used, limit, upgradeUrl }
        )
        this.name = 'PlanLimitError'
    }
}

// 429 — Rate limit exceeded
export class RateLimitError extends AppError {
    constructor(message: string, retryAfterSeconds?: number) {
        super(
            'RATE_LIMITED',
            429,
            message,
            retryAfterSeconds !== undefined ? { retryAfterSeconds } : undefined
        )
        this.name = 'RateLimitError'
    }
}

// 502 — Third-party integration failed (Jira, Slack, Recall.ai, etc.)
export class IntegrationError extends AppError {
    constructor(provider: string, message: string) {
        super('INTEGRATION_ERROR', 502, `${provider}: ${message}`)
        this.name = 'IntegrationError'
    }
}

// 409 — Idempotency key reused with different payload
export class IdempotencyConflictError extends AppError {
    constructor(key: string) {
        super(
            'IDEMPOTENCY_CONFLICT',
            422,
            'This idempotency key was used with a different request body',
            { key }
        )
        this.name = 'IdempotencyConflictError'
    }
}