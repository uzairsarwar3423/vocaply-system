// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE HELPERS
// All API responses use one of these two shapes — never raw objects.
// success() → { success: true, data, meta? }
// error()   → { success: false, error: { code, message, details? } }
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationMeta {
    hasMore: boolean
    nextCursor: string | null
    prevCursor?: string | null
    count: number
    total?: number       // Optional — expensive COUNT(*) only when needed
}

export interface OffsetMeta {
    page: number
    limit: number
    total: number
    hasMore: boolean
    pages: number
}

// ── SUCCESS ──────────────────────────────────────────────────────────────────

export function success<T>(data: T, meta?: PaginationMeta | OffsetMeta) {
    return {
        success: true as const,
        data,
        ...(meta && { meta }),
    }
}

// ── ERROR ────────────────────────────────────────────────────────────────────

export function errorResponse(
    code: string,
    message: string,
    details?: Record<string, unknown>
) {
    return {
        success: false as const,
        error: {
            code,
            message,
            ...(details && { details }),
        },
    }
}