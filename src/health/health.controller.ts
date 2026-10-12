import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

type Status = 'ok' | 'down';

const REDIS_PROBE_TIMEOUT_MS = 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('probe timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<{ postgres: Status; redis: Status }> {
    const [postgres, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then((): Status => 'ok').catch((): Status => 'down'),
      withTimeout(this.redis.ping(), REDIS_PROBE_TIMEOUT_MS)
        .then((reply): Status => (reply === 'PONG' ? 'ok' : 'down'))
        .catch((): Status => 'down'),
    ]);
    if (postgres !== 'ok' || redis !== 'ok') {
      res.status(503);
    }
    return { postgres, redis };
  }
}
