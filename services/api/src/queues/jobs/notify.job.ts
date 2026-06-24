export type NotifyJobType =
  | 'MEETING_PROCESSED'
  | 'MEETING_FAILED'
  | 'PAYMENT_FAILED'
  | 'COMMITMENT_MISSED'
  | 'DEADLINE_REMINDER'
  | 'WEEKLY_DIGEST'

export interface NotifyJobData {
  type:          NotifyJobType
  teamId:        string
  meetingId?:    string
  commitmentId?: string
  ownerId?:      string
  managerIds?:   string[]
}
