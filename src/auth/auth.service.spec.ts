import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { ErrorCode } from '../common/errors/error-code.enum';
import { AppException } from '../common/errors/app.exception';

const config = {
  get: (key: string) =>
    ({ JWT_ACCESS_SECRET: 'access-secret-0123456789', JWT_REFRESH_SECRET: 'refresh-secret-0123456789' })[key],
};

function build() {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
  };
  const redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
  const jwt = new JwtService({});
  // Casts: only the members the service calls are stubbed.
  const service = new AuthService(prisma as never, jwt, config as never, redis as never);
  return { service, prisma, redis, jwt };
}

describe('AuthService', () => {
  it('register hashes the password, creates the user and stores the refresh jti', async () => {
    const { service, prisma, redis } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'u1', email: data.email, passwordHash: data.passwordHash }),
    );

    const tokens = await service.register('a@b.c', 'Password123!');

    const { passwordHash } = prisma.user.create.mock.calls[0][0].data;
    expect(passwordHash).not.toBe('Password123!');
    expect(await argon2.verify(passwordHash, 'Password123!')).toBe(true);
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^refresh:u1:/),
      '1',
      'EX',
      7 * 24 * 3600,
    );
  });

  it('register rejects a duplicate email with EMAIL_TAKEN', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    await expect(service.register('a@b.c', 'Password123!')).rejects.toMatchObject({
      code: ErrorCode.EMAIL_TAKEN,
    });
  });

  it('validateUser returns the user on a correct password and null otherwise', async () => {
    const { service, prisma } = build();
    const passwordHash = await argon2.hash('Password123!');
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', passwordHash });

    expect(await service.validateUser('a@b.c', 'Password123!')).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(await service.validateUser('a@b.c', 'wrong')).toBeNull();
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await service.validateUser('nobody@b.c', 'Password123!')).toBeNull();
  });

  it('refresh consumes the old jti, rejects reuse, and issues a new pair', async () => {
    const { service, prisma, redis } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const first = await service.login({ id: 'u1', email: 'a@b.c' });

    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(redis.del).toHaveBeenCalledWith(expect.stringMatching(/^refresh:u1:/));

    redis.del.mockResolvedValueOnce(0); // key already consumed
    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      code: ErrorCode.REFRESH_INVALID,
    });
  });

  it('refresh rejects a token signed with the wrong secret', async () => {
    const { service } = build();
    const forged = new JwtService({}).sign({ sub: 'u1', jti: 'x' }, { secret: 'other-secret-0123456789' });
    await expect(service.refresh(forged)).rejects.toBeInstanceOf(AppException);
  });

  it('logout deletes the jti and ignores missing or foreign tokens', async () => {
    const { service, redis } = build();
    const pair = await service.login({ id: 'u1', email: 'a@b.c' });
    await service.logout('u1', pair.refreshToken);
    expect(redis.del).toHaveBeenCalledTimes(1);

    redis.del.mockClear();
    await service.logout('u1', undefined);
    await service.logout('someone-else', pair.refreshToken);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('verifyAccessToken returns the user for a valid token and throws otherwise', async () => {
    const { service } = build();
    const pair = await service.login({ id: 'u1', email: 'a@b.c' });
    expect(await service.verifyAccessToken(pair.accessToken)).toEqual({ id: 'u1', email: 'a@b.c' });
    await expect(service.verifyAccessToken('garbage')).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });
});
