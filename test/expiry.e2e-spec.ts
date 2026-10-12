import Redis from 'ioredis';
import request from 'supertest';
import { holdKey } from '../src/common/redis-keys';
import { SeatUpdateMessage } from '../src/realtime/messages';
import { createEvent, registerUser, sleep } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('hold expiry jobs', () => {
  let ctx: TestContext;
  let subscriber: Redis;
  const published: SeatUpdateMessage[] = [];
  const http = () => request(ctx.app.getHttpServer());
  const hold = (eventId: string, seatId: string, token: string) =>
    http().post(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const release = (eventId: string, seatId: string, token: string) =>
    http().delete(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const stateOf = async (eventId: string, seatId: string, token?: string) => {
    const req = http().get(`/events/${eventId}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    const res = await req;
    return res.body.seats.find((s: { id: string }) => s.id === seatId).state as string;
  };
  const releasedCount = (seatId: string) =>
    published.filter((m) => m.type === 'released' && m.seatIds.includes(seatId)).length;

  beforeAll(async () => {
    ctx = await startTestApp({ HOLD_TTL_SECONDS: '3' });
    // A plain TTL expiry deletes the key silently; only the job publishes 'released'.
    subscriber = new Redis(process.env.REDIS_URL as string);
    await subscriber.psubscribe('events:*');
    subscriber.on('pmessage', (_pattern, _channel, raw) => {
      published.push(JSON.parse(raw) as SeatUpdateMessage);
    });
  });

  afterAll(async () => {
    await subscriber.quit();
    await ctx.stop();
  });

  it('releases a hold after the TTL via the delayed job and broadcasts it', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'expiry@test.dev');

    expect((await hold(event.id, seat.id, user.accessToken)).status).toBe(200);
    expect(await stateOf(event.id, seat.id)).toBe('held');

    await sleep(4500);
    expect(await stateOf(event.id, seat.id)).toBe('available');
    expect(await ctx.redis.exists(holdKey(event.id, seat.id))).toBe(0);
    expect(releasedCount(seat.id)).toBe(1);
  });

  it('a stale job from a released hold does not kill a newer hold on the same seat', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'stale@test.dev');

    await hold(event.id, seat.id, user.accessToken); // job A fires at ~3s
    await release(event.id, seat.id, user.accessToken); // publishes released #1
    await sleep(1500);
    await hold(event.id, seat.id, user.accessToken); // job B fires at ~4.5s

    await sleep(2000); // t ≈ 3.5s: job A has fired and must have been a no-op
    expect(await stateOf(event.id, seat.id, user.accessToken)).toBe('held_by_me');
    expect(releasedCount(seat.id)).toBe(1);

    await sleep(2500); // t ≈ 6s: job B has fired and published released #2
    expect(await stateOf(event.id, seat.id)).toBe('available');
    expect(releasedCount(seat.id)).toBe(2);
  });
});
