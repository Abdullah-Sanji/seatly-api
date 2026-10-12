import { Logger } from '@nestjs/common';
import { BookingsService } from './bookings.service';

describe('BookingsService.confirm', () => {
  it('returns the committed booking even when post-commit cleanup fails', async () => {
    const booking = { bookingId: 'b1', seatIds: ['s1'], totalCents: 100 };
    const holds = {
      getHeldSeatIds: jest.fn().mockResolvedValue(['s1']),
      getHoldValues: jest.fn().mockResolvedValue(['u1:tok']),
      clearHolds: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const prisma = { $transaction: jest.fn().mockResolvedValue(booking) };
    const publisher = { publish: jest.fn() };
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new BookingsService(prisma as never, {} as never, holds as never, publisher as never, {} as never);

    await expect(service.confirm('e1', { id: 'u1', email: 'a@b.c' })).resolves.toEqual(booking);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('redis down'));
    errorSpy.mockRestore();
  });
});

describe('BookingsService.holdSeat', () => {
  it('still returns the hold when scheduling the expiry job fails', async () => {
    const expiresAt = new Date();
    const events = { getEventOrThrow: jest.fn().mockResolvedValue({ status: 'on_sale' }) };
    const prisma = { seat: { findFirst: jest.fn().mockResolvedValue({ id: 's1', status: 'available' }) } };
    const holds = {
      tryHold: jest.fn().mockResolvedValue({ outcome: 'held', holdToken: 't', expiresAt }),
      ttlSeconds: 300,
    };
    const holdsQueue = { scheduleExpiry: jest.fn().mockRejectedValue(new Error('queue down')) };
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new BookingsService(
      prisma as never,
      events as never,
      holds as never,
      { publish: jest.fn() } as never,
      holdsQueue as never,
    );

    await expect(service.holdSeat('e1', 's1', { id: 'u1', email: 'a@b.c' })).resolves.toEqual({
      seatId: 's1',
      expiresAt: expiresAt.toISOString(),
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('queue down'));
    errorSpy.mockRestore();
  });
});
