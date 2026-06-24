import { PaginationMeta, OffsetMeta } from './response'

// ─────────────────────────────────────────────────────────────────────────────
// CURSOR PAGINATION
// Encodes the last item's (id + createdAt) as a base64url string.
// This is stable even when new records are inserted — unlike OFFSET which
// can return duplicates or skip items when data changes between pages.
//
// Cursor format (before encoding):
//   { id: "mtg_clx01abc", createdAt: "2026-05-12T09:00:00.000Z" }
// ─────────────────────────────────────────────────────────────────────────────

export interface CursorPayload {
    id: string
    createdAt: string  // ISO 8601
}

// Encode cursor: object → base64url string (URL-safe, no padding issues)
export function encodeCursor(id: string, createdAt: Date): string {
    const payload: CursorPayload = {
        id,
        createdAt: createdAt.toISOString(),
    }
    return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

// Decode cursor: base64url string → { id, createdAt }
export function decodeCursor(cursor: string): { id: string; createdAt: Date } {
    try {
        const decoded: CursorPayload = JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8')
        )
        if (!decoded.id || !decoded.createdAt) {
            throw new Error('Invalid cursor structure')
        }
        return { id: decoded.id, createdAt: new Date(decoded.createdAt) }
    } catch {
        throw new Error('INVALID_CURSOR: cursor is malformed or tampered')
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildCursorPage
// The standard pattern for cursor-paginated queries:
//
//   1. Fetch limit + 1 items from DB
//   2. If more than limit items returned → hasMore = true
//   3. Slice to exactly limit items
//   4. Encode cursor from last item
//
// All list queries in Vocaply follow this pattern.
// ─────────────────────────────────────────────────────────────────────────────

export function buildCursorPage<T extends { id: string; createdAt: Date }>(
    items: T[],
    limit: number
): { data: T[]; meta: PaginationMeta } {
    const hasMore = items.length > limit
    const data = hasMore ? items.slice(0, limit) : items

    const nextCursor = hasMore
        ? encodeCursor(data[data.length - 1].id, data[data.length - 1].createdAt)
        : null

    return {
        data,
        meta: {
            hasMore,
            nextCursor,
            count: data.length,
        },
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFSET PAGINATION (for analytics pages where total count is needed)
// ─────────────────────────────────────────────────────────────────────────────

export function buildOffsetPage<T>(
    items: T[],
    total: number,
    page: number,
    limit: number
): { data: T[]; meta: OffsetMeta } {
    const pages = Math.ceil(total / limit)
    return {
        data: items,
        meta: {
            page,
            limit,
            total,
            hasMore: page < pages,
            pages,
        },
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSE PAGINATION QUERY PARAMS
// Validates and normalizes pagination params from req.query.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedCursorParams {
    limit: number
    cursor: string | undefined
}

export interface ParsedOffsetParams {
    page: number
    limit: number
}

export function parseCursorParams(
    query: Record<string, unknown>,
    defaultLimit = 20,
    maxLimit = 100
): ParsedCursorParams {
    const rawLimit = parseInt(String(query.limit ?? defaultLimit), 10)
    const limit = Math.min(Math.max(isNaN(rawLimit) ? defaultLimit : rawLimit, 1), maxLimit)
    const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
    return { limit, cursor }
}

export function parseOffsetParams(
    query: Record<string, unknown>,
    defaultLimit = 20,
    maxLimit = 100
): ParsedOffsetParams {
    const rawPage = parseInt(String(query.page ?? 1), 10)
    const rawLimit = parseInt(String(query.limit ?? defaultLimit), 10)
    const page = Math.max(isNaN(rawPage) ? 1 : rawPage, 1)
    const limit = Math.min(Math.max(isNaN(rawLimit) ? defaultLimit : rawLimit, 1), maxLimit)
    return { page, limit }
}