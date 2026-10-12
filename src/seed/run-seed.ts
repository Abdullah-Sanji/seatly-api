import { PrismaClient } from '@prisma/client';
import { seed } from './seed';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await seed(prisma);
    console.log(result.created ? 'Seeded demo events.' : 'Events already exist, nothing to do.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
