export const HOLDS_QUEUE = 'holds';
export const EXPIRE_HOLD_JOB = 'expire-hold';
export const OPEN_SALES_JOB = 'open-sales';

export interface ExpireHoldJob {
  eventId: string;
  seatId: string;
  userId: string;
  holdToken: string;
}

export interface OpenSalesJob {
  eventId: string;
}

// BullMQ job ids must not contain ':' — use '.' as the separator.
export const expireHoldJobId = (job: ExpireHoldJob): string =>
  `hold.${job.eventId}.${job.seatId}.${job.holdToken}`;
export const openSalesJobId = (eventId: string): string => `open-sales.${eventId}`;
