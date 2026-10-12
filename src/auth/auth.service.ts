import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { refreshKey } from '../common/redis-keys';
import { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_SECONDS } from './auth.constants';
import { AuthUser, JwtAccessPayload, JwtRefreshPayload, TokenPair } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async register(email: string, password: string): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppException(ErrorCode.EMAIL_TAKEN, HttpStatus.CONFLICT, 'Email already registered');
    }
    const passwordHash = await argon2.hash(password);
    let user: { id: string; email: string };
    try {
      user = await this.prisma.user.create({ data: { email, passwordHash } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(ErrorCode.EMAIL_TAKEN, HttpStatus.CONFLICT, 'Email already registered');
      }
      throw error;
    }
    return this.issueTokens({ id: user.id, email: user.email });
  }

  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return null;
    }
    const matches = await argon2.verify(user.passwordHash, password);
    return matches ? { id: user.id, email: user.email } : null;
  }

  login(user: AuthUser): Promise<TokenPair> {
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyRefreshToken(refreshToken);
    // DEL is the atomic "consume": exactly one caller can turn 1 into 0, so a reused token always loses.
    const consumed = await this.redis.del(refreshKey(payload.sub, payload.jti));
    if (consumed === 0) {
      throw this.refreshInvalid();
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw this.refreshInvalid();
    }
    return this.issueTokens({ id: user.id, email: user.email });
  }

  async logout(userId: string, refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      if (payload.sub === userId) {
        await this.redis.del(refreshKey(payload.sub, payload.jti));
      }
    } catch {
      // An invalid token has nothing to revoke.
    }
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    try {
      const payload = await this.jwt.verifyAsync<JwtAccessPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
      });
      return { id: payload.sub, email: payload.email };
    } catch {
      throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, 'Invalid access token');
    }
  }

  private async issueTokens(user: AuthUser): Promise<TokenPair> {
    const jti = randomUUID();
    const accessPayload: JwtAccessPayload = { sub: user.id, email: user.email };
    const refreshPayload: JwtRefreshPayload = { sub: user.id, jti };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      }),
    ]);
    await this.redis.set(refreshKey(user.id, jti), '1', 'EX', REFRESH_TOKEN_TTL_SECONDS);
    return { accessToken, refreshToken, refreshExpiresInSeconds: REFRESH_TOKEN_TTL_SECONDS };
  }

  private async verifyRefreshToken(token: string): Promise<JwtRefreshPayload> {
    try {
      return await this.jwt.verifyAsync<JwtRefreshPayload>(token, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw this.refreshInvalid();
    }
  }

  private refreshInvalid(): AppException {
    return new AppException(ErrorCode.REFRESH_INVALID, HttpStatus.UNAUTHORIZED, 'Refresh token invalid');
  }
}
