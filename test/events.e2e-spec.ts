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

    const mine = await http()
      .get(`/events/${event.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
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

  describe('search (NFTH-3088)', () => {
    const day = 24 * 3600 * 1000;
    const at = (days: number) => new Date(Date.now() + days * day);
    const names = (body: { name: string }[]) => body.map((e) => e.name);

    it('TC-1 name substring matches case-insensitively', async () => {
      await createEvent(ctx.prisma, {
        name: 'Riyadh Jazz Night',
        venueName: 'King Fahd Cultural Centre',
        startsAt: at(30),
        rows: 1,
      });
      await createEvent(ctx.prisma, {
        name: 'Comedy Showcase',
        venueName: 'Boulevard Arena',
        rows: 1,
      });
      const res = await http().get('/events').query({ q: 'jAzZ' });
      expect(res.status).toBe(200);
      expect(names(res.body)).toEqual(['Riyadh Jazz Night']);
    });

    it('TC-2 venue substring matches when the name does not', async () => {
      const res = await http().get('/events').query({ q: 'boulevard' });
      expect(res.status).toBe(200);
      expect(names(res.body)).toEqual(['Comedy Showcase']);
    });

    it('TC-3 no match returns an empty list', async () => {
      const res = await http().get('/events').query({ q: 'zzz-nothing' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('TC-4 absent or empty q returns the full list as today', async () => {
      await createEvent(ctx.prisma, { name: 'Late', startsAt: at(300), rows: 1 });
      await createEvent(ctx.prisma, { name: 'Early', startsAt: at(1), rows: 1 });
      const all = await http().get('/events');
      const empty = await http().get('/events').query({ q: '' });
      expect(all.status).toBe(200);
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual(all.body);
      expect(names(all.body)).toEqual(
        expect.arrayContaining(['Riyadh Jazz Night', 'Comedy Showcase', 'Late', 'Early']),
      );
      const starts = all.body.map((e: { startsAt: string }) => Date.parse(e.startsAt));
      expect(starts).toEqual([...starts].sort((a: number, b: number) => a - b));
    });

    it('TC-5 q over 100 characters is rejected with VALIDATION_FAILED; 100 accepted', async () => {
      const bad = await http()
        .get('/events')
        .query({ q: 'a'.repeat(101) });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('VALIDATION_FAILED');
      const ok = await http()
        .get('/events')
        .query({ q: 'a'.repeat(100) });
      expect(ok.status).toBe(200);
    });

    it('TC-6 filtered results keep the EventSummary shape and start-date order', async () => {
      await createEvent(ctx.prisma, { name: 'Zeta Night', startsAt: at(50), rows: 1 });
      await createEvent(ctx.prisma, { name: 'Alpha Night', startsAt: at(40), rows: 1 });
      const res = await http().get('/events').query({ q: 'night' });
      expect(res.status).toBe(200);
      expect(names(res.body)).toEqual(['Riyadh Jazz Night', 'Alpha Night', 'Zeta Night']);
      for (const e of res.body) {
        expect(Object.keys(e).sort()).toEqual([
          'availableCount',
          'id',
          'name',
          'salesOpenAt',
          'startsAt',
          'status',
          'venueName',
        ]);
      }
    });
  });
});
