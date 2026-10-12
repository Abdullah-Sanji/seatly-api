import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { HOLDS_QUEUE } from '../queue/queue.constants';
import { parseRedisUrl } from '../redis/redis-url';
import { seed } from './seed';

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required to seed (open-sales jobs are scheduled on the queue)');
  }
  const prisma = new PrismaClient();
  const queue = new Queue(HOLDS_QUEUE, { connection: parseRedisUrl(redisUrl) });
  try {
    const result = await seed(prisma, queue);
    console.log(result.created ? 'Seeded demo events.' : 'Events already exist, nothing to do.');
  } finally {
    await Promise.all([prisma.$disconnect(), queue.close()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
