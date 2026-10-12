import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { HoldsService } from '../holds/holds.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventPublisher } from '../realtime/event-publisher';
import { EXPIRE_HOLD_JOB, ExpireHoldJob, HOLDS_QUEUE, OPEN_SALES_JOB, OpenSalesJob } from './queue.constants';

@Processor(HOLDS_QUEUE)
export class HoldsProcessor extends WorkerHost {
  private readonly logger = new Logger(HoldsProcessor.name);

  constructor(
    private readonly holds: HoldsService,
    private readonly publisher: EventPublisher,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EXPIRE_HOLD_JOB:
        return this.expireHold(job.data as ExpireHoldJob);
      case OPEN_SALES_JOB:
        return this.openSales(job.data as OpenSalesJob);
      default:
        this.logger.warn(`Unknown job ${job.name}`);
    }
  }

  private async expireHold(data: ExpireHoldJob): Promise<void> {
    const released = await this.holds.expire(data.eventId, data.seatId, data.userId, data.holdToken);
    if (released) {
      await this.publisher.publish(data.eventId, { type: 'released', seatIds: [data.seatId] });
    }
  }

  // Implemented in Task 15.
  private async openSales(_data: OpenSalesJob): Promise<void> {
    return undefined;
  }
}
