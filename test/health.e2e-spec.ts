import request from 'supertest';
import { startTestApp, TestContext } from './setup/test-app';

describe('GET /health', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp({ WEB_ORIGIN: 'http://localhost:5173,http://localhost:8080' });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('reports postgres and redis as ok', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ postgres: 'ok', redis: 'ok' });
  });

  it.each(['http://localhost:5173', 'http://localhost:8080'])(
    'answers a CORS preflight for the configured origin %s with credentials',
    async (origin) => {
      const res = await request(ctx.app.getHttpServer())
        .options('/auth/register')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    },
  );

  it('rejects a CORS preflight from an unlisted origin', async () => {
    const res = await request(ctx.app.getHttpServer())
      .options('/auth/register')
      .set('Origin', 'http://evil.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
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

  it('reports redis as down with 503 when the connection is gone', async () => {
    ctx.redis.disconnect();
    const res = await request(ctx.app.getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ postgres: 'ok', redis: 'down' });
    await ctx.redis.connect();
  });
});
