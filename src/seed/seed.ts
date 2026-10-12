import { EventStatus, PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { OPEN_SALES_JOB, openSalesJobId } from '../queue/queue.constants';

const ROWS = ['A', 'B', 'C', 'D', 'E'] as const;
const SEATS_PER_ROW = 10;
const PRICE_BY_ROW: Record<(typeof ROWS)[number], number> = {
  A: 15000,
  B: 12000,
  C: 9000,
  D: 7000,
  E: 5000,
};
const DAY_MS = 24 * 60 * 60 * 1000;

function seatRows() {
  return ROWS.flatMap((rowLabel) =>
    Array.from({ length: SEATS_PER_ROW }, (_, i) => ({
      rowLabel,
      seatNumber: i + 1,
      priceCents: PRICE_BY_ROW[rowLabel],
    })),
  );
}

export interface SeedResult {
  created: boolean;
}

/** Inserts three demo events (on sale / upcoming / closed) with 5 rows × 10 seats each. Idempotent. */
export async function seed(prisma: PrismaClient, queue?: Queue): Promise<SeedResult> {
  const existing = await prisma.event.count();
  if (existing > 0) {
    return { created: false };
  }

  const now = Date.now();
  const events = [
    {
      name: 'Riyadh Jazz Night',
      venueName: 'King Fahd Cultural Centre',
      startsAt: new Date(now + 7 * DAY_MS),
      salesOpenAt: new Date(now - DAY_MS),
      status: EventStatus.on_sale,
    },
    {
      name: 'Comedy Showcase',
      venueName: 'Boulevard Arena',
      startsAt: new Date(now + 14 * DAY_MS),
      salesOpenAt: new Date(now + 2 * 60 * 1000),
      status: EventStatus.upcoming,
    },
    {
      name: 'Spring Orchestra',
      venueName: 'Ithra Theatre',
      startsAt: new Date(now - 2 * DAY_MS),
      salesOpenAt: new Date(now - 30 * DAY_MS),
      status: EventStatus.closed,
    },
  ];

  for (const event of events) {
    const created = await prisma.event.create({ data: { ...event, seats: { create: seatRows() } } });
    if (queue && created.status === EventStatus.upcoming) {
      await queue.add(
        OPEN_SALES_JOB,
        { eventId: created.id },
        {
          jobId: openSalesJobId(created.id),
          delay: Math.max(0, created.salesOpenAt.getTime() - Date.now()),
          removeOnComplete: true,
        },
      );
    }
  }
  return { created: true };
}
