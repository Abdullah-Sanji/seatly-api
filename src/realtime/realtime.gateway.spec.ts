import { Logger } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway pmessage bridge', () => {
  it('ignores malformed messages and still forwards valid ones', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const subscriber = { psubscribe: jest.fn().mockResolvedValue(1), on: jest.fn() };
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const gateway = new RealtimeGateway({} as never, subscriber as never);
    gateway.server = { to } as never;

    await gateway.onModuleInit();
    const listener = subscriber.on.mock.calls[0][1] as (p: string, c: string, r: string) => void;

    expect(() => listener('events:*', 'events:e1', 'not json')).not.toThrow();
    expect(to).not.toHaveBeenCalled();

    listener('events:*', 'events:e1', '{"type":"held","seatIds":["s1"]}');
    expect(to).toHaveBeenCalledWith('event:e1');
    expect(emit).toHaveBeenCalledWith('seat_update', { type: 'held', seatIds: ['s1'] });
  });
});
