import request from 'supertest';
import { registerUser } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('auth', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('register returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await http().post('/auth/register').send({ email: 'one@test.dev', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: expect.any(String) });
    const cookie = String(res.headers['set-cookie'][0]);
    expect(cookie).toMatch(/^seatly_refresh=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/auth\/refresh/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('register validates the body and strips unknown fields', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'abc', role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('email'), expect.stringContaining('password')]),
    );
  });

  it('register rejects a duplicate email', async () => {
    await registerUser(ctx.app, 'dup@test.dev');
    const res = await http().post('/auth/register').send({ email: 'dup@test.dev', password: 'Password123!' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('login succeeds with the right password and fails with the wrong one', async () => {
    await registerUser(ctx.app, 'login@test.dev', 'Password123!');
    const ok = await http().post('/auth/login').send({ email: 'login@test.dev', password: 'Password123!' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));

    const bad = await http().post('/auth/login').send({ email: 'login@test.dev', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('UNAUTHORIZED');
  });

  it('refresh rotates the cookie and rejects reuse of the old one', async () => {
    const { cookie } = await registerUser(ctx.app, 'rotate@test.dev');

    const first = await http().post('/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toEqual(expect.any(String));
    const rotated = String(first.headers['set-cookie'][0]);
    expect(rotated).not.toBe(cookie);

    const reuse = await http().post('/auth/refresh').set('Cookie', cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('REFRESH_INVALID');

    const again = await http().post('/auth/refresh').set('Cookie', rotated);
    expect(again.status).toBe(200);
  });

  it('refresh without a cookie is REFRESH_INVALID', async () => {
    const res = await http().post('/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('REFRESH_INVALID');
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const { accessToken, cookie } = await registerUser(ctx.app, 'logout@test.dev');
    const res = await http()
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'][0])).toMatch(/seatly_refresh=;/);

    const refresh = await http().post('/auth/refresh').set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });

  it('logout without a cookie is still 204', async () => {
    const { accessToken } = await registerUser(ctx.app, 'logout2@test.dev');
    const res = await http().post('/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(204);
  });

  it('protected routes reject a missing or bad bearer token', async () => {
    const missing = await http().post('/auth/logout');
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('UNAUTHORIZED');
    const bad = await http().post('/auth/logout').set('Authorization', 'Bearer nope');
    expect(bad.status).toBe(401);
  });
});
