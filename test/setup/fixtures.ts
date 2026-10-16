import { INestApplication } from '@nestjs/common';
import { Event, EventStatus, PrismaClient, Seat } from '@prisma/client';
import request from 'supertest';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface CreateEventOptions {
  status?: EventStatus;
  rows?: number;
  seatsPerRow?: number;
  salesOpenAt?: Date;
  name?: string;
  venueName?: string;
  startsAt?: Date;
}

export type EventWithSeats = Event & { seats: Seat[] };

export async function createEvent(
  prisma: PrismaClient,
  opts: CreateEventOptions = {},
): Promise<EventWithSeats> {
  const rows = opts.rows ?? 2;
  const seatsPerRow = opts.seatsPerRow ?? 5;
  const rowLabels = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
  return prisma.event.create({
    data: {
      name: opts.name ?? 'Test Event',
      venueName: opts.venueName ?? 'Test Hall',
      startsAt: opts.startsAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
      salesOpenAt: opts.salesOpenAt ?? new Date(),
      status: opts.status ?? EventStatus.on_sale,
      seats: {
        create: rowLabels.flatMap((rowLabel) =>
          Array.from({ length: seatsPerRow }, (_, i) => ({
            rowLabel,
            seatNumber: i + 1,
            priceCents: 10000,
          })),
        ),
      },
    },
    include: { seats: { orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }] } },
  });
}

export interface RegisteredUser {
  accessToken: string;
  /** Raw Set-Cookie value for the refresh cookie ('' until auth exists). */
  cookie: string;
}

export async function registerUser(
  app: INestApplication,
  email: string,
  password = 'Password123!',
): Promise<RegisteredUser> {
  const res = await request(app.getHttpServer()).post('/auth/register').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
  const cookie = Array.isArray(setCookie) ? (setCookie[0] ?? '') : (setCookie ?? '');
  return { accessToken: res.body.accessToken as string, cookie };
}
