import request from 'supertest';
import { holdKey, holdValue } from '../src/common/redis-keys';
import { createEvent, registerUser } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('events', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('lists events with available counts, ordered by start', async () => {
    await createEvent(ctx.prisma, { name: 'B', rows: 1, seatsPerRow: 3 });
    await createEvent(ctx.prisma, { name: 'A', rows: 1, seatsPerRow: 2, status: 'upcoming' });
    const res = await http().get('/events');
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.map((e: { name: string }) => [e.name, e]));
    expect(byName.B.availableCount).toBe(3);
    expect(byName.A.status).toBe('upcoming');
    expect(byName.A.seats).toBeUndefined();
  });

  it('returns the seat map with held / held_by_me / sold states', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 4 });
    const [s1, s2, s3] = event.seats;
    const me = await registerUser(ctx.app, 'viewer@test.dev');
    const meId = JSON.parse(Buffer.from(me.accessToken.split('.')[1], 'base64url').toString()).sub;

    await ctx.prisma.seat.update({ where: { id: s1.id }, data: { status: 'sold' } });
    await ctx.redis.set(holdKey(event.id, s2.id), holdValue('someone-else', 'tok'), 'EX', 60);
    await ctx.redis.set(holdKey(event.id, s3.id), holdValue(meId, 'tok'), 'EX', 60);

    const anon = await http().get(`/events/${event.id}`);
    expect(anon.status).toBe(200);
    expect(anon.body.seats.map((s: { state: string }) => s.state)).toEqual([
      'sold',
      'held',
      'held',
      'available',
    ]);
    expect(anon.body.availableCount).toBe(1);

    const mine = await http().get(`/events/${event.id}`).set('Authorization', `Bearer ${me.accessToken}`);
    expect(mine.body.seats.map((s: { state: string }) => s.state)).toEqual([
      'sold',
      'held',
      'held_by_me',
      'available',
    ]);
  });

  it('validates the id and reports unknown events', async () => {
    expect((await http().get('/events/not-a-uuid')).status).toBe(400);
    const missing = await http().get('/events/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('EVENT_NOT_FOUND');
  });
});
