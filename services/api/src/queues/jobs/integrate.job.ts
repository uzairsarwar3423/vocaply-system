export interface IntegrateJobData {
  teamId: string;
  meetingId?: string;
  actionItemId?: string;
  provider?: 'JIRA' | 'LINEAR' | 'NOTION';
  idempotencyKey?: string;
  attempt?: number;
}

