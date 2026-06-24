// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPERS
// All dates stored in DB as UTC. Conversion to user timezone happens in
// the application or frontend layer, never in SQL.
// ─────────────────────────────────────────────────────────────────────────────

// Add N minutes to a date
export function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000)
}

// Add N hours to a date
export function addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

// Add N days to a date
export function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

// Add N seconds to a date
export function addSeconds(date: Date, seconds: number): Date {
    return new Date(date.getTime() + seconds * 1000)
}

// Difference in seconds between two dates (b - a)
export function differenceInSeconds(a: Date, b: Date): number {
    return Math.floor((b.getTime() - a.getTime()) / 1000)
}

// Difference in full days between two dates (b - a), rounded down
export function differenceInDays(a: Date, b: Date): number {
    return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
}

// Start of current UTC month
export function startOfCurrentMonth(): Date {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

// ISO week string: 2026-W20
export function toISOWeek(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7  // Monday = 1, Sunday = 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil((((d as any) - (yearStart as any)) / 86400000 + 1) / 7)
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// Parse and validate an ISO date string from query params.
// Returns null if invalid — caller decides whether to error or use default.
export function parseISODate(value: unknown): Date | null {
    if (typeof value !== 'string') return null
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
}