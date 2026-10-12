import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { HoldsProcessor } from './holds.processor';
import { EXPIRE_HOLD_JOB, OPEN_SALES_JOB } from './queue.constants';

function build(expireResult: boolean) {
  const holds = { expire: jest.fn().mockResolvedValue(expireResult) };
  const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
  const prisma = { event: { updateMany: jest.fn() } };
  const processor = new HoldsProcessor(holds as never, publisher as never, prisma as never);
  return { processor, holds, publisher };
}

const job = (name: string, data: unknown) => ({ name, data }) as Job;

describe('HoldsProcessor expire-hold', () => {
  const data = { eventId: 'e1', seatId: 's1', userId: 'u1', holdToken: 't1' };

  it('publishes released when the hold was still the same', async () => {
    const { processor, holds, publisher } = build(true);
    await processor.process(job(EXPIRE_HOLD_JOB, data));
    expect(holds.expire).toHaveBeenCalledWith('e1', 's1', 'u1', 't1');
    expect(publisher.publish).toHaveBeenCalledWith('e1', { type: 'released', seatIds: ['s1'] });
  });

  it('stays silent when the hold was already gone or replaced', async () => {
    const { processor, publisher } = build(false);
    await processor.process(job(EXPIRE_HOLD_JOB, data));
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('ignores unknown job names', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { processor, holds } = build(true);
    await expect(processor.process(job('something-else', {}))).resolves.toBeUndefined();
    expect(holds.expire).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('HoldsProcessor open-sales', () => {
  it('flips an upcoming event to on_sale and publishes sales_opened', async () => {
    const holds = { expire: jest.fn() };
    const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const prisma = { event: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const processor = new HoldsProcessor(holds as never, publisher as never, prisma as never);

    await processor.process({ name: OPEN_SALES_JOB, data: { eventId: 'e1' } } as Job);

    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', status: 'upcoming' },
      data: { status: 'on_sale' },
    });
    expect(publisher.publish).toHaveBeenCalledWith('e1', { type: 'sales_opened' });
  });

  it('does not publish when the event was already open', async () => {
    const publisher = { publish: jest.fn() };
    const prisma = { event: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const processor = new HoldsProcessor({ expire: jest.fn() } as never, publisher as never, prisma as never);
    await processor.process({ name: OPEN_SALES_JOB, data: { eventId: 'e1' } } as Job);
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
