import request from 'supertest';
import { holdKey, holdValue, userHoldsKey } from '../src/common/redis-keys';
import { createEvent, registerUser, sleep } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

const userIdOf = (accessToken: string): string =>
  JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()).sub;

describe('confirm booking', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  const hold = (eventId: string, seatId: string, token: string) =>
    http().post(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const confirm = (eventId: string, token: string) =>
    http().post(`/events/${eventId}/bookings`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('confirms all held seats in one booking and marks them sold', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 3 });
    const [s1, s2] = event.seats;
    const user = await registerUser(ctx.app, 'buyer@test.dev');
    await hold(event.id, s1.id, user.accessToken);
    await hold(event.id, s2.id, user.accessToken);

    const res = await confirm(event.id, user.accessToken);
    expect(res.status).toBe(201);
    expect(res.body.totalCents).toBe(20000);
    expect([...res.body.seatIds].sort()).toEqual([s1.id, s2.id].sort());

    const map = await http().get(`/events/${event.id}`);
    expect(map.body.seats.map((s: { state: string }) => s.state)).toEqual(['sold', 'sold', 'available']);
    expect(await ctx.redis.exists(holdKey(event.id, s1.id), userHoldsKey(userIdOf(user.accessToken), event.id))).toBe(0);

    const mine = await http().get('/me/bookings').set('Authorization', `Bearer ${user.accessToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual([
      {
        id: res.body.bookingId,
        eventName: 'Test Event',
        seats: [
          { rowLabel: 'A', seatNumber: 1 },
          { rowLabel: 'A', seatNumber: 2 },
        ],
        totalCents: 20000,
        createdAt: expect.any(String),
      },
    ]);
  });

  it('rejects confirm with no held seats, and reports expired holds', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 2 });
    const user = await registerUser(ctx.app, 'empty@test.dev');
    const none = await confirm(event.id, user.accessToken);
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('NO_HELD_SEATS');

    await hold(event.id, event.seats[0].id, user.accessToken);
    await hold(event.id, event.seats[1].id, user.accessToken);
    await ctx.redis.del(holdKey(event.id, event.seats[1].id)); // simulate expiry
    const expired = await confirm(event.id, user.accessToken);
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('HOLD_EXPIRED');
    expect(expired.body.details).toEqual({ lostSeatIds: [event.seats[1].id] });
  });

  it('a confirm that enters the transaction while another writer holds the row lock sees the committed sale', async () => {
    // Proves SELECT ... FOR UPDATE: without it, confirm would read "available" under READ COMMITTED,
    // then its UPDATE would wait and succeed, selling the seat twice.
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'blocked@test.dev');
    await hold(event.id, seat.id, user.accessToken);

    let openGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    const writer = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM seats WHERE id = ${seat.id}::uuid FOR UPDATE`;
        await tx.seat.update({ where: { id: seat.id }, data: { status: 'sold' } });
        await gate;
      },
      { timeout: 15000 },
    );
    await sleep(200); // writer now holds the row lock

    const pending = confirm(event.id, user.accessToken).then((res) => res); // .then() sends the request
    await sleep(500); // confirm has passed the Redis check and is blocked on the lock
    openGate();
    await writer;

    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SEAT_SOLD');
    expect(await ctx.prisma.bookingSeat.count({ where: { seatId: seat.id } })).toBe(0);
  });

  it('two overlapping confirms serialize: one wins, the other gets SEAT_SOLD, nobody gets 500', async () => {
    // Simulates a hold-layer bug where two users both believe they hold the same three seats.
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 3 });
    const seatIds = event.seats.map((s) => s.id);
    const a = await registerUser(ctx.app, 'overlap-a@test.dev');
    const b = await registerUser(ctx.app, 'overlap-b@test.dev');
    const bId = userIdOf(b.accessToken);
    for (const seatId of seatIds) {
      expect((await hold(event.id, seatId, a.accessToken)).status).toBe(200);
    }

    let openGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    const blocker = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM seats WHERE id = ${seatIds[0]}::uuid FOR UPDATE`;
        await gate;
      },
      { timeout: 15000 },
    );
    await sleep(200);

    const confirmA = confirm(event.id, a.accessToken).then((res) => res);
    await sleep(500); // A passed the Redis check and is waiting on the blocker's lock

    // Now hand the same seats to B in Redis, in reverse order, and let B pass the Redis check too.
    await ctx.redis.sadd(userHoldsKey(bId, event.id), ...[...seatIds].reverse());
    for (const seatId of seatIds) {
      await ctx.redis.set(holdKey(event.id, seatId), holdValue(bId, 'forged'), 'EX', 300);
    }
    const confirmB = confirm(event.id, b.accessToken).then((res) => res);
    await sleep(500);

    openGate();
    await blocker;
    const [ra, rb] = await Promise.all([confirmA, confirmB]);

    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.code).toBe('SEAT_SOLD');
    const rows = await ctx.prisma.bookingSeat.findMany({ where: { seatId: { in: seatIds } } });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.bookingId)).size).toBe(1);
  });

  it('ten users confirming distinct seats in parallel all succeed', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 10 });
    const users = await Promise.all(
      Array.from({ length: 10 }, (_, i) => registerUser(ctx.app, `parallel${i}@test.dev`)),
    );
    await Promise.all(users.map((u, i) => hold(event.id, event.seats[i].id, u.accessToken)));
    const results = await Promise.all(users.map((u) => confirm(event.id, u.accessToken)));
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect(await ctx.prisma.bookingSeat.count({ where: { seatId: { in: event.seats.map((s) => s.id) } } })).toBe(10);
  });

  it('booking_seats.seat_id is unique at the database level', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const user = await ctx.prisma.user.create({ data: { email: 'db@test.dev', passwordHash: 'x' } });
    const make = () =>
      ctx.prisma.booking.create({
        data: { userId: user.id, eventId: event.id, totalCents: 1, seats: { create: [{ seatId: event.seats[0].id }] } },
      });
    await make();
    await expect(make()).rejects.toMatchObject({ code: 'P2002' });
  });
});
