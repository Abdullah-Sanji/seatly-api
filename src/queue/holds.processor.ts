import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { HoldsService } from '../holds/holds.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventPublisher } from '../realtime/event-publisher';
import {
  EXPIRE_HOLD_JOB,
  ExpireHoldJob,
  HOLDS_QUEUE,
  OPEN_SALES_JOB,
  OpenSalesJob,
} from './queue.constants';

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

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(`Worker error: ${error.message}`);
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
    const released = await this.holds.expire(
      data.eventId,
      data.seatId,
      data.userId,
      data.holdToken,
    );
    if (released) {
      await this.publisher.publish(data.eventId, { type: 'released', seatIds: [data.seatId] });
    }
  }

  private async openSales(data: OpenSalesJob): Promise<void> {
    const { count } = await this.prisma.event.updateMany({
      where: { id: data.eventId, status: EventStatus.upcoming },
      data: { status: EventStatus.on_sale },
    });
    if (count === 1) {
      await this.publisher.publish(data.eventId, { type: 'sales_opened' });
    }
  }
}
