import { holdKey, userHoldsKey } from '../src/common/redis-keys';
import { HoldsService, MAX_HELD_SEATS_PER_EVENT } from '../src/holds/holds.service';
import { startTestApp, TestContext } from './setup/test-app';

describe('HoldsService (real Redis)', () => {
  let ctx: TestContext;
  let holds: HoldsService;

  beforeAll(async () => {
    ctx = await startTestApp({ HOLD_TTL_SECONDS: '60' });
    holds = ctx.app.get(HoldsService);
  });

  afterAll(async () => {
    await ctx.stop();
  });

  afterEach(async () => {
    await ctx.redis.flushall();
  });

  it('grants a hold once and reports seat_held to everyone after, including the holder', async () => {
    const first = await holds.tryHold('e1', 's1', 'u1');
    expect(first.outcome).toBe('held');
    expect(await holds.tryHold('e1', 's1', 'u2')).toEqual({ outcome: 'seat_held' });
    expect(await holds.tryHold('e1', 's1', 'u1')).toEqual({ outcome: 'seat_held' });

    expect(await ctx.redis.ttl(holdKey('e1', 's1'))).toBeGreaterThan(55);
    expect(await holds.getHeldSeatIds('e1', 'u1')).toEqual(['s1']);
  });

  it('only the holder can release, and release clears the user set entry', async () => {
    await holds.tryHold('e1', 's1', 'u1');
    expect(await holds.release('e1', 's1', 'u2')).toBe(false);
    expect(await holds.release('e1', 's1', 'u1')).toBe(true);
    expect(await ctx.redis.exists(holdKey('e1', 's1'))).toBe(0);
    expect(await holds.getHeldSeatIds('e1', 'u1')).toEqual([]);
    expect(await holds.release('e1', 's1', 'u1')).toBe(false);
  });

  it('enforces the per-event limit atomically', async () => {
    for (let i = 0; i < MAX_HELD_SEATS_PER_EVENT; i += 1) {
      expect((await holds.tryHold('e1', `s${i}`, 'u1')).outcome).toBe('held');
    }
    expect(await holds.tryHold('e1', 'extra', 'u1')).toEqual({ outcome: 'limit_reached' });
    expect((await holds.tryHold('e2', 'other-event', 'u1')).outcome).toBe('held');
  });

  it('expire removes the hold only when the token matches', async () => {
    const result = await holds.tryHold('e1', 's1', 'u1');
    if (result.outcome !== 'held') throw new Error('expected held');

    expect(await holds.expire('e1', 's1', 'u1', 'stale-token')).toBe(false);
    expect(await ctx.redis.exists(holdKey('e1', 's1'))).toBe(1);

    expect(await holds.expire('e1', 's1', 'u1', result.holdToken)).toBe(true);
    expect(await ctx.redis.exists(holdKey('e1', 's1'))).toBe(0);
    expect(await ctx.redis.sismember(userHoldsKey('u1', 'e1'), 's1')).toBe(0);
  });

  it('getHoldValues and clearHolds work on a batch', async () => {
    await holds.tryHold('e1', 's1', 'u1');
    await holds.tryHold('e1', 's2', 'u1');
    const values = await holds.getHoldValues('e1', ['s1', 's2', 's3']);
    expect(values[0]).toMatch(/^u1:/);
    expect(values[1]).toMatch(/^u1:/);
    expect(values[2]).toBeNull();

    await holds.clearHolds('e1', 'u1', ['s1', 's2']);
    expect(await ctx.redis.exists(holdKey('e1', 's1'), holdKey('e1', 's2'), userHoldsKey('u1', 'e1'))).toBe(0);
  });
});
