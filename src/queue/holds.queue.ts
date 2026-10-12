import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  EXPIRE_HOLD_JOB,
  ExpireHoldJob,
  HOLDS_QUEUE,
  OPEN_SALES_JOB,
  OpenSalesJob,
  expireHoldJobId,
  openSalesJobId,
} from './queue.constants';

@Injectable()
export class HoldsQueue {
  constructor(@InjectQueue(HOLDS_QUEUE) private readonly queue: Queue) {}

  async scheduleExpiry(job: ExpireHoldJob, delayMs: number): Promise<void> {
    await this.queue.add(EXPIRE_HOLD_JOB, job, {
      jobId: expireHoldJobId(job),
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }

  async scheduleOpenSales(eventId: string, at: Date): Promise<void> {
    const job: OpenSalesJob = { eventId };
    await this.queue.add(OPEN_SALES_JOB, job, {
      jobId: openSalesJobId(eventId),
      delay: Math.max(0, at.getTime() - Date.now()),
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }
}
