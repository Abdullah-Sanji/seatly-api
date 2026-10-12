import request from 'supertest';
import { holdKey } from '../src/common/redis-keys';
import { createEvent, registerUser } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('hold and release', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  const hold = (eventId: string, seatId: string, token: string) =>
    http().post(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const release = (eventId: string, seatId: string, token: string) =>
    http().delete(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('holds a seat, shows it as held_by_me, and lets the holder release it', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 3 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'holder@test.dev');

    const res = await hold(event.id, seat.id, user.accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ seatId: seat.id, expiresAt: expect.any(String) });
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 290_000);

    const map = await http().get(`/events/${event.id}`).set('Authorization', `Bearer ${user.accessToken}`);
    expect(map.body.seats[0].state).toBe('held_by_me');

    expect((await release(event.id, seat.id, user.accessToken)).status).toBe(204);
    const after = await http().get(`/events/${event.id}`);
    expect(after.body.seats[0].state).toBe('available');
  });

  it('exactly one of two concurrent holders wins', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const a = await registerUser(ctx.app, 'race-a@test.dev');
    const b = await registerUser(ctx.app, 'race-b@test.dev');

    const [ra, rb] = await Promise.all([hold(event.id, seat.id, a.accessToken), hold(event.id, seat.id, b.accessToken)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.code).toBe('SEAT_HELD');
  });

  it('re-holding your own seat is SEAT_HELD and does not extend the TTL', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'rehold@test.dev');
    await hold(event.id, seat.id, user.accessToken);
    await ctx.redis.expire(holdKey(event.id, seat.id), 100);

    const again = await hold(event.id, seat.id, user.accessToken);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SEAT_HELD');
    expect(await ctx.redis.ttl(holdKey(event.id, seat.id))).toBeLessThanOrEqual(100);
  });

  it('rejects holds when sales are not open, on sold seats, past the limit, and on foreign seats', async () => {
    const upcoming = await createEvent(ctx.prisma, { status: 'upcoming', rows: 1, seatsPerRow: 1 });
    const user = await registerUser(ctx.app, 'rules@test.dev');
    const closed = await hold(upcoming.id, upcoming.seats[0].id, user.accessToken);
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe('SALES_NOT_OPEN');

    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 8 });
    await ctx.prisma.seat.update({ where: { id: event.seats[0].id }, data: { status: 'sold' } });
    const sold = await hold(event.id, event.seats[0].id, user.accessToken);
    expect(sold.status).toBe(409);
    expect(sold.body.code).toBe('SEAT_SOLD');

    for (const seat of event.seats.slice(1, 7)) {
      expect((await hold(event.id, seat.id, user.accessToken)).status).toBe(200);
    }
    const seventh = await hold(event.id, event.seats[7].id, user.accessToken);
    expect(seventh.status).toBe(409);
    expect(seventh.body.code).toBe('HOLD_LIMIT_REACHED');

    const other = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const foreign = await hold(event.id, other.seats[0].id, user.accessToken);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('SEAT_NOT_FOUND');
  });

  it('release by a non-holder is NOT_HOLDER and auth is required', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const owner = await registerUser(ctx.app, 'owner@test.dev');
    const thief = await registerUser(ctx.app, 'thief@test.dev');
    await hold(event.id, seat.id, owner.accessToken);

    const res = await release(event.id, seat.id, thief.accessToken);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_HOLDER');

    expect((await http().post(`/events/${event.id}/seats/${seat.id}/hold`)).status).toBe(401);
  });
});
