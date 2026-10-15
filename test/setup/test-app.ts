import { execSync } from 'node:child_process';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';
import { configureApp } from '../../src/app.setup';
import { attachContractErrorHandler, enableContractValidation } from '../../src/contract/contract';
import { PrismaService } from '../../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../../src/redis/redis.constants';
// AppModule is imported lazily inside startTestApp(): ConfigModule.forRoot() reads and validates
// process.env the moment app.module is first evaluated, which must happen AFTER the container URLs are set.

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: Redis;
  baseUrl: string;
  stop(): Promise<void>;
}

/**
 * Boots real Postgres + Redis containers, runs migrations, and starts the full Nest app
 * on a random port. Call once per test file in beforeAll; call ctx.stop() in afterAll.
 */
export async function startTestApp(envOverrides: Record<string, string> = {}): Promise<TestContext> {
  const [postgres, redisContainer]: [StartedPostgreSqlContainer, StartedRedisContainer] =
    await Promise.all([
      new PostgreSqlContainer('postgres:17-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: postgres.getConnectionUri(),
    REDIS_URL: redisContainer.getConnectionUrl(),
    JWT_ACCESS_SECRET: 'test-access-secret-0123456789',
    JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
    WEB_ORIGIN: 'http://localhost:5173',
    HOLD_TTL_SECONDS: '300',
    COOKIE_SECURE: 'false',
    THROTTLE_ENABLED: 'false',
    ...envOverrides,
  });

  execSync('pnpm prisma migrate deploy', { env: process.env, stdio: 'pipe' });

  const { AppModule } = await import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  enableContractValidation(app); // every response is checked against contracts/openapi.yaml
  await app.init();
  attachContractErrorHandler(app);
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    prisma: app.get(PrismaService),
    redis: app.get<Redis>(REDIS_CLIENT),
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      await app.close();
      await Promise.all([postgres.stop(), redisContainer.stop()]);
    },
  };
}
