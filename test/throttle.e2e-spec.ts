import request from 'supertest';
import { startTestApp, TestContext } from './setup/test-app';

describe('throttling', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp({ THROTTLE_ENABLED: 'true' });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('limits login to 5 attempts per minute per IP', async () => {
    const attempt = () =>
      request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@test.dev', password: 'whatever1' });
    for (let i = 0; i < 5; i += 1) {
      expect((await attempt()).status).toBe(401);
    }
    const sixth = await attempt();
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('RATE_LIMITED');
  });
});
