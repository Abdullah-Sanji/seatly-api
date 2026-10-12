import request from 'supertest';
import { HoldsQueue } from '../src/queue/holds.queue';
import { createEvent, sleep } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('open-sales job', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('flips an upcoming event to on_sale at the scheduled time', async () => {
    const event = await createEvent(ctx.prisma, { status: 'upcoming' });
    await ctx.app.get(HoldsQueue).scheduleOpenSales(event.id, new Date(Date.now() + 500));

    const before = await request(ctx.app.getHttpServer()).get(`/events/${event.id}`);
    expect(before.body.status).toBe('upcoming');

    await sleep(2500);
    const after = await request(ctx.app.getHttpServer()).get(`/events/${event.id}`);
    expect(after.body.status).toBe('on_sale');
  });
});
