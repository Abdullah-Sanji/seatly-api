import { parseRedisUrl } from './redis-url';

describe('parseRedisUrl', () => {
  it('parses host and port', () => {
    expect(parseRedisUrl('redis://localhost:6379')).toEqual({ host: 'localhost', port: 6379 });
  });

  it('defaults the port and reads password and db', () => {
    expect(parseRedisUrl('redis://:s3cret@cache.internal/2')).toEqual({
      host: 'cache.internal',
      port: 6379,
      password: 's3cret',
      db: 2,
    });
  });
});
