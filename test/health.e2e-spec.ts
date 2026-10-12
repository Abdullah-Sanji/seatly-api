import request from 'supertest';
import { startTestApp, TestContext } from './setup/test-app';

describe('GET /health', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('reports postgres and redis as ok', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ postgres: 'ok', redis: 'ok' });
  });

  it('serves swagger at /docs', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/docs');
    expect(res.status).toBe(200);
  });

  it('returns the error envelope for an unknown route', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.details).toEqual({});
  });
});
