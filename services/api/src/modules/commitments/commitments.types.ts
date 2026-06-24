export interface ListCommitmentsQuery {
  status?: string | string[]
  ownerId?: string
  meetingId?: string
  overdue?: boolean
  from?: string
  to?: string
  search?: string
  confidenceScore?: number
  limit?: number
  cursor?: string
  sortBy?: 'dueDate' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

export interface UpdateCommitmentStatusDto {
  status: 'FULFILLED' | 'DEFERRED' | 'CANCELLED'
  note?: string
  newDueDate?: string
}

export interface TeamStatsQuery {
  from?: string
  to?: string
}
