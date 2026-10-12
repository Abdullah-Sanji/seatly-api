import { EventPublisher } from './event-publisher';

describe('EventPublisher', () => {
  it('invalidates the seat map cache and publishes JSON on the event channel', async () => {
    const redis = { del: jest.fn().mockResolvedValue(1), publish: jest.fn().mockResolvedValue(2) };
    const publisher = new EventPublisher(redis as never);

    await publisher.publish('e1', { type: 'held', seatIds: ['s1'], expiresAt: '2026-10-12T10:00:00.000Z' });

    expect(redis.del).toHaveBeenCalledWith('seatmap:e1');
    expect(redis.publish).toHaveBeenCalledWith(
      'events:e1',
      JSON.stringify({ type: 'held', seatIds: ['s1'], expiresAt: '2026-10-12T10:00:00.000Z' }),
    );
    expect(redis.del.mock.invocationCallOrder[0]).toBeLessThan(redis.publish.mock.invocationCallOrder[0]);
  });
});
