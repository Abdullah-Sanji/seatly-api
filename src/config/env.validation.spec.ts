import { validateEnv } from './env.validation';

const valid = {
  DATABASE_URL: 'postgresql://seatly:seatly@localhost:5432/seatly',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'access-secret-at-least-16',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-16',
};

describe('validateEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = validateEnv({ ...valid, PORT: '4000', COOKIE_SECURE: 'true' });
    expect(env.PORT).toBe(4000);
    expect(env.HOLD_TTL_SECONDS).toBe(300);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.THROTTLE_ENABLED).toBe(true);
    expect(env.NODE_ENV).toBe('development');
    expect(env.WEB_ORIGIN).toBe('http://localhost:5173');
  });

  it('rejects a missing DATABASE_URL with a readable message', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects short JWT secrets', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
