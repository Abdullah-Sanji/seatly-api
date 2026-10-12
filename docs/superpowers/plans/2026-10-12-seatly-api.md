# Seatly API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `seatly-api` NestJS service from an empty repo through milestones 1–7 of the spec: skeleton + Docker, auth, events, holds, jobs, confirm, realtime.

**Architecture:** A NestJS 11 monolith. Postgres (via Prisma) is the source of truth for users, events, seats and bookings. Redis holds short-lived seat holds (`SET NX EX` through Lua scripts), the refresh-token allowlist, a 5-second seat-map cache, and the pub/sub channel that fans seat changes out to every Socket.IO gateway instance. BullMQ (on the same Redis) runs delayed `expire-hold` and `open-sales` jobs. Confirming a booking is a Postgres transaction with `SELECT … FOR UPDATE` plus a unique index on `booking_seats.seat_id` as the last line of defense.

**Tech Stack:** Node 22, pnpm, NestJS 11, TypeScript (strict), Prisma 6, PostgreSQL 17, Redis 7, ioredis 5, BullMQ 5 (`@nestjs/bullmq`), Socket.IO 4, Passport (local + jwt), `@nestjs/jwt`, argon2, `@nestjs/throttler` 6 + `@nest-lab/throttler-storage-redis`, zod 3 (env validation), class-validator/class-transformer, `@nestjs/swagger`, Jest 29 + ts-jest, Supertest, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-12-seatly-design.md` (read it first; this plan argues from it).

## Global Constraints

- Repo root is `/Users/sanji/WebstormProjects/seatly-api`. All paths below are relative to it. Branch: `main` (the repo currently holds only the spec commit).
- Node 22, pnpm 11. Never use npm or yarn.
- Prisma **6.x** (`prisma@6`, `@prisma/client@6`) — not 7, so the schema `url = env("DATABASE_URL")` form and `prisma migrate` behaviour match this plan.
- TypeScript `strict: true`; no `any` except where a third-party type forces a cast (comment why).
- Every error response uses the envelope `{ statusCode, code, message, details }` (spec §7).
- Redis key names exactly as spec §4: `hold:{eventId}:{seatId}`, `holds:user:{userId}:{eventId}`, `seatmap:{eventId}`, `refresh:{userId}:{jti}`, channel `events:{eventId}`.
- Hold key value is `"{userId}:{holdToken}"`, `holdToken` = random UUID per hold.
- Hold TTL comes from `HOLD_TTL_SECONDS` (default 300). Max 6 held seats per user per event.
- Refresh cookie name `seatly_refresh`, `httpOnly`, `sameSite=lax`, `path=/auth/refresh`, `secure` from `COOKIE_SECURE` env (default false).
- Access token 15 min, refresh token 7 days.
- BullMQ job ids must not contain `:` — use `.` as the separator (`hold.{eventId}.{seatId}.{holdToken}`, `open-sales.{eventId}`).
- Tests: unit specs live next to code as `*.spec.ts`; e2e specs live in `test/*.e2e-spec.ts` and start real Postgres + Redis via Testcontainers. Docker Desktop must be running for e2e.
- Commit after every task with a conventional message. No `Co-Authored-By` other than `Claude Fable 5.1 <noreply@anthropic.com>`.
- Spec additions made by this plan (error codes the spec's list lacks but the flows need): `EMAIL_TAKEN` (409 on duplicate register), `NOT_FOUND` (unmatched routes), `FORBIDDEN`, `REQUEST_FAILED` (any other 4xx from Nest). Add them to the spec's §7 list in Task 4.

## Review Focus

Inputs the spec implies but no flow states; each line's test is added to the task named.

1. **Two confirms with overlapping seat sets locked in different orders must not deadlock** (Postgres would abort one with a 40P01 → 500). Lock rows `ORDER BY id`. Test in Task 16.
2. **Holding a seat whose id exists but belongs to another event** must be `404 SEAT_NOT_FOUND`, not a hold on the wrong event. Test in Task 13.
3. **Re-holding a seat the same user already holds** must return `409 SEAT_HELD` and must not extend the existing hold's TTL. Test in Task 13.
4. **Register with a malformed body** (bad email, 3-char password, extra fields) must return `400 VALIDATION_FAILED` with `details.errors` listing the messages, and extra fields must be stripped. Test in Task 8.
5. **Logout without a refresh cookie** must still return 204 (idempotent) and not throw. Test in Task 8.

---

## File structure (end state of this plan)

```
.
├── .dockerignore
├── .env.example
├── .gitignore
├── .prettierrc
├── Dockerfile
├── docker/entrypoint.sh
├── docker-compose.yml
├── docker-compose.scale.yml
├── nest-cli.json
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.build.json
├── README.md
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main.ts                         # bootstrap only
│   ├── app.setup.ts                    # configureApp(): pipes, filter, cookies, CORS, swagger (shared with tests)
│   ├── app.module.ts
│   ├── config/env.validation.ts        # zod schema + validateEnv()
│   ├── common/
│   │   ├── redis-keys.ts               # every Redis key/channel builder
│   │   ├── errors/error-code.enum.ts
│   │   ├── errors/app.exception.ts
│   │   ├── filters/app-exception.filter.ts
│   │   └── guards/user-throttler.guard.ts
│   ├── prisma/prisma.module.ts, prisma.service.ts
│   ├── redis/redis.constants.ts, redis-url.ts, redis.module.ts
│   ├── health/health.module.ts, health.controller.ts
│   ├── seed/seed.ts, run-seed.ts
│   ├── auth/
│   │   ├── auth.module.ts, auth.controller.ts, auth.service.ts, auth.types.ts, auth.constants.ts
│   │   ├── dto/register.dto.ts, dto/login.dto.ts
│   │   ├── strategies/local.strategy.ts, strategies/jwt.strategy.ts
│   │   ├── guards/jwt-auth.guard.ts, guards/local-auth.guard.ts, guards/optional-jwt-auth.guard.ts
│   │   └── decorators/current-user.decorator.ts
│   ├── events/events.module.ts, events.controller.ts, events.service.ts, seat-map.ts
│   ├── realtime/realtime.module.ts, messages.ts, event-publisher.ts, realtime.gateway.ts
│   ├── holds/holds.module.ts, holds.service.ts, hold-scripts.ts
│   ├── bookings/bookings.module.ts, bookings.controller.ts, me.controller.ts, bookings.service.ts
│   └── queue/queue.module.ts, queue.constants.ts, holds.queue.ts, holds.processor.ts
└── test/
    ├── jest-e2e.json
    ├── setup/test-app.ts               # startTestApp(): containers + migrations + Nest app
    ├── setup/fixtures.ts               # createEvent(), registerUser(), sleep()
    └── *.e2e-spec.ts
```

---

### Task 1: Project scaffold, env validation, compose for Postgres + Redis

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `.gitignore`, `.prettierrc`, `.env.example`, `.env`, `docker-compose.yml`
- Create: `src/main.ts`, `src/app.setup.ts`, `src/app.module.ts`, `src/config/env.validation.ts`
- Test: `src/config/env.validation.spec.ts`

**Interfaces:**
- Produces: `validateEnv(config: Record<string, unknown>): Env` and type `Env` with fields `NODE_ENV, PORT, DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, WEB_ORIGIN, HOLD_TTL_SECONDS, COOKIE_SECURE (boolean), THROTTLE_ENABLED (boolean)`. Everything later reads config through `ConfigService<Env, true>`.
- Produces: `configureApp(app: INestApplication): void` used by `main.ts` and the e2e harness.

- [ ] **Step 1: Initialise the package and install dependencies**

```bash
cd /Users/sanji/WebstormProjects/seatly-api
pnpm init
pnpm add @nestjs/common@11 @nestjs/core@11 @nestjs/platform-express@11 @nestjs/config@4 @nestjs/swagger@11 \
  @nestjs/passport@11 @nestjs/jwt@11 @nestjs/throttler@6 @nest-lab/throttler-storage-redis@1 \
  @nestjs/bullmq@11 bullmq@5 @nestjs/websockets@11 @nestjs/platform-socket.io@11 socket.io@4 \
  ioredis@5 @prisma/client@6 argon2 class-validator class-transformer \
  passport passport-jwt passport-local cookie-parser reflect-metadata rxjs zod@3
pnpm add -D @nestjs/cli@11 @nestjs/schematics@11 @nestjs/testing@11 prisma@6 typescript@5 ts-node \
  jest@29 ts-jest@29 @types/jest@29 @types/node@22 @types/express @types/passport-jwt @types/passport-local \
  @types/cookie-parser supertest @types/supertest testcontainers @testcontainers/postgresql @testcontainers/redis \
  socket.io-client@4 prettier
```

- [ ] **Step 2: Write `package.json` scripts and jest config**

Replace the generated `package.json` `scripts` block and add `jest`/`prisma` sections (keep the `dependencies`/`devDependencies` pnpm wrote):

```json
{
  "name": "seatly-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "test": "jest",
    "test:e2e": "jest --config test/jest-e2e.json --runInBand",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:seed": "prisma db seed"
  },
  "prisma": {
    "seed": "ts-node src/seed/run-seed.ts"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.ts$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: Write TypeScript, Nest CLI, prettier and ignore files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "declaration": false,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

`tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"]
}
```

`nest-cli.json`:
```json
{
  "$schema": "https://json-schema.org/schema",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

`.prettierrc`:
```json
{ "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

`.gitignore`:
```
node_modules
dist
.env
coverage
```

`.env.example` (and copy it to `.env`):
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://seatly:seatly@localhost:5432/seatly
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=dev-access-secret-change-me-please
JWT_REFRESH_SECRET=dev-refresh-secret-change-me-please
WEB_ORIGIN=http://localhost:5173
HOLD_TTL_SECONDS=300
COOKIE_SECURE=false
THROTTLE_ENABLED=true
```

- [ ] **Step 4: Write `docker-compose.yml` with Postgres and Redis only**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: seatly
      POSTGRES_PASSWORD: seatly
      POSTGRES_DB: seatly
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U seatly -d seatly"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata: {}
  redisdata: {}
```

- [ ] **Step 5: Write the failing env validation test**

`src/config/env.validation.spec.ts`:
```ts
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
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test src/config`
Expected: FAIL with "Cannot find module './env.validation'".

- [ ] **Step 7: Implement env validation**

`src/config/env.validation.ts`:
```ts
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  COOKIE_SECURE: booleanString,
  THROTTLE_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return result.data;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test src/config`
Expected: PASS (3 tests).

- [ ] **Step 9: Write the app module, setup and bootstrap**

`src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
  ],
})
export class AppModule {}
```

`src/app.setup.ts`:
```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Env } from './config/env.validation';

/** Everything that must be applied to the Nest app in both main.ts and e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<Env, true>);
  app.use(cookieParser());
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Seatly API')
    .setDescription('Seat booking playground')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
}
```

`src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  const port = app.get(ConfigService<Env, true>).get('PORT');
  await app.listen(port);
  Logger.log(`Seatly API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
```

- [ ] **Step 10: Build and boot once to prove the scaffold works**

Run:
```bash
pnpm build && docker compose up -d postgres redis
(pnpm start & SERVER=$!; sleep 6; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/docs; kill $SERVER)
```
Expected: build succeeds, output ends with `200` (Swagger UI served).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold NestJS app with env validation and compose for postgres/redis

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Prisma schema, migration, PrismaModule and seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/migrations/*` (generated), `src/prisma/prisma.module.ts`, `src/prisma/prisma.service.ts`, `src/seed/seed.ts`, `src/seed/run-seed.ts`
- Modify: `src/app.module.ts`
- Test: `src/seed/seed.spec.ts`

**Interfaces:**
- Produces: `PrismaService extends PrismaClient` (global provider). Prisma enums `EventStatus` (`upcoming | on_sale | closed`) and `SeatStatus` (`available | sold`). Models `User, Event, Seat, Booking, BookingSeat` with the column mapping below.
- Produces: `seed(prisma: PrismaClient): Promise<{ created: boolean }>` — idempotent.

- [ ] **Step 1: Write the schema**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum EventStatus {
  upcoming
  on_sale
  closed
}

enum SeatStatus {
  available
  sold
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  email        String    @unique
  passwordHash String    @map("password_hash")
  createdAt    DateTime  @default(now()) @map("created_at")
  bookings     Booking[]

  @@map("users")
}

model Event {
  id          String      @id @default(uuid()) @db.Uuid
  name        String
  venueName   String      @map("venue_name")
  startsAt    DateTime    @map("starts_at")
  salesOpenAt DateTime    @map("sales_open_at")
  status      EventStatus @default(upcoming)
  seats       Seat[]
  bookings    Booking[]

  @@map("events")
}

model Seat {
  id          String       @id @default(uuid()) @db.Uuid
  eventId     String       @map("event_id") @db.Uuid
  event       Event        @relation(fields: [eventId], references: [id])
  rowLabel    String       @map("row_label")
  seatNumber  Int          @map("seat_number")
  priceCents  Int          @map("price_cents")
  status      SeatStatus   @default(available)
  bookingSeat BookingSeat?

  @@unique([eventId, rowLabel, seatNumber])
  @@map("seats")
}

model Booking {
  id         String        @id @default(uuid()) @db.Uuid
  userId     String        @map("user_id") @db.Uuid
  user       User          @relation(fields: [userId], references: [id])
  eventId    String        @map("event_id") @db.Uuid
  event      Event         @relation(fields: [eventId], references: [id])
  totalCents Int           @map("total_cents")
  createdAt  DateTime      @default(now()) @map("created_at")
  seats      BookingSeat[]

  @@map("bookings")
}

model BookingSeat {
  bookingId String  @map("booking_id") @db.Uuid
  booking   Booking @relation(fields: [bookingId], references: [id])
  seatId    String  @unique @map("seat_id") @db.Uuid
  seat      Seat    @relation(fields: [seatId], references: [id])

  @@id([bookingId, seatId])
  @@map("booking_seats")
}
```

The `@unique` on `seatId` is the database-level guarantee from spec §4: a seat can appear in at most one booking.

- [ ] **Step 2: Create the migration and generate the client**

Run: `docker compose up -d postgres && pnpm prisma migrate dev --name init`
Expected: `prisma/migrations/<timestamp>_init/migration.sql` created, client generated. Open the SQL and confirm it contains `CREATE UNIQUE INDEX "booking_seats_seat_id_key"`.

- [ ] **Step 3: Write PrismaService and PrismaModule**

`src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

`src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Add `PrismaModule` to the `imports` array in `src/app.module.ts` after `ConfigModule.forRoot(...)`.

- [ ] **Step 4: Write the failing seed test**

`src/seed/seed.spec.ts`:
```ts
import { seed } from './seed';

type PrismaStub = {
  event: { count: jest.Mock; create: jest.Mock };
};

function makePrisma(existingEvents: number): PrismaStub {
  return {
    event: {
      count: jest.fn().mockResolvedValue(existingEvents),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'evt', ...data })),
    },
  };
}

describe('seed', () => {
  it('skips when events already exist', async () => {
    const prisma = makePrisma(3);
    // Cast: the seed only touches prisma.event.count/create, so a stub is enough.
    const result = await seed(prisma as never);
    expect(result.created).toBe(false);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('creates three events with 50 seats each on an empty database', async () => {
    const prisma = makePrisma(0);
    const result = await seed(prisma as never);
    expect(result.created).toBe(true);
    expect(prisma.event.create).toHaveBeenCalledTimes(3);
    const statuses = prisma.event.create.mock.calls.map(([arg]) => arg.data.status).sort();
    expect(statuses).toEqual(['closed', 'on_sale', 'upcoming']);
    for (const [arg] of prisma.event.create.mock.calls) {
      expect(arg.data.seats.create).toHaveLength(50);
    }
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm test src/seed`
Expected: FAIL with "Cannot find module './seed'".

- [ ] **Step 6: Implement the seed**

`src/seed/seed.ts`:
```ts
import { EventStatus, PrismaClient } from '@prisma/client';

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
export async function seed(prisma: PrismaClient): Promise<SeedResult> {
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
    await prisma.event.create({ data: { ...event, seats: { create: seatRows() } } });
  }
  return { created: true };
}
```

`src/seed/run-seed.ts`:
```ts
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
```

- [ ] **Step 7: Run the unit test, then seed the real database**

Run: `pnpm test src/seed`
Expected: PASS (2 tests).

Run: `pnpm prisma:seed && pnpm prisma:seed`
Expected: first prints `Seeded demo events.`, second prints `Events already exist, nothing to do.`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema, initial migration and demo seed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: RedisModule and key builders

**Files:**
- Create: `src/redis/redis.constants.ts`, `src/redis/redis-url.ts`, `src/redis/redis.module.ts`, `src/common/redis-keys.ts`
- Modify: `src/app.module.ts`
- Test: `src/redis/redis-url.spec.ts`, `src/common/redis-keys.spec.ts`

**Interfaces:**
- Produces: injection tokens `REDIS_CLIENT` and `REDIS_SUBSCRIBER` (both `ioredis` `Redis` instances; the subscriber is reserved for pub/sub because a subscribed connection cannot run other commands).
- Produces: `parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number }` for BullMQ.
- Produces key builders: `holdKey(eventId, seatId)`, `userHoldsKey(userId, eventId)`, `seatMapKey(eventId)`, `refreshKey(userId, jti)`, `eventChannel(eventId)`, `EVENT_CHANNEL_PATTERN`, `holdValue(userId, token)`, `holderIdOf(value)`.

- [ ] **Step 1: Write the failing tests**

`src/redis/redis-url.spec.ts`:
```ts
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
```

`src/common/redis-keys.spec.ts`:
```ts
import {
  EVENT_CHANNEL_PATTERN,
  eventChannel,
  holdKey,
  holdValue,
  holderIdOf,
  refreshKey,
  seatMapKey,
  userHoldsKey,
} from './redis-keys';

describe('redis keys', () => {
  it('builds the keys named in the spec', () => {
    expect(holdKey('e1', 's1')).toBe('hold:e1:s1');
    expect(userHoldsKey('u1', 'e1')).toBe('holds:user:u1:e1');
    expect(seatMapKey('e1')).toBe('seatmap:e1');
    expect(refreshKey('u1', 'j1')).toBe('refresh:u1:j1');
    expect(eventChannel('e1')).toBe('events:e1');
    expect(EVENT_CHANNEL_PATTERN).toBe('events:*');
  });

  it('encodes and decodes the hold value', () => {
    const value = holdValue('u1', 'tok');
    expect(value).toBe('u1:tok');
    expect(holderIdOf(value)).toBe('u1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/redis src/common`
Expected: FAIL, both with "Cannot find module".

- [ ] **Step 3: Implement**

`src/redis/redis-url.ts`:
```ts
export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

/** BullMQ wants host/port options, not a URL. */
export function parseRedisUrl(url: string): RedisConnection {
  const parsed = new URL(url);
  const connection: RedisConnection = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };
  if (parsed.password) {
    connection.password = decodeURIComponent(parsed.password);
  }
  const db = parsed.pathname.replace('/', '');
  if (db) {
    connection.db = Number(db);
  }
  return connection;
}
```

`src/redis/redis.constants.ts`:
```ts
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_SUBSCRIBER = Symbol('REDIS_SUBSCRIBER');
```

`src/redis/redis.module.ts`:
```ts
import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Env } from '../config/env.validation';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

function createClient(config: ConfigService<Env, true>): Redis {
  return new Redis(config.get('REDIS_URL'), { maxRetriesPerRequest: null, lazyConnect: false });
}

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, inject: [ConfigService], useFactory: createClient },
    { provide: REDIS_SUBSCRIBER, inject: [ConfigService], useFactory: createClient },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.client.quit(), this.subscriber.quit()]);
  }
}
```

`src/common/redis-keys.ts`:
```ts
export const holdKey = (eventId: string, seatId: string): string => `hold:${eventId}:${seatId}`;
export const userHoldsKey = (userId: string, eventId: string): string =>
  `holds:user:${userId}:${eventId}`;
export const seatMapKey = (eventId: string): string => `seatmap:${eventId}`;
export const refreshKey = (userId: string, jti: string): string => `refresh:${userId}:${jti}`;
export const eventChannel = (eventId: string): string => `events:${eventId}`;
export const EVENT_CHANNEL_PATTERN = 'events:*';

/** Value stored in a hold key: "{userId}:{holdToken}". */
export const holdValue = (userId: string, holdToken: string): string => `${userId}:${holdToken}`;
export const holderIdOf = (value: string): string => value.split(':')[0];
```

Add `RedisModule` to `src/app.module.ts` imports after `PrismaModule`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/redis src/common`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Redis module with client/subscriber providers and key builders

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Error codes, AppException and the global filter

**Files:**
- Create: `src/common/errors/error-code.enum.ts`, `src/common/errors/app.exception.ts`, `src/common/filters/app-exception.filter.ts`
- Modify: `src/app.setup.ts`, `docs/superpowers/specs/2026-10-12-seatly-design.md` (§7 code list)
- Test: `src/common/filters/app-exception.filter.spec.ts`

**Interfaces:**
- Produces: `enum ErrorCode`, `class AppException extends HttpException` with constructor `(code: ErrorCode, status: HttpStatus, message: string, details?: Record<string, unknown>)`, `interface ErrorBody { statusCode; code; message; details }`, pure `toErrorBody(exception: unknown): ErrorBody`, and `AppExceptionFilter` registered globally.

- [ ] **Step 1: Write the failing filter test**

`src/common/filters/app-exception.filter.spec.ts`:
```ts
import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code.enum';
import { toErrorBody } from './app-exception.filter';

describe('toErrorBody', () => {
  it('passes an AppException through unchanged', () => {
    const body = toErrorBody(
      new AppException(ErrorCode.SEAT_HELD, HttpStatus.CONFLICT, 'Seat is held', { seatIds: ['s1'] }),
    );
    expect(body).toEqual({
      statusCode: 409,
      code: 'SEAT_HELD',
      message: 'Seat is held',
      details: { seatIds: ['s1'] },
    });
  });

  it('maps a ValidationPipe BadRequestException to VALIDATION_FAILED with the messages in details', () => {
    const body = toErrorBody(new BadRequestException(['email must be an email', 'password too short']));
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual({ errors: ['email must be an email', 'password too short'] });
  });

  it('maps 404 and 429 to their codes', () => {
    expect(toErrorBody(new NotFoundException()).code).toBe(ErrorCode.NOT_FOUND);
    expect(toErrorBody(new ThrottlerException()).code).toBe(ErrorCode.RATE_LIMITED);
    expect(toErrorBody(new ThrottlerException()).statusCode).toBe(429);
  });

  it('hides internals of unknown errors', () => {
    const body = toErrorBody(new Error('connection string leaked'));
    expect(body).toEqual({
      statusCode: 500,
      code: ErrorCode.INTERNAL,
      message: 'Internal server error',
      details: {},
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/common/filters`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement codes, exception and filter**

`src/common/errors/error-code.enum.ts`:
```ts
export enum ErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  REQUEST_FAILED = 'REQUEST_FAILED',
  REFRESH_INVALID = 'REFRESH_INVALID',
  RATE_LIMITED = 'RATE_LIMITED',
  EMAIL_TAKEN = 'EMAIL_TAKEN',
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  SEAT_NOT_FOUND = 'SEAT_NOT_FOUND',
  SALES_NOT_OPEN = 'SALES_NOT_OPEN',
  SEAT_SOLD = 'SEAT_SOLD',
  SEAT_HELD = 'SEAT_HELD',
  HOLD_LIMIT_REACHED = 'HOLD_LIMIT_REACHED',
  NOT_HOLDER = 'NOT_HOLDER',
  NO_HELD_SEATS = 'NO_HELD_SEATS',
  HOLD_EXPIRED = 'HOLD_EXPIRED',
  INTERNAL = 'INTERNAL',
}
```

`src/common/errors/app.exception.ts`:
```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

export interface ErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details: Record<string, unknown>;
}

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: HttpStatus,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    const body: ErrorBody = { statusCode: status, code, message, details };
    super(body, status);
  }
}
```

`src/common/filters/app-exception.filter.ts`:
```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { AppException, ErrorBody } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code.enum';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  429: ErrorCode.RATE_LIMITED,
};

export function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof AppException) {
    return exception.getResponse() as ErrorBody;
  }
  if (exception instanceof ThrottlerException) {
    return { statusCode: 429, code: ErrorCode.RATE_LIMITED, message: 'Too many requests', details: {} };
  }
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const rawMessage =
      typeof response === 'string'
        ? response
        : ((response as { message?: string | string[] }).message ?? exception.message);
    if (statusCode === 400 && Array.isArray(rawMessage)) {
      return {
        statusCode,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        details: { errors: rawMessage },
      };
    }
    const code =
      statusCode >= 500 ? ErrorCode.INTERNAL : (CODE_BY_STATUS[statusCode] ?? ErrorCode.REQUEST_FAILED);
    return { statusCode, code, message: String(rawMessage), details: {} };
  }
  return { statusCode: 500, code: ErrorCode.INTERNAL, message: 'Internal server error', details: {} };
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = toErrorBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(body.statusCode).json(body);
  }
}
```

In `src/app.setup.ts`, after `app.useGlobalPipes(...)`, add:
```ts
app.useGlobalFilters(new AppExceptionFilter());
```
with the import `import { AppExceptionFilter } from './common/filters/app-exception.filter';`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/common/filters`
Expected: PASS (4 tests).

- [ ] **Step 5: Record the added codes in the spec**

In `docs/superpowers/specs/2026-10-12-seatly-design.md` §7, extend the code list with `EMAIL_TAKEN`, `NOT_FOUND`, `FORBIDDEN`, `REQUEST_FAILED` and add one sentence: "`EMAIL_TAKEN` is returned by register on a duplicate email; `NOT_FOUND`, `FORBIDDEN` and `REQUEST_FAILED` map framework-raised 404/403/other 4xx errors."

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add error code enum, AppException and global error envelope filter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Health endpoint and the e2e harness (Testcontainers)

**Files:**
- Create: `src/health/health.module.ts`, `src/health/health.controller.ts`, `test/jest-e2e.json`, `test/setup/test-app.ts`, `test/setup/fixtures.ts`
- Modify: `src/app.module.ts`
- Test: `test/health.e2e-spec.ts`

**Interfaces:**
- Produces: `startTestApp(envOverrides?: Record<string, string>): Promise<TestContext>` where `TestContext = { app: INestApplication; prisma: PrismaService; redis: Redis; baseUrl: string; stop(): Promise<void> }`. The app is listening on a random port (needed later for sockets).
- Produces: `createEvent(prisma, opts?)` returning the Prisma event with `seats` ordered by row/number; `registerUser(app, email, password?)` returning `{ accessToken: string; cookie: string }` (the cookie is filled from Task 8 on; until then it is `''`); `sleep(ms)`.
- Consumes: `configureApp`, `PrismaService`, `REDIS_CLIENT`.

- [ ] **Step 1: Write the e2e jest config and harness**

`test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testRegex": "test/.*\\.e2e-spec\\.ts$",
  "transform": { "^.+\\.ts$": "ts-jest" },
  "testEnvironment": "node",
  "testTimeout": 120000
}
```

`test/setup/test-app.ts`:
```ts
import { execSync } from 'node:child_process';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';
import { configureApp } from '../../src/app.setup';
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
```

`test/setup/fixtures.ts`:
```ts
import { INestApplication } from '@nestjs/common';
import { Event, EventStatus, PrismaClient, Seat } from '@prisma/client';
import request from 'supertest';

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface CreateEventOptions {
  status?: EventStatus;
  rows?: number;
  seatsPerRow?: number;
  salesOpenAt?: Date;
  name?: string;
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
      venueName: 'Test Hall',
      startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
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
```

- [ ] **Step 2: Write the failing health e2e test**

`test/health.e2e-spec.ts`:
```ts
import request from 'supertest';
import { startTestApp, TestContext } from './setup/test-app';

describe('GET /health', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('reports postgres and redis as ok', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ postgres: 'ok', redis: 'ok' });
  });

  it('serves swagger at /docs', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/docs');
    expect(res.status).toBe(200);
  });

  it('returns the error envelope for an unknown route', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.details).toEqual({});
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test:e2e test/health`
Expected: containers start, then FAIL on the first `it` with status 404 (no health route yet).

- [ ] **Step 4: Implement the health controller**

`src/health/health.controller.ts`:
```ts
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

type Status = 'ok' | 'down';

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
      this.redis
        .ping()
        .then((reply): Status => (reply === 'PONG' ? 'ok' : 'down'))
        .catch((): Status => 'down'),
    ]);
    if (postgres !== 'ok' || redis !== 'ok') {
      res.status(503);
    }
    return { postgres, redis };
  }
}
```

`src/health/health.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

Add `HealthModule` to `src/app.module.ts` imports.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:e2e test/health`
Expected: PASS (3 tests). Takes 10–20 s for container start.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add health endpoint and Testcontainers e2e harness

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Dockerfile, entrypoint and the `api` compose service

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: `docker compose up` brings up postgres, redis and api; api runs migrations and the idempotent seed on boot; `GET http://localhost:3000/health` returns ok.

- [ ] **Step 1: Write the Dockerfile and ignore file**

`.dockerignore`:
```
node_modules
dist
.git
.env
test
docs
coverage
```

`Dockerfile`:
```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /app

FROM base AS deps
# argon2 ships musl prebuilds; the toolchain is a fallback if a prebuild is missing for this arch.
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
RUN pnpm prisma generate

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
# Dev deps are kept on purpose: `prisma` CLI is needed for migrate deploy at boot. Playground trade-off.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
```

`docker/entrypoint.sh`:
```sh
#!/bin/sh
set -e
echo "[entrypoint] applying migrations"
./node_modules/.bin/prisma migrate deploy
echo "[entrypoint] seeding (idempotent)"
node dist/seed/run-seed.js
echo "[entrypoint] starting api"
exec node dist/main.js
```

- [ ] **Step 2: Add the `api` and `web` services to compose**

Append to `services:` in `docker-compose.yml` (keep postgres/redis as written in Task 1):
```yaml
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://seatly:seatly@postgres:5432/seatly
      REDIS_URL: redis://redis:6379
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:-dev-access-secret-change-me-please}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-dev-refresh-secret-change-me-please}
      WEB_ORIGIN: ${WEB_ORIGIN:-http://localhost:8080}
      HOLD_TTL_SECONDS: ${HOLD_TTL_SECONDS:-300}
      COOKIE_SECURE: "false"
      THROTTLE_ENABLED: "true"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  web:
    profiles: ["full"]
    build: ../seatly-web
    ports:
      - "8080:80"
    environment:
      API_URL: http://localhost:3000
    depends_on:
      - api
```

The `web` service is inert until the `seatly-web` repo exists (profile `full` is never started by a plain `docker compose up`).

- [ ] **Step 3: Build and run the full stack**

Run: `docker compose up --build -d api && sleep 15 && curl -s http://localhost:3000/health && echo && docker compose logs api | grep entrypoint`
Expected: `{"postgres":"ok","redis":"ok"}` and the three `[entrypoint]` lines. A second `docker compose restart api` must log `Events already exist, nothing to do.`

Run: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: dockerize the api with migrate-and-seed entrypoint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: AuthService (register, login, refresh rotation, logout)

**Files:**
- Create: `src/auth/auth.types.ts`, `src/auth/auth.constants.ts`, `src/auth/auth.service.ts`, `src/auth/auth.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/auth/auth.service.spec.ts`

**Interfaces:**
- Produces:
  - `interface AuthUser { id: string; email: string }`
  - `interface TokenPair { accessToken: string; refreshToken: string; refreshExpiresInSeconds: number }`
  - `interface JwtAccessPayload { sub: string; email: string }`, `interface JwtRefreshPayload { sub: string; jti: string }`
  - `AuthService.register(email, password): Promise<TokenPair>` (409 `EMAIL_TAKEN` on duplicate)
  - `AuthService.validateUser(email, password): Promise<AuthUser | null>`
  - `AuthService.login(user: AuthUser): Promise<TokenPair>`
  - `AuthService.refresh(refreshToken: string): Promise<TokenPair>` (401 `REFRESH_INVALID` on bad/reused token)
  - `AuthService.logout(userId: string, refreshToken: string | undefined): Promise<void>`
  - `AuthService.verifyAccessToken(token: string): Promise<AuthUser>` (throws `AppException UNAUTHORIZED`) — used by the socket gateway in Task 17.
  - constants `ACCESS_TOKEN_TTL = '15m'`, `REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600`, `REFRESH_COOKIE = 'seatly_refresh'`, `REFRESH_COOKIE_PATH = '/auth/refresh'`.
- Consumes: `PrismaService`, `REDIS_CLIENT`, `refreshKey`, `AppException`, `ErrorCode`.

- [ ] **Step 1: Write types and constants**

`src/auth/auth.types.ts`:
```ts
export interface AuthUser {
  id: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresInSeconds: number;
}

export interface JwtAccessPayload {
  sub: string;
  email: string;
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
}
```

`src/auth/auth.constants.ts`:
```ts
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600;
export const REFRESH_COOKIE = 'seatly_refresh';
export const REFRESH_COOKIE_PATH = '/auth/refresh';
```

- [ ] **Step 2: Write the failing service test**

`src/auth/auth.service.spec.ts`:
```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test src/auth`
Expected: FAIL with "Cannot find module './auth.service'".

- [ ] **Step 4: Implement AuthService and AuthModule**

`src/auth/auth.service.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
    const user = await this.prisma.user.create({ data: { email, passwordHash } });
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
```

`src/auth/auth.module.ts` (controller and strategies are added in Task 8):
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

Add `AuthModule` to `src/app.module.ts` imports.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/auth`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add AuthService with argon2 hashing and Redis-backed refresh rotation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Auth HTTP layer: DTOs, strategies, guards, cookie, throttling

**Files:**
- Create: `src/auth/dto/register.dto.ts`, `src/auth/dto/login.dto.ts`, `src/auth/strategies/local.strategy.ts`, `src/auth/strategies/jwt.strategy.ts`, `src/auth/guards/jwt-auth.guard.ts`, `src/auth/guards/local-auth.guard.ts`, `src/auth/guards/optional-jwt-auth.guard.ts`, `src/auth/decorators/current-user.decorator.ts`, `src/auth/auth.controller.ts`, `src/common/guards/user-throttler.guard.ts`
- Modify: `src/auth/auth.module.ts`, `src/app.module.ts`
- Test: `test/auth.e2e-spec.ts`, `test/throttle.e2e-spec.ts`

**Interfaces:**
- Produces: guards `JwtAuthGuard` (401 when missing/invalid), `OptionalJwtAuthGuard` (sets `req.user` or `null`, never fails), `LocalAuthGuard`; decorator `@CurrentUser()` returning `AuthUser` (or `null` under the optional guard); `UserThrottlerGuard` (tracks by `req.user.id`, falling back to IP; must run after `JwtAuthGuard`).
- Produces: routes `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` as in spec §6.
- Produces: `ThrottlerModule` registered globally with Redis storage and `skipIf` tied to `THROTTLE_ENABLED`; default limiter 100/min (overridden per route with `@Throttle`).

- [ ] **Step 1: Write the failing auth e2e test**

`test/auth.e2e-spec.ts`:
```ts
import request from 'supertest';
import { registerUser } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('auth', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('register returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await http().post('/auth/register').send({ email: 'one@test.dev', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: expect.any(String) });
    const cookie = String(res.headers['set-cookie'][0]);
    expect(cookie).toMatch(/^seatly_refresh=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/auth\/refresh/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('register validates the body and strips unknown fields', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'abc', role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('email'), expect.stringContaining('password')]),
    );
  });

  it('register rejects a duplicate email', async () => {
    await registerUser(ctx.app, 'dup@test.dev');
    const res = await http().post('/auth/register').send({ email: 'dup@test.dev', password: 'Password123!' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('login succeeds with the right password and fails with the wrong one', async () => {
    await registerUser(ctx.app, 'login@test.dev', 'Password123!');
    const ok = await http().post('/auth/login').send({ email: 'login@test.dev', password: 'Password123!' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));

    const bad = await http().post('/auth/login').send({ email: 'login@test.dev', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('UNAUTHORIZED');
  });

  it('refresh rotates the cookie and rejects reuse of the old one', async () => {
    const { cookie } = await registerUser(ctx.app, 'rotate@test.dev');

    const first = await http().post('/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toEqual(expect.any(String));
    const rotated = String(first.headers['set-cookie'][0]);
    expect(rotated).not.toBe(cookie);

    const reuse = await http().post('/auth/refresh').set('Cookie', cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('REFRESH_INVALID');

    const again = await http().post('/auth/refresh').set('Cookie', rotated);
    expect(again.status).toBe(200);
  });

  it('refresh without a cookie is REFRESH_INVALID', async () => {
    const res = await http().post('/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('REFRESH_INVALID');
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const { accessToken, cookie } = await registerUser(ctx.app, 'logout@test.dev');
    const res = await http()
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'][0])).toMatch(/seatly_refresh=;/);

    const refresh = await http().post('/auth/refresh').set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });

  it('logout without a cookie is still 204', async () => {
    const { accessToken } = await registerUser(ctx.app, 'logout2@test.dev');
    const res = await http().post('/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(204);
  });

  it('protected routes reject a missing or bad bearer token', async () => {
    const missing = await http().post('/auth/logout');
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('UNAUTHORIZED');
    const bad = await http().post('/auth/logout').set('Authorization', 'Bearer nope');
    expect(bad.status).toBe(401);
  });
});
```

`test/throttle.e2e-spec.ts`:
```ts
import request from 'supertest';
import { startTestApp, TestContext } from './setup/test-app';

describe('throttling', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp({ THROTTLE_ENABLED: 'true' });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('limits login to 5 attempts per minute per IP', async () => {
    const attempt = () =>
      request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@test.dev', password: 'whatever1' });
    for (let i = 0; i < 5; i += 1) {
      expect((await attempt()).status).toBe(401);
    }
    const sixth = await attempt();
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('RATE_LIMITED');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:e2e test/auth test/throttle`
Expected: FAIL (404s, no auth routes).

- [ ] **Step 3: Implement DTOs, strategies, guards and decorator**

`src/auth/dto/register.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
```

`src/auth/dto/login.dto.ts` (Swagger only; the local strategy reads the raw body):
```ts
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @ApiProperty()
  password: string;
}
```

`src/auth/strategies/local.strategy.ts`:
```ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AuthService } from '../auth.service';
import { AuthUser } from '../auth.types';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<AuthUser> {
    const user = await this.auth.validateUser(email, password);
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, 'Invalid credentials');
    }
    return user;
  }
}
```

`src/auth/strategies/jwt.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Env } from '../../config/env.validation';
import { AuthUser, JwtAccessPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtAccessPayload): AuthUser {
    return { id: payload.sub, email: payload.email };
  }
}
```

`src/auth/guards/jwt-auth.guard.ts`:
```ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AuthUser } from '../auth.types';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthUser>(err: unknown, user: AuthUser | false): TUser {
    if (err || !user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, 'Authentication required');
    }
    return user as TUser;
  }
}
```

`src/auth/guards/optional-jwt-auth.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../auth.types';

/** Sets req.user when a valid bearer token is present; never rejects the request. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthUser | null>(_err: unknown, user: AuthUser | false): TUser {
    return (user || null) as TUser;
  }
}
```

`src/auth/guards/local-auth.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
```

`src/auth/decorators/current-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | null => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return request.user ?? null;
  },
);
```

`src/common/guards/user-throttler.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser } from '../../auth/auth.types';

/** Rate-limits per authenticated user. Place it AFTER JwtAuthGuard in @UseGuards. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: { user?: AuthUser; ip: string }): Promise<string> {
    return req.user?.id ?? req.ip;
  }
}
```

- [ ] **Step 4: Implement the controller and wire the module**

`src/auth/auth.controller.ts`:
```ts
import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { Env } from '../config/env.validation';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './auth.constants';
import { AuthService } from './auth.service';
import { AuthUser, TokenPair } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';

const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle(LOGIN_THROTTLE)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.auth.register(dto.email, dto.password);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard, LocalAuthGuard)
  @Throttle(LOGIN_THROTTLE)
  @ApiBody({ type: LoginDto })
  async login(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.auth.login(user);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const token = this.readRefreshCookie(req);
    if (!token) {
      throw new AppException(ErrorCode.REFRESH_INVALID, HttpStatus.UNAUTHORIZED, 'Missing refresh token');
    }
    const tokens = await this.auth.refresh(token);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.id, this.readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private setRefreshCookie(res: Response, tokens: TokenPair): void {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOptions(),
      maxAge: tokens.refreshExpiresInSeconds * 1000,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'lax' as const,
      path: REFRESH_COOKIE_PATH,
    };
  }
}
```

Replace `src/auth/auth.module.ts` with:
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

Replace `src/app.module.ts` with (adds the global ThrottlerModule):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { AuthModule } from './auth/auth.module';
import { Env, validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { REDIS_CLIENT } from './redis/redis.constants';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService<Env, true>, redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(redis),
        skipIf: () => !config.get('THROTTLE_ENABLED'),
      }),
    }),
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:e2e test/auth test/throttle`
Expected: PASS (9 + 1 tests).

Run: `pnpm test`
Expected: all unit suites still PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add auth endpoints with Passport strategies, refresh cookie and Redis throttling

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Seat map pure functions and EventsService

**Files:**
- Create: `src/events/seat-map.ts`, `src/events/events.service.ts`, `src/events/events.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/events/seat-map.spec.ts`

**Interfaces:**
- Produces types (in `seat-map.ts`):
  - `type SeatState = 'available' | 'held' | 'held_by_me' | 'sold'`
  - `interface SeatView { id; rowLabel; seatNumber; priceCents; state: SeatState }`
  - `interface EventSummary { id; name; venueName; startsAt: string; salesOpenAt: string; status: EventStatus; availableCount: number }`
  - `interface EventDetail extends EventSummary { seats: SeatView[] }`
  - `interface CachedSeat { id; rowLabel; seatNumber; priceCents; sold: boolean; holderId: string | null }`
  - `interface CachedSeatMap { event: Omit<EventSummary, 'availableCount'>; seats: CachedSeat[] }`
  - `toSeatMapCache(event: Event & { seats: Seat[] }, holdValues: (string | null)[]): CachedSeatMap`
  - `personaliseSeatMap(cache: CachedSeatMap, viewerId: string | null): EventDetail`
- Produces: `EventsService.listEvents(): Promise<EventSummary[]>`, `EventsService.getEventDetail(eventId, viewerId: string | null): Promise<EventDetail>` (404 `EVENT_NOT_FOUND`), `EventsService.getEventOrThrow(eventId): Promise<Event>`.
- Consumes: `PrismaService`, `REDIS_CLIENT`, `holdKey`, `seatMapKey`, `holderIdOf`.

- [ ] **Step 1: Write the failing pure-function tests**

`src/events/seat-map.spec.ts`:
```ts
import { Event, EventStatus, Seat, SeatStatus } from '@prisma/client';
import { personaliseSeatMap, toSeatMapCache } from './seat-map';

const event: Event = {
  id: 'e1',
  name: 'Show',
  venueName: 'Hall',
  startsAt: new Date('2026-11-01T19:00:00Z'),
  salesOpenAt: new Date('2026-10-01T09:00:00Z'),
  status: EventStatus.on_sale,
};

function seat(id: string, status: SeatStatus = SeatStatus.available): Seat {
  return { id, eventId: 'e1', rowLabel: 'A', seatNumber: Number(id.slice(1)), priceCents: 100, status };
}

describe('toSeatMapCache', () => {
  it('records sold flags and holder ids from the hold values', () => {
    const cache = toSeatMapCache({ ...event, seats: [seat('s1'), seat('s2', SeatStatus.sold), seat('s3')] }, [
      'u9:token',
      null,
      null,
    ]);
    expect(cache.event).toEqual({
      id: 'e1',
      name: 'Show',
      venueName: 'Hall',
      startsAt: '2026-11-01T19:00:00.000Z',
      salesOpenAt: '2026-10-01T09:00:00.000Z',
      status: 'on_sale',
    });
    expect(cache.seats.map((s) => [s.id, s.sold, s.holderId])).toEqual([
      ['s1', false, 'u9'],
      ['s2', true, null],
      ['s3', false, null],
    ]);
  });
});

describe('personaliseSeatMap', () => {
  const cache = toSeatMapCache(
    { ...event, seats: [seat('s1'), seat('s2', SeatStatus.sold), seat('s3'), seat('s4')] },
    ['u9:token', null, 'u1:token', null],
  );

  it('marks the viewer’s own holds as held_by_me and others as held', () => {
    const detail = personaliseSeatMap(cache, 'u1');
    expect(detail.seats.map((s) => s.state)).toEqual(['held', 'sold', 'held_by_me', 'available']);
    expect(detail.availableCount).toBe(1);
  });

  it('shows every hold as held for an anonymous viewer', () => {
    const detail = personaliseSeatMap(cache, null);
    expect(detail.seats.map((s) => s.state)).toEqual(['held', 'sold', 'held', 'available']);
  });

  it('never leaks holder ids', () => {
    const detail = personaliseSeatMap(cache, 'u1');
    expect(JSON.stringify(detail)).not.toContain('u9');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/events`
Expected: FAIL with "Cannot find module './seat-map'".

- [ ] **Step 3: Implement the pure functions**

`src/events/seat-map.ts`:
```ts
import { Event, EventStatus, Seat, SeatStatus } from '@prisma/client';
import { holderIdOf } from '../common/redis-keys';

export type SeatState = 'available' | 'held' | 'held_by_me' | 'sold';

export interface SeatView {
  id: string;
  rowLabel: string;
  seatNumber: number;
  priceCents: number;
  state: SeatState;
}

export interface EventSummary {
  id: string;
  name: string;
  venueName: string;
  startsAt: string;
  salesOpenAt: string;
  status: EventStatus;
  availableCount: number;
}

export interface EventDetail extends EventSummary {
  seats: SeatView[];
}

export interface CachedSeat {
  id: string;
  rowLabel: string;
  seatNumber: number;
  priceCents: number;
  sold: boolean;
  holderId: string | null;
}

/** User-agnostic snapshot stored in Redis under seatmap:{eventId}. */
export interface CachedSeatMap {
  event: Omit<EventSummary, 'availableCount'>;
  seats: CachedSeat[];
}

export function toSeatMapCache(
  event: Event & { seats: Seat[] },
  holdValues: (string | null)[],
): CachedSeatMap {
  return {
    event: {
      id: event.id,
      name: event.name,
      venueName: event.venueName,
      startsAt: event.startsAt.toISOString(),
      salesOpenAt: event.salesOpenAt.toISOString(),
      status: event.status,
    },
    seats: event.seats.map((seat, index) => {
      const value = holdValues[index];
      return {
        id: seat.id,
        rowLabel: seat.rowLabel,
        seatNumber: seat.seatNumber,
        priceCents: seat.priceCents,
        sold: seat.status === SeatStatus.sold,
        holderId: value ? holderIdOf(value) : null,
      };
    }),
  };
}

function stateOf(seat: CachedSeat, viewerId: string | null): SeatState {
  if (seat.sold) return 'sold';
  if (seat.holderId === null) return 'available';
  return viewerId !== null && seat.holderId === viewerId ? 'held_by_me' : 'held';
}

export function personaliseSeatMap(cache: CachedSeatMap, viewerId: string | null): EventDetail {
  const seats = cache.seats.map(
    (seat): SeatView => ({
      id: seat.id,
      rowLabel: seat.rowLabel,
      seatNumber: seat.seatNumber,
      priceCents: seat.priceCents,
      state: stateOf(seat, viewerId),
    }),
  );
  return {
    ...cache.event,
    availableCount: seats.filter((seat) => seat.state === 'available').length,
    seats,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/events`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement EventsService and EventsModule**

`src/events/events.service.ts`:
```ts
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';
import Redis from 'ioredis';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { holdKey, seatMapKey } from '../common/redis-keys';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { CachedSeatMap, EventDetail, EventSummary, personaliseSeatMap, toSeatMapCache } from './seat-map';

const SEAT_MAP_CACHE_SECONDS = 5;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async listEvents(): Promise<EventSummary[]> {
    const events = await this.prisma.event.findMany({ orderBy: { startsAt: 'asc' }, select: { id: true } });
    const details = await Promise.all(events.map((event) => this.getEventDetail(event.id, null)));
    return details.map(({ seats: _seats, ...summary }) => summary);
  }

  async getEventDetail(eventId: string, viewerId: string | null): Promise<EventDetail> {
    const cached = await this.redis.get(seatMapKey(eventId));
    const cache: CachedSeatMap = cached
      ? (JSON.parse(cached) as CachedSeatMap)
      : await this.buildAndCache(eventId);
    return personaliseSeatMap(cache, viewerId);
  }

  async getEventOrThrow(eventId: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new AppException(ErrorCode.EVENT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Event not found');
    }
    return event;
  }

  private async buildAndCache(eventId: string): Promise<CachedSeatMap> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { seats: { orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }] } },
    });
    if (!event) {
      throw new AppException(ErrorCode.EVENT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Event not found');
    }
    const holdValues =
      event.seats.length === 0
        ? []
        : await this.redis.mget(...event.seats.map((seat) => holdKey(eventId, seat.id)));
    const cache = toSeatMapCache(event, holdValues);
    await this.redis.set(seatMapKey(eventId), JSON.stringify(cache), 'EX', SEAT_MAP_CACHE_SECONDS);
    return cache;
  }
}
```

`src/events/events.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { EventsService } from './events.service';

@Module({
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
```

Add `EventsModule` to `src/app.module.ts` imports after `AuthModule`.

- [ ] **Step 6: Build to check types, then commit**

Run: `pnpm build`
Expected: no errors.

```bash
git add -A
git commit -m "feat: add seat map merge logic and EventsService with Redis cache

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Events endpoints

**Files:**
- Create: `src/events/events.controller.ts`
- Modify: `src/events/events.module.ts`
- Test: `test/events.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /events` → `EventSummary[]`; `GET /events/:id` → `EventDetail` with `held_by_me` only for the authenticated viewer. Non-UUID id → 400, unknown id → 404 `EVENT_NOT_FOUND`.
- Consumes: `EventsService`, `OptionalJwtAuthGuard`, `CurrentUser`, `holdKey`, `holdValue`.

- [ ] **Step 1: Write the failing e2e test**

`test/events.e2e-spec.ts`:
```ts
import request from 'supertest';
import { holdKey, holdValue } from '../src/common/redis-keys';
import { createEvent, registerUser } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('events', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('lists events with available counts, ordered by start', async () => {
    await createEvent(ctx.prisma, { name: 'B', rows: 1, seatsPerRow: 3 });
    await createEvent(ctx.prisma, { name: 'A', rows: 1, seatsPerRow: 2, status: 'upcoming' });
    const res = await http().get('/events');
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.map((e: { name: string }) => [e.name, e]));
    expect(byName.B.availableCount).toBe(3);
    expect(byName.A.status).toBe('upcoming');
    expect(byName.A.seats).toBeUndefined();
  });

  it('returns the seat map with held / held_by_me / sold states', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 4 });
    const [s1, s2, s3] = event.seats;
    const me = await registerUser(ctx.app, 'viewer@test.dev');
    const meId = JSON.parse(Buffer.from(me.accessToken.split('.')[1], 'base64url').toString()).sub;

    await ctx.prisma.seat.update({ where: { id: s1.id }, data: { status: 'sold' } });
    await ctx.redis.set(holdKey(event.id, s2.id), holdValue('someone-else', 'tok'), 'EX', 60);
    await ctx.redis.set(holdKey(event.id, s3.id), holdValue(meId, 'tok'), 'EX', 60);

    const anon = await http().get(`/events/${event.id}`);
    expect(anon.status).toBe(200);
    expect(anon.body.seats.map((s: { state: string }) => s.state)).toEqual([
      'sold',
      'held',
      'held',
      'available',
    ]);
    expect(anon.body.availableCount).toBe(1);

    const mine = await http().get(`/events/${event.id}`).set('Authorization', `Bearer ${me.accessToken}`);
    expect(mine.body.seats.map((s: { state: string }) => s.state)).toEqual([
      'sold',
      'held',
      'held_by_me',
      'available',
    ]);
  });

  it('validates the id and reports unknown events', async () => {
    expect((await http().get('/events/not-a-uuid')).status).toBe(400);
    const missing = await http().get('/events/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('EVENT_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:e2e test/events`
Expected: FAIL with 404 on `/events`.

- [ ] **Step 3: Implement the controller**

`src/events/events.controller.ts`:
```ts
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { EventsService } from './events.service';
import { EventDetail, EventSummary } from './seat-map';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(): Promise<EventSummary[]> {
    return this.events.listEvents();
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser | null,
  ): Promise<EventDetail> {
    return this.events.getEventDetail(id, user?.id ?? null);
  }
}
```

Add `controllers: [EventsController]` to `src/events/events.module.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:e2e test/events`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add events list and seat map endpoints

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: EventPublisher (cache invalidation + Redis pub/sub)

**Files:**
- Create: `src/realtime/messages.ts`, `src/realtime/event-publisher.ts`, `src/realtime/realtime.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/realtime/event-publisher.spec.ts`

**Interfaces:**
- Produces (in `messages.ts`):
  - `type SeatUpdateType = 'held' | 'released' | 'sold'`
  - `interface SeatUpdateMessage { type: SeatUpdateType; seatIds: string[]; expiresAt?: string }`
  - `interface SalesOpenedMessage { type: 'sales_opened' }`
  - `type EventMessage = SeatUpdateMessage | SalesOpenedMessage`
- Produces: `EventPublisher.publish(eventId: string, message: EventMessage): Promise<void>` — deletes `seatmap:{eventId}` then `PUBLISH events:{eventId} <json>`. Every seat-state change in the system goes through this one method.
- `RealtimeModule` exports `EventPublisher`; the gateway joins this module in Task 17.

- [ ] **Step 1: Write the failing test**

`src/realtime/event-publisher.spec.ts`:
```ts
import { EventPublisher } from './event-publisher';

describe('EventPublisher', () => {
  it('invalidates the seat map cache and publishes JSON on the event channel', async () => {
    const redis = { del: jest.fn().mockResolvedValue(1), publish: jest.fn().mockResolvedValue(2) };
    const publisher = new EventPublisher(redis as never);

    await publisher.publish('e1', { type: 'held', seatIds: ['s1'], expiresAt: '2026-10-12T10:00:00.000Z' });

    expect(redis.del).toHaveBeenCalledWith('seatmap:e1');
    expect(redis.publish).toHaveBeenCalledWith(
      'events:e1',
      JSON.stringify({ type: 'held', seatIds: ['s1'], expiresAt: '2026-10-12T10:00:00.000Z' }),
    );
    expect(redis.del.mock.invocationCallOrder[0]).toBeLessThan(redis.publish.mock.invocationCallOrder[0]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/realtime`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

`src/realtime/messages.ts`:
```ts
export type SeatUpdateType = 'held' | 'released' | 'sold';

export interface SeatUpdateMessage {
  type: SeatUpdateType;
  seatIds: string[];
  expiresAt?: string;
}

export interface SalesOpenedMessage {
  type: 'sales_opened';
}

export type EventMessage = SeatUpdateMessage | SalesOpenedMessage;
```

`src/realtime/event-publisher.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { eventChannel, seatMapKey } from '../common/redis-keys';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { EventMessage } from './messages';

/** The single exit point for seat-state changes: drop the cached map, then tell every gateway. */
@Injectable()
export class EventPublisher {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publish(eventId: string, message: EventMessage): Promise<void> {
    await this.redis.del(seatMapKey(eventId));
    await this.redis.publish(eventChannel(eventId), JSON.stringify(message));
  }
}
```

`src/realtime/realtime.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { EventPublisher } from './event-publisher';

@Module({
  providers: [EventPublisher],
  exports: [EventPublisher],
})
export class RealtimeModule {}
```

Add `RealtimeModule` to `src/app.module.ts` imports.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/realtime`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add EventPublisher for cache invalidation and Redis pub/sub

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: HoldsService with atomic Lua scripts

**Files:**
- Create: `src/holds/hold-scripts.ts`, `src/holds/holds.service.ts`, `src/holds/holds.module.ts`
- Modify: `src/app.module.ts`
- Test: `test/holds.e2e-spec.ts` (runs against the real Redis container; Lua cannot be unit-tested with mocks)

**Interfaces:**
- Produces:
  - `const MAX_HELD_SEATS_PER_EVENT = 6`
  - `type HoldResult = { outcome: 'held'; holdToken: string; expiresAt: Date } | { outcome: 'seat_held' } | { outcome: 'limit_reached' }`
  - `HoldsService.tryHold(eventId, seatId, userId): Promise<HoldResult>`
  - `HoldsService.release(eventId, seatId, userId): Promise<boolean>` — true only if the caller held it
  - `HoldsService.expire(eventId, seatId, userId, holdToken): Promise<boolean>` — true only if the key still carries exactly this value
  - `HoldsService.getHeldSeatIds(eventId, userId): Promise<string[]>`
  - `HoldsService.getHoldValues(eventId, seatIds: string[]): Promise<(string | null)[]>`
  - `HoldsService.clearHolds(eventId, userId, seatIds: string[]): Promise<void>` — deletes the given hold keys and the user set (used after a successful confirm)
  - `HoldsService.ttlSeconds: number`
- Consumes: `REDIS_CLIENT`, `ConfigService` (`HOLD_TTL_SECONDS`), key builders.

- [ ] **Step 1: Write the Lua scripts**

`src/holds/hold-scripts.ts`:
```ts
/**
 * KEYS[1] = hold:{eventId}:{seatId}
 * KEYS[2] = holds:user:{userId}:{eventId}
 * ARGV[1] = "{userId}:{holdToken}"   ARGV[2] = ttl seconds   ARGV[3] = seatId   ARGV[4] = max seats
 * Returns 1 = held, 0 = someone (maybe you) already holds it, -1 = user is at the limit.
 */
export const HOLD_LUA = `
if redis.call('SCARD', KEYS[2]) >= tonumber(ARGV[4]) then
  return -1
end
local ok = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])
if not ok then
  return 0
end
redis.call('SADD', KEYS[2], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1
`;

/**
 * KEYS[1] = hold key   KEYS[2] = user set
 * ARGV[1] = userId     ARGV[2] = seatId
 * Deletes the hold only if its value starts with "{userId}:". Returns 1 if deleted.
 */
export const RELEASE_LUA = `
local v = redis.call('GET', KEYS[1])
if not v then
  return 0
end
local prefix = ARGV[1] .. ':'
if string.sub(v, 1, string.len(prefix)) ~= prefix then
  return 0
end
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[2])
return 1
`;

/**
 * KEYS[1] = hold key   KEYS[2] = user set
 * ARGV[1] = expected value "{userId}:{holdToken}"   ARGV[2] = seatId
 * Deletes the hold only if the value matches exactly, so a stale job never removes a newer hold.
 */
export const EXPIRE_LUA = `
local v = redis.call('GET', KEYS[1])
if v ~= ARGV[1] then
  return 0
end
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[2])
return 1
`;
```

- [ ] **Step 2: Write the failing e2e test**

`test/holds.e2e-spec.ts`:
```ts
import { holdKey, userHoldsKey } from '../src/common/redis-keys';
import { HoldsService, MAX_HELD_SEATS_PER_EVENT } from '../src/holds/holds.service';
import { startTestApp, TestContext } from './setup/test-app';

describe('HoldsService (real Redis)', () => {
  let ctx: TestContext;
  let holds: HoldsService;

  beforeAll(async () => {
    ctx = await startTestApp({ HOLD_TTL_SECONDS: '60' });
    holds = ctx.app.get(HoldsService);
  });

  afterAll(async () => {
    await ctx.stop();
  });

  afterEach(async () => {
    await ctx.redis.flushall();
  });

  it('grants a hold once and reports seat_held to everyone after, including the holder', async () => {
    const first = await holds.tryHold('e1', 's1', 'u1');
    expect(first.outcome).toBe('held');
    expect(await holds.tryHold('e1', 's1', 'u2')).toEqual({ outcome: 'seat_held' });
    expect(await holds.tryHold('e1', 's1', 'u1')).toEqual({ outcome: 'seat_held' });

    expect(await ctx.redis.ttl(holdKey('e1', 's1'))).toBeGreaterThan(55);
    expect(await holds.getHeldSeatIds('e1', 'u1')).toEqual(['s1']);
  });

  it('only the holder can release, and release clears the user set entry', async () => {
    await holds.tryHold('e1', 's1', 'u1');
    expect(await holds.release('e1', 's1', 'u2')).toBe(false);
    expect(await holds.release('e1', 's1', 'u1')).toBe(true);
    expect(await ctx.redis.exists(holdKey('e1', 's1'))).toBe(0);
    expect(await holds.getHeldSeatIds('e1', 'u1')).toEqual([]);
    expect(await holds.release('e1', 's1', 'u1')).toBe(false);
  });

  it('enforces the per-event limit atomically', async () => {
    for (let i = 0; i < MAX_HELD_SEATS_PER_EVENT; i += 1) {
      expect((await holds.tryHold('e1', `s${i}`, 'u1')).outcome).toBe('held');
    }
    expect(await holds.tryHold('e1', 'extra', 'u1')).toEqual({ outcome: 'limit_reached' });
    expect((await holds.tryHold('e2', 'other-event', 'u1')).outcome).toBe('held');
  });

  it('expire removes the hold only when the token matches', async () => {
    const result = await holds.tryHold('e1', 's1', 'u1');
    if (result.outcome !== 'held') throw new Error('expected held');

    expect(await holds.expire('e1', 's1', 'u1', 'stale-token')).toBe(false);
    expect(await ctx.redis.exists(holdKey('e1', 's1'))).toBe(1);

    expect(await holds.expire('e1', 's1', 'u1', result.holdToken)).toBe(true);
    expect(await ctx.redis.exists(holdKey('e1', 's1'))).toBe(0);
    expect(await ctx.redis.sismember(userHoldsKey('u1', 'e1'), 's1')).toBe(0);
  });

  it('getHoldValues and clearHolds work on a batch', async () => {
    await holds.tryHold('e1', 's1', 'u1');
    await holds.tryHold('e1', 's2', 'u1');
    const values = await holds.getHoldValues('e1', ['s1', 's2', 's3']);
    expect(values[0]).toMatch(/^u1:/);
    expect(values[1]).toMatch(/^u1:/);
    expect(values[2]).toBeNull();

    await holds.clearHolds('e1', 'u1', ['s1', 's2']);
    expect(await ctx.redis.exists(holdKey('e1', 's1'), holdKey('e1', 's2'), userHoldsKey('u1', 'e1'))).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test:e2e test/holds`
Expected: FAIL with "Cannot find module '../src/holds/holds.service'".

- [ ] **Step 4: Implement HoldsService and HoldsModule**

`src/holds/holds.service.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { holdKey, holdValue, userHoldsKey } from '../common/redis-keys';
import { Env } from '../config/env.validation';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { EXPIRE_LUA, HOLD_LUA, RELEASE_LUA } from './hold-scripts';

export const MAX_HELD_SEATS_PER_EVENT = 6;

export type HoldResult =
  | { outcome: 'held'; holdToken: string; expiresAt: Date }
  | { outcome: 'seat_held' }
  | { outcome: 'limit_reached' };

/** ioredis adds defineCommand() results as methods at runtime; this interface types them. */
interface HoldCommands {
  seatlyHold(
    holdKey: string,
    userSetKey: string,
    value: string,
    ttl: number,
    seatId: string,
    maxSeats: number,
  ): Promise<number>;
  seatlyRelease(holdKey: string, userSetKey: string, userId: string, seatId: string): Promise<number>;
  seatlyExpire(holdKey: string, userSetKey: string, expected: string, seatId: string): Promise<number>;
}

@Injectable()
export class HoldsService {
  readonly ttlSeconds: number;
  private readonly scripted: Redis & HoldCommands;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSeconds = config.get('HOLD_TTL_SECONDS');
    redis.defineCommand('seatlyHold', { numberOfKeys: 2, lua: HOLD_LUA });
    redis.defineCommand('seatlyRelease', { numberOfKeys: 2, lua: RELEASE_LUA });
    redis.defineCommand('seatlyExpire', { numberOfKeys: 2, lua: EXPIRE_LUA });
    this.scripted = redis as Redis & HoldCommands;
  }

  async tryHold(eventId: string, seatId: string, userId: string): Promise<HoldResult> {
    const holdToken = randomUUID();
    const result = await this.scripted.seatlyHold(
      holdKey(eventId, seatId),
      userHoldsKey(userId, eventId),
      holdValue(userId, holdToken),
      this.ttlSeconds,
      seatId,
      MAX_HELD_SEATS_PER_EVENT,
    );
    if (result === -1) return { outcome: 'limit_reached' };
    if (result === 0) return { outcome: 'seat_held' };
    return { outcome: 'held', holdToken, expiresAt: new Date(Date.now() + this.ttlSeconds * 1000) };
  }

  async release(eventId: string, seatId: string, userId: string): Promise<boolean> {
    const result = await this.scripted.seatlyRelease(
      holdKey(eventId, seatId),
      userHoldsKey(userId, eventId),
      userId,
      seatId,
    );
    return result === 1;
  }

  async expire(eventId: string, seatId: string, userId: string, holdToken: string): Promise<boolean> {
    const result = await this.scripted.seatlyExpire(
      holdKey(eventId, seatId),
      userHoldsKey(userId, eventId),
      holdValue(userId, holdToken),
      seatId,
    );
    return result === 1;
  }

  getHeldSeatIds(eventId: string, userId: string): Promise<string[]> {
    return this.redis.smembers(userHoldsKey(userId, eventId));
  }

  getHoldValues(eventId: string, seatIds: string[]): Promise<(string | null)[]> {
    if (seatIds.length === 0) return Promise.resolve([]);
    return this.redis.mget(...seatIds.map((seatId) => holdKey(eventId, seatId)));
  }

  async clearHolds(eventId: string, userId: string, seatIds: string[]): Promise<void> {
    const keys = [...seatIds.map((seatId) => holdKey(eventId, seatId)), userHoldsKey(userId, eventId)];
    await this.redis.del(...keys);
  }
}
```

`src/holds/holds.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HoldsService } from './holds.service';

@Module({
  providers: [HoldsService],
  exports: [HoldsService],
})
export class HoldsModule {}
```

Add `HoldsModule` to `src/app.module.ts` imports.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:e2e test/holds`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add HoldsService with atomic Lua hold/release/expire scripts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Hold and release endpoints (BookingsModule, part 1)

**Files:**
- Create: `src/bookings/bookings.service.ts`, `src/bookings/bookings.controller.ts`, `src/bookings/bookings.module.ts`
- Modify: `src/app.module.ts`
- Test: `test/bookings-hold.e2e-spec.ts`

**Interfaces:**
- Produces: `BookingsService.holdSeat(eventId, seatId, user: AuthUser): Promise<{ seatId: string; expiresAt: string }>` and `BookingsService.releaseSeat(eventId, seatId, user): Promise<void>`; routes `POST /events/:eventId/seats/:seatId/hold` (200) and `DELETE /events/:eventId/seats/:seatId/hold` (204). Task 14 inserts the expiry-job scheduling into `holdSeat`; Task 16 adds confirm and `/me/bookings`.
- Consumes: `EventsService.getEventOrThrow`, `HoldsService`, `EventPublisher`, `JwtAuthGuard`, `UserThrottlerGuard`.

- [ ] **Step 1: Write the failing e2e test**

`test/bookings-hold.e2e-spec.ts`:
```ts
import request from 'supertest';
import { holdKey } from '../src/common/redis-keys';
import { createEvent, registerUser } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('hold and release', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  const hold = (eventId: string, seatId: string, token: string) =>
    http().post(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const release = (eventId: string, seatId: string, token: string) =>
    http().delete(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('holds a seat, shows it as held_by_me, and lets the holder release it', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 3 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'holder@test.dev');

    const res = await hold(event.id, seat.id, user.accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ seatId: seat.id, expiresAt: expect.any(String) });
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 290_000);

    const map = await http().get(`/events/${event.id}`).set('Authorization', `Bearer ${user.accessToken}`);
    expect(map.body.seats[0].state).toBe('held_by_me');

    expect((await release(event.id, seat.id, user.accessToken)).status).toBe(204);
    const after = await http().get(`/events/${event.id}`);
    expect(after.body.seats[0].state).toBe('available');
  });

  it('exactly one of two concurrent holders wins', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const a = await registerUser(ctx.app, 'race-a@test.dev');
    const b = await registerUser(ctx.app, 'race-b@test.dev');

    const [ra, rb] = await Promise.all([hold(event.id, seat.id, a.accessToken), hold(event.id, seat.id, b.accessToken)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.code).toBe('SEAT_HELD');
  });

  it('re-holding your own seat is SEAT_HELD and does not extend the TTL', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'rehold@test.dev');
    await hold(event.id, seat.id, user.accessToken);
    await ctx.redis.expire(holdKey(event.id, seat.id), 100);

    const again = await hold(event.id, seat.id, user.accessToken);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SEAT_HELD');
    expect(await ctx.redis.ttl(holdKey(event.id, seat.id))).toBeLessThanOrEqual(100);
  });

  it('rejects holds when sales are not open, on sold seats, past the limit, and on foreign seats', async () => {
    const upcoming = await createEvent(ctx.prisma, { status: 'upcoming', rows: 1, seatsPerRow: 1 });
    const user = await registerUser(ctx.app, 'rules@test.dev');
    const closed = await hold(upcoming.id, upcoming.seats[0].id, user.accessToken);
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe('SALES_NOT_OPEN');

    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 8 });
    await ctx.prisma.seat.update({ where: { id: event.seats[0].id }, data: { status: 'sold' } });
    const sold = await hold(event.id, event.seats[0].id, user.accessToken);
    expect(sold.status).toBe(409);
    expect(sold.body.code).toBe('SEAT_SOLD');

    for (const seat of event.seats.slice(1, 7)) {
      expect((await hold(event.id, seat.id, user.accessToken)).status).toBe(200);
    }
    const seventh = await hold(event.id, event.seats[7].id, user.accessToken);
    expect(seventh.status).toBe(409);
    expect(seventh.body.code).toBe('HOLD_LIMIT_REACHED');

    const other = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const foreign = await hold(event.id, other.seats[0].id, user.accessToken);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('SEAT_NOT_FOUND');
  });

  it('release by a non-holder is NOT_HOLDER and auth is required', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const owner = await registerUser(ctx.app, 'owner@test.dev');
    const thief = await registerUser(ctx.app, 'thief@test.dev');
    await hold(event.id, seat.id, owner.accessToken);

    const res = await release(event.id, seat.id, thief.accessToken);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_HOLDER');

    expect((await http().post(`/events/${event.id}/seats/${seat.id}/hold`)).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:e2e test/bookings-hold`
Expected: FAIL with 404s.

- [ ] **Step 3: Implement service, controller and module**

`src/bookings/bookings.service.ts`:
```ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { EventStatus, SeatStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { EventsService } from '../events/events.service';
import { HoldsService, MAX_HELD_SEATS_PER_EVENT } from '../holds/holds.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventPublisher } from '../realtime/event-publisher';

export interface HoldResponse {
  seatId: string;
  expiresAt: string;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly holds: HoldsService,
    private readonly publisher: EventPublisher,
  ) {}

  async holdSeat(eventId: string, seatId: string, user: AuthUser): Promise<HoldResponse> {
    const event = await this.events.getEventOrThrow(eventId);
    if (event.status !== EventStatus.on_sale) {
      throw new AppException(ErrorCode.SALES_NOT_OPEN, HttpStatus.CONFLICT, 'Sales are not open');
    }
    const seat = await this.prisma.seat.findFirst({ where: { id: seatId, eventId } });
    if (!seat) {
      throw new AppException(ErrorCode.SEAT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Seat not found');
    }
    if (seat.status === SeatStatus.sold) {
      // Fast reject only; the confirm transaction is the real guarantee.
      throw new AppException(ErrorCode.SEAT_SOLD, HttpStatus.CONFLICT, 'Seat already sold', { seatIds: [seatId] });
    }

    const result = await this.holds.tryHold(eventId, seatId, user.id);
    if (result.outcome === 'limit_reached') {
      throw new AppException(ErrorCode.HOLD_LIMIT_REACHED, HttpStatus.CONFLICT, 'Too many held seats', {
        maxSeats: MAX_HELD_SEATS_PER_EVENT,
      });
    }
    if (result.outcome === 'seat_held') {
      throw new AppException(ErrorCode.SEAT_HELD, HttpStatus.CONFLICT, 'Seat is held by another user');
    }

    const expiresAt = result.expiresAt.toISOString();
    await this.publisher.publish(eventId, { type: 'held', seatIds: [seatId], expiresAt });
    return { seatId, expiresAt };
  }

  async releaseSeat(eventId: string, seatId: string, user: AuthUser): Promise<void> {
    const released = await this.holds.release(eventId, seatId, user.id);
    if (!released) {
      throw new AppException(ErrorCode.NOT_HOLDER, HttpStatus.FORBIDDEN, 'You do not hold this seat');
    }
    await this.publisher.publish(eventId, { type: 'released', seatIds: [seatId] });
  }
}
```

`src/bookings/bookings.controller.ts`:
```ts
import { Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { BookingsService, HoldResponse } from './bookings.service';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('events/:eventId')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('seats/:seatId/hold')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  hold(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('seatId', ParseUUIDPipe) seatId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<HoldResponse> {
    return this.bookings.holdSeat(eventId, seatId, user);
  }

  @Delete('seats/:seatId/hold')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  release(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('seatId', ParseUUIDPipe) seatId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.bookings.releaseSeat(eventId, seatId, user);
  }
}
```

`src/bookings/bookings.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { EventsModule } from '../events/events.module';
import { HoldsModule } from '../holds/holds.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [EventsModule, HoldsModule, RealtimeModule],
  controllers: [BookingsController],
  providers: [BookingsService, UserThrottlerGuard],
})
export class BookingsModule {}
```

Add `BookingsModule` to `src/app.module.ts` imports.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:e2e test/bookings-hold`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add seat hold and release endpoints

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: BullMQ queue and the `expire-hold` job

**Files:**
- Create: `src/queue/queue.constants.ts`, `src/queue/holds.queue.ts`, `src/queue/holds.processor.ts`, `src/queue/queue.module.ts`
- Modify: `src/bookings/bookings.service.ts`, `src/bookings/bookings.module.ts`, `src/app.module.ts`
- Test: `src/queue/holds.processor.spec.ts`, `test/expiry.e2e-spec.ts`

**Interfaces:**
- Produces (in `queue.constants.ts`): `HOLDS_QUEUE = 'holds'`, `EXPIRE_HOLD_JOB = 'expire-hold'`, `OPEN_SALES_JOB = 'open-sales'`, `interface ExpireHoldJob { eventId; seatId; userId; holdToken }`, `interface OpenSalesJob { eventId }`, `expireHoldJobId(job: ExpireHoldJob): string` (= `hold.{eventId}.{seatId}.{holdToken}`), `openSalesJobId(eventId): string` (= `open-sales.{eventId}`).
- Produces: `HoldsQueue.scheduleExpiry(job: ExpireHoldJob, delayMs: number): Promise<void>`; `HoldsQueue.scheduleOpenSales(eventId: string, at: Date): Promise<void>` (body added in Task 15, declared now).
- Produces: `HoldsProcessor` (`WorkerHost`) handling `expire-hold`; `open-sales` handling is added in Task 15.
- Consumes: `HoldsService.expire`, `EventPublisher`, `parseRedisUrl`.

- [ ] **Step 1: Write constants**

`src/queue/queue.constants.ts`:
```ts
export const HOLDS_QUEUE = 'holds';
export const EXPIRE_HOLD_JOB = 'expire-hold';
export const OPEN_SALES_JOB = 'open-sales';

export interface ExpireHoldJob {
  eventId: string;
  seatId: string;
  userId: string;
  holdToken: string;
}

export interface OpenSalesJob {
  eventId: string;
}

// BullMQ job ids must not contain ':' — use '.' as the separator.
export const expireHoldJobId = (job: ExpireHoldJob): string =>
  `hold.${job.eventId}.${job.seatId}.${job.holdToken}`;
export const openSalesJobId = (eventId: string): string => `open-sales.${eventId}`;
```

- [ ] **Step 2: Write the failing processor unit test**

`src/queue/holds.processor.spec.ts`:
```ts
import { Job } from 'bullmq';
import { HoldsProcessor } from './holds.processor';
import { EXPIRE_HOLD_JOB } from './queue.constants';

function build(expireResult: boolean) {
  const holds = { expire: jest.fn().mockResolvedValue(expireResult) };
  const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
  const prisma = { event: { updateMany: jest.fn() } };
  const processor = new HoldsProcessor(holds as never, publisher as never, prisma as never);
  return { processor, holds, publisher };
}

const job = (name: string, data: unknown) => ({ name, data }) as Job;

describe('HoldsProcessor expire-hold', () => {
  const data = { eventId: 'e1', seatId: 's1', userId: 'u1', holdToken: 't1' };

  it('publishes released when the hold was still the same', async () => {
    const { processor, holds, publisher } = build(true);
    await processor.process(job(EXPIRE_HOLD_JOB, data));
    expect(holds.expire).toHaveBeenCalledWith('e1', 's1', 'u1', 't1');
    expect(publisher.publish).toHaveBeenCalledWith('e1', { type: 'released', seatIds: ['s1'] });
  });

  it('stays silent when the hold was already gone or replaced', async () => {
    const { processor, publisher } = build(false);
    await processor.process(job(EXPIRE_HOLD_JOB, data));
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('ignores unknown job names', async () => {
    const { processor, holds } = build(true);
    await expect(processor.process(job('something-else', {}))).resolves.toBeUndefined();
    expect(holds.expire).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test src/queue`
Expected: FAIL with "Cannot find module './holds.processor'".

- [ ] **Step 4: Implement queue producer, processor and module**

`src/queue/holds.queue.ts`:
```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  EXPIRE_HOLD_JOB,
  ExpireHoldJob,
  HOLDS_QUEUE,
  OPEN_SALES_JOB,
  OpenSalesJob,
  expireHoldJobId,
  openSalesJobId,
} from './queue.constants';

@Injectable()
export class HoldsQueue {
  constructor(@InjectQueue(HOLDS_QUEUE) private readonly queue: Queue) {}

  async scheduleExpiry(job: ExpireHoldJob, delayMs: number): Promise<void> {
    await this.queue.add(EXPIRE_HOLD_JOB, job, {
      jobId: expireHoldJobId(job),
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }

  async scheduleOpenSales(eventId: string, at: Date): Promise<void> {
    const job: OpenSalesJob = { eventId };
    await this.queue.add(OPEN_SALES_JOB, job, {
      jobId: openSalesJobId(eventId),
      delay: Math.max(0, at.getTime() - Date.now()),
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }
}
```

`src/queue/holds.processor.ts`:
```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { HoldsService } from '../holds/holds.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventPublisher } from '../realtime/event-publisher';
import { EXPIRE_HOLD_JOB, ExpireHoldJob, HOLDS_QUEUE, OPEN_SALES_JOB, OpenSalesJob } from './queue.constants';

@Processor(HOLDS_QUEUE)
export class HoldsProcessor extends WorkerHost {
  private readonly logger = new Logger(HoldsProcessor.name);

  constructor(
    private readonly holds: HoldsService,
    private readonly publisher: EventPublisher,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EXPIRE_HOLD_JOB:
        return this.expireHold(job.data as ExpireHoldJob);
      case OPEN_SALES_JOB:
        return this.openSales(job.data as OpenSalesJob);
      default:
        this.logger.warn(`Unknown job ${job.name}`);
    }
  }

  private async expireHold(data: ExpireHoldJob): Promise<void> {
    const released = await this.holds.expire(data.eventId, data.seatId, data.userId, data.holdToken);
    if (released) {
      await this.publisher.publish(data.eventId, { type: 'released', seatIds: [data.seatId] });
    }
  }

  // Implemented in Task 15.
  private async openSales(_data: OpenSalesJob): Promise<void> {
    return undefined;
  }
}
```

`src/queue/queue.module.ts`:
```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env.validation';
import { HoldsModule } from '../holds/holds.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { parseRedisUrl } from '../redis/redis-url';
import { HoldsProcessor } from './holds.processor';
import { HoldsQueue } from './holds.queue';
import { HOLDS_QUEUE } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: parseRedisUrl(config.get('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue({ name: HOLDS_QUEUE }),
    HoldsModule,
    RealtimeModule,
  ],
  providers: [HoldsQueue, HoldsProcessor],
  exports: [HoldsQueue],
})
export class QueueModule {}
```

Add `QueueModule` to `src/app.module.ts` imports (before `BookingsModule`).

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `pnpm test src/queue`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing expiry e2e test**

`test/expiry.e2e-spec.ts`:
```ts
import Redis from 'ioredis';
import request from 'supertest';
import { holdKey } from '../src/common/redis-keys';
import { SeatUpdateMessage } from '../src/realtime/messages';
import { createEvent, registerUser, sleep } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('hold expiry jobs', () => {
  let ctx: TestContext;
  let subscriber: Redis;
  const published: SeatUpdateMessage[] = [];
  const http = () => request(ctx.app.getHttpServer());
  const hold = (eventId: string, seatId: string, token: string) =>
    http().post(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const release = (eventId: string, seatId: string, token: string) =>
    http().delete(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const stateOf = async (eventId: string, seatId: string, token?: string) => {
    const req = http().get(`/events/${eventId}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    const res = await req;
    return res.body.seats.find((s: { id: string }) => s.id === seatId).state as string;
  };
  const releasedCount = (seatId: string) =>
    published.filter((m) => m.type === 'released' && m.seatIds.includes(seatId)).length;

  beforeAll(async () => {
    ctx = await startTestApp({ HOLD_TTL_SECONDS: '3' });
    // A plain TTL expiry deletes the key silently; only the job publishes 'released'.
    subscriber = new Redis(process.env.REDIS_URL as string);
    await subscriber.psubscribe('events:*');
    subscriber.on('pmessage', (_pattern, _channel, raw) => {
      published.push(JSON.parse(raw) as SeatUpdateMessage);
    });
  });

  afterAll(async () => {
    await subscriber.quit();
    await ctx.stop();
  });

  it('releases a hold after the TTL via the delayed job and broadcasts it', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'expiry@test.dev');

    expect((await hold(event.id, seat.id, user.accessToken)).status).toBe(200);
    expect(await stateOf(event.id, seat.id)).toBe('held');

    await sleep(4500);
    expect(await stateOf(event.id, seat.id)).toBe('available');
    expect(await ctx.redis.exists(holdKey(event.id, seat.id))).toBe(0);
    expect(releasedCount(seat.id)).toBe(1);
  });

  it('a stale job from a released hold does not kill a newer hold on the same seat', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'stale@test.dev');

    await hold(event.id, seat.id, user.accessToken); // job A fires at ~3s
    await release(event.id, seat.id, user.accessToken); // publishes released #1
    await sleep(1500);
    await hold(event.id, seat.id, user.accessToken); // job B fires at ~4.5s

    await sleep(2000); // t ≈ 3.5s: job A has fired and must have been a no-op
    expect(await stateOf(event.id, seat.id, user.accessToken)).toBe('held_by_me');
    expect(releasedCount(seat.id)).toBe(1);

    await sleep(2500); // t ≈ 6s: job B has fired and published released #2
    expect(await stateOf(event.id, seat.id)).toBe('available');
    expect(releasedCount(seat.id)).toBe(2);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm test:e2e test/expiry`
Expected: both tests FAIL on the `releasedCount` assertions. The seats do become `available` (the key's TTL deletes it silently), but nothing publishes `released` because no job is scheduled yet.

- [ ] **Step 8: Schedule the job from the hold flow**

In `src/bookings/bookings.service.ts`:
- add imports: `import { HoldsQueue } from '../queue/holds.queue';`
- add constructor parameter `private readonly holdsQueue: HoldsQueue,` after `publisher`.
- in `holdSeat`, replace the two lines starting at `const expiresAt = ...` with:
```ts
    await this.holdsQueue.scheduleExpiry(
      { eventId, seatId, userId: user.id, holdToken: result.holdToken },
      this.holds.ttlSeconds * 1000,
    );
    const expiresAt = result.expiresAt.toISOString();
    await this.publisher.publish(eventId, { type: 'held', seatIds: [seatId], expiresAt });
    return { seatId, expiresAt };
```

In `src/bookings/bookings.module.ts`, add `QueueModule` to `imports` (`import { QueueModule } from '../queue/queue.module';`).

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test:e2e test/expiry test/bookings-hold`
Expected: PASS (2 + 5 tests). To see the job actually run, temporarily add `this.logger.log(...)` in `expireHold` and watch the output, then remove it.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add BullMQ holds queue with delayed expire-hold jobs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: `open-sales` job and seed scheduling

**Files:**
- Modify: `src/queue/holds.processor.ts`, `src/seed/seed.ts`, `src/seed/run-seed.ts`
- Test: `src/queue/holds.processor.spec.ts`, `src/seed/seed.spec.ts`, `test/open-sales.e2e-spec.ts`

**Interfaces:**
- Produces: `seed(prisma: PrismaClient, queue?: Queue): Promise<SeedResult>` — when a queue is given, enqueues one `open-sales` job per `upcoming` event.
- Produces: `HoldsProcessor.openSales` flips `upcoming → on_sale` and publishes `{ type: 'sales_opened' }` exactly once.

- [ ] **Step 1: Extend the unit tests (failing)**

Append to `src/queue/holds.processor.spec.ts`:
```ts
import { OPEN_SALES_JOB } from './queue.constants';

describe('HoldsProcessor open-sales', () => {
  it('flips an upcoming event to on_sale and publishes sales_opened', async () => {
    const holds = { expire: jest.fn() };
    const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const prisma = { event: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const processor = new HoldsProcessor(holds as never, publisher as never, prisma as never);

    await processor.process({ name: OPEN_SALES_JOB, data: { eventId: 'e1' } } as Job);

    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', status: 'upcoming' },
      data: { status: 'on_sale' },
    });
    expect(publisher.publish).toHaveBeenCalledWith('e1', { type: 'sales_opened' });
  });

  it('does not publish when the event was already open', async () => {
    const publisher = { publish: jest.fn() };
    const prisma = { event: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const processor = new HoldsProcessor({ expire: jest.fn() } as never, publisher as never, prisma as never);
    await processor.process({ name: OPEN_SALES_JOB, data: { eventId: 'e1' } } as Job);
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
```
(Merge the `OPEN_SALES_JOB` import into the existing import line from `./queue.constants`.)

Append to `src/seed/seed.spec.ts`:
```ts
  it('schedules an open-sales job for each upcoming event when a queue is given', async () => {
    const prisma = makePrisma(0);
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    await seed(prisma as never, queue as never);
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = queue.add.mock.calls[0];
    expect(name).toBe('open-sales');
    expect(data).toEqual({ eventId: 'evt' });
    expect(opts.jobId).toBe('open-sales.evt');
    expect(opts.delay).toBeGreaterThan(0);
  });
```
(Place it inside the existing `describe('seed', ...)`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/queue src/seed`
Expected: the new open-sales processor test FAILS (no updateMany call); the seed test FAILS (`queue.add` not called).

- [ ] **Step 3: Implement**

In `src/queue/holds.processor.ts`, replace the `openSales` method with:
```ts
  private async openSales(data: OpenSalesJob): Promise<void> {
    const { count } = await this.prisma.event.updateMany({
      where: { id: data.eventId, status: EventStatus.upcoming },
      data: { status: EventStatus.on_sale },
    });
    if (count === 1) {
      await this.publisher.publish(data.eventId, { type: 'sales_opened' });
    }
  }
```
and add `import { EventStatus } from '@prisma/client';`.

In `src/seed/seed.ts`:
- add `import { Queue } from 'bullmq';` and `import { OPEN_SALES_JOB, openSalesJobId } from '../queue/queue.constants';`
- change the signature to `export async function seed(prisma: PrismaClient, queue?: Queue): Promise<SeedResult>`
- replace the `for (const event of events)` loop with:
```ts
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
```

Replace `src/seed/run-seed.ts` with:
```ts
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
```

`pnpm prisma:seed` keeps working locally because the Prisma CLI loads `.env` into the environment before running the seed command, so `REDIS_URL` is present. In Docker the compose `environment` block provides it.

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm test src/queue src/seed`
Expected: PASS (5 + 3 tests).

- [ ] **Step 5: Write and run the open-sales e2e test**

`test/open-sales.e2e-spec.ts`:
```ts
import request from 'supertest';
import { HoldsQueue } from '../src/queue/holds.queue';
import { createEvent, sleep } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

describe('open-sales job', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('flips an upcoming event to on_sale at the scheduled time', async () => {
    const event = await createEvent(ctx.prisma, { status: 'upcoming' });
    await ctx.app.get(HoldsQueue).scheduleOpenSales(event.id, new Date(Date.now() + 500));

    const before = await request(ctx.app.getHttpServer()).get(`/events/${event.id}`);
    expect(before.body.status).toBe('upcoming');

    await sleep(2500);
    const after = await request(ctx.app.getHttpServer()).get(`/events/${event.id}`);
    expect(after.body.status).toBe('on_sale');
  });
});
```

Run: `pnpm test:e2e test/open-sales`
Expected: PASS (1 test).

- [ ] **Step 6: Re-verify Docker boot still seeds**

Run: `docker compose up --build -d api && sleep 15 && docker compose logs api | grep -E "entrypoint|Seeded|already" ; docker compose down -v`
Expected: `Seeded demo events.` on a fresh volume (the `-v` on down wipes it for next time).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add open-sales job scheduled by the seed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Confirm booking and my bookings

**Files:**
- Create: `src/bookings/me.controller.ts`
- Modify: `src/bookings/bookings.service.ts`, `src/bookings/bookings.controller.ts`, `src/bookings/bookings.module.ts`
- Test: `test/bookings-confirm.e2e-spec.ts`

**Interfaces:**
- Produces: `interface BookingResult { bookingId: string; seatIds: string[]; totalCents: number }`, `interface MyBooking { id: string; eventName: string; seats: { rowLabel: string; seatNumber: number }[]; totalCents: number; createdAt: string }`.
- Produces: `BookingsService.confirm(eventId, user): Promise<BookingResult>`, `BookingsService.myBookings(user): Promise<MyBooking[]>`; routes `POST /events/:eventId/bookings` (201), `GET /me/bookings` (200).
- Consumes: `HoldsService.getHeldSeatIds/getHoldValues/clearHolds`, `PrismaService.$transaction`, `EventPublisher`.

- [ ] **Step 1: Write the failing e2e test**

`test/bookings-confirm.e2e-spec.ts`:
```ts
import request from 'supertest';
import { holdKey, holdValue, userHoldsKey } from '../src/common/redis-keys';
import { createEvent, registerUser, sleep } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

const userIdOf = (accessToken: string): string =>
  JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()).sub;

describe('confirm booking', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  const hold = (eventId: string, seatId: string, token: string) =>
    http().post(`/events/${eventId}/seats/${seatId}/hold`).set('Authorization', `Bearer ${token}`);
  const confirm = (eventId: string, token: string) =>
    http().post(`/events/${eventId}/bookings`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('confirms all held seats in one booking and marks them sold', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 3 });
    const [s1, s2] = event.seats;
    const user = await registerUser(ctx.app, 'buyer@test.dev');
    await hold(event.id, s1.id, user.accessToken);
    await hold(event.id, s2.id, user.accessToken);

    const res = await confirm(event.id, user.accessToken);
    expect(res.status).toBe(201);
    expect(res.body.totalCents).toBe(20000);
    expect([...res.body.seatIds].sort()).toEqual([s1.id, s2.id].sort());

    const map = await http().get(`/events/${event.id}`);
    expect(map.body.seats.map((s: { state: string }) => s.state)).toEqual(['sold', 'sold', 'available']);
    expect(await ctx.redis.exists(holdKey(event.id, s1.id), userHoldsKey(userIdOf(user.accessToken), event.id))).toBe(0);

    const mine = await http().get('/me/bookings').set('Authorization', `Bearer ${user.accessToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual([
      {
        id: res.body.bookingId,
        eventName: 'Test Event',
        seats: [
          { rowLabel: 'A', seatNumber: 1 },
          { rowLabel: 'A', seatNumber: 2 },
        ],
        totalCents: 20000,
        createdAt: expect.any(String),
      },
    ]);
  });

  it('rejects confirm with no held seats, and reports expired holds', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 2 });
    const user = await registerUser(ctx.app, 'empty@test.dev');
    const none = await confirm(event.id, user.accessToken);
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('NO_HELD_SEATS');

    await hold(event.id, event.seats[0].id, user.accessToken);
    await hold(event.id, event.seats[1].id, user.accessToken);
    await ctx.redis.del(holdKey(event.id, event.seats[1].id)); // simulate expiry
    const expired = await confirm(event.id, user.accessToken);
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('HOLD_EXPIRED');
    expect(expired.body.details).toEqual({ lostSeatIds: [event.seats[1].id] });
  });

  it('a confirm that enters the transaction while another writer holds the row lock sees the committed sale', async () => {
    // Proves SELECT ... FOR UPDATE: without it, confirm would read "available" under READ COMMITTED,
    // then its UPDATE would wait and succeed, selling the seat twice.
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const [seat] = event.seats;
    const user = await registerUser(ctx.app, 'blocked@test.dev');
    await hold(event.id, seat.id, user.accessToken);

    let openGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    const writer = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM seats WHERE id = ${seat.id}::uuid FOR UPDATE`;
        await tx.seat.update({ where: { id: seat.id }, data: { status: 'sold' } });
        await gate;
      },
      { timeout: 15000 },
    );
    await sleep(200); // writer now holds the row lock

    const pending = confirm(event.id, user.accessToken).then((res) => res); // .then() sends the request
    await sleep(500); // confirm has passed the Redis check and is blocked on the lock
    openGate();
    await writer;

    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SEAT_SOLD');
    expect(await ctx.prisma.bookingSeat.count({ where: { seatId: seat.id } })).toBe(0);
  });

  it('two overlapping confirms serialize: one wins, the other gets SEAT_SOLD, nobody gets 500', async () => {
    // Simulates a hold-layer bug where two users both believe they hold the same three seats.
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 3 });
    const seatIds = event.seats.map((s) => s.id);
    const a = await registerUser(ctx.app, 'overlap-a@test.dev');
    const b = await registerUser(ctx.app, 'overlap-b@test.dev');
    const bId = userIdOf(b.accessToken);
    for (const seatId of seatIds) {
      expect((await hold(event.id, seatId, a.accessToken)).status).toBe(200);
    }

    let openGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    const blocker = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM seats WHERE id = ${seatIds[0]}::uuid FOR UPDATE`;
        await gate;
      },
      { timeout: 15000 },
    );
    await sleep(200);

    const confirmA = confirm(event.id, a.accessToken).then((res) => res);
    await sleep(500); // A passed the Redis check and is waiting on the blocker's lock

    // Now hand the same seats to B in Redis, in reverse order, and let B pass the Redis check too.
    await ctx.redis.sadd(userHoldsKey(bId, event.id), ...[...seatIds].reverse());
    for (const seatId of seatIds) {
      await ctx.redis.set(holdKey(event.id, seatId), holdValue(bId, 'forged'), 'EX', 300);
    }
    const confirmB = confirm(event.id, b.accessToken).then((res) => res);
    await sleep(500);

    openGate();
    await blocker;
    const [ra, rb] = await Promise.all([confirmA, confirmB]);

    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.code).toBe('SEAT_SOLD');
    const rows = await ctx.prisma.bookingSeat.findMany({ where: { seatId: { in: seatIds } } });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.bookingId)).size).toBe(1);
  });

  it('ten users confirming distinct seats in parallel all succeed', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 10 });
    const users = await Promise.all(
      Array.from({ length: 10 }, (_, i) => registerUser(ctx.app, `parallel${i}@test.dev`)),
    );
    await Promise.all(users.map((u, i) => hold(event.id, event.seats[i].id, u.accessToken)));
    const results = await Promise.all(users.map((u) => confirm(event.id, u.accessToken)));
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect(await ctx.prisma.bookingSeat.count({ where: { seatId: { in: event.seats.map((s) => s.id) } } })).toBe(10);
  });

  it('booking_seats.seat_id is unique at the database level', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const user = await ctx.prisma.user.create({ data: { email: 'db@test.dev', passwordHash: 'x' } });
    const make = () =>
      ctx.prisma.booking.create({
        data: { userId: user.id, eventId: event.id, totalCents: 1, seats: { create: [{ seatId: event.seats[0].id }] } },
      });
    await make();
    await expect(make()).rejects.toMatchObject({ code: 'P2002' });
  });
});
```

The two gate-based tests work because a supertest request is only sent once `.then()` is called; the test parks the request behind a row lock held by its own Prisma transaction, which is how it forces two confirms to overlap inside Postgres.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:e2e test/bookings-confirm`
Expected: FAIL with 404 on `POST /events/:id/bookings`.

- [ ] **Step 3: Implement confirm and my bookings**

Add to `src/bookings/bookings.service.ts`:

Imports to add:
```ts
import { Prisma } from '@prisma/client';
```

Types to add after `HoldResponse`:
```ts
export interface BookingResult {
  bookingId: string;
  seatIds: string[];
  totalCents: number;
}

export interface MyBooking {
  id: string;
  eventName: string;
  seats: { rowLabel: string; seatNumber: number }[];
  totalCents: number;
  createdAt: string;
}

interface LockedSeatRow {
  id: string;
  status: SeatStatus;
  price_cents: number;
}
```

Methods to add to the class:
```ts
  async confirm(eventId: string, user: AuthUser): Promise<BookingResult> {
    const heldSeatIds = await this.holds.getHeldSeatIds(eventId, user.id);
    if (heldSeatIds.length === 0) {
      throw new AppException(ErrorCode.NO_HELD_SEATS, HttpStatus.BAD_REQUEST, 'No held seats to confirm');
    }
    const values = await this.holds.getHoldValues(eventId, heldSeatIds);
    const lostSeatIds = heldSeatIds.filter((_, i) => !values[i]?.startsWith(`${user.id}:`));
    if (lostSeatIds.length > 0) {
      throw new AppException(ErrorCode.HOLD_EXPIRED, HttpStatus.CONFLICT, 'Some holds expired', { lostSeatIds });
    }

    // Lock in a stable order so two overlapping confirms never deadlock.
    const seatIds = [...heldSeatIds].sort();
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedSeatRow[]>(
        Prisma.sql`SELECT id, status, price_cents FROM seats
                   WHERE event_id = ${eventId}::uuid AND id = ANY(${seatIds}::uuid[])
                   ORDER BY id FOR UPDATE`,
      );
      if (rows.length !== seatIds.length) {
        throw new AppException(ErrorCode.SEAT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Seat not found');
      }
      const sold = rows.filter((row) => row.status === SeatStatus.sold).map((row) => row.id);
      if (sold.length > 0) {
        throw new AppException(ErrorCode.SEAT_SOLD, HttpStatus.CONFLICT, 'Seat already sold', { seatIds: sold });
      }
      const totalCents = rows.reduce((sum, row) => sum + row.price_cents, 0);
      const booking = await tx.booking.create({
        data: {
          userId: user.id,
          eventId,
          totalCents,
          seats: { create: seatIds.map((seatId) => ({ seatId })) },
        },
      });
      await tx.seat.updateMany({ where: { id: { in: seatIds } }, data: { status: SeatStatus.sold } });
      return { bookingId: booking.id, seatIds, totalCents };
    });

    await this.holds.clearHolds(eventId, user.id, seatIds);
    await this.publisher.publish(eventId, { type: 'sold', seatIds });
    return result;
  }

  async myBookings(user: AuthUser): Promise<MyBooking[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { name: true } },
        seats: { include: { seat: { select: { rowLabel: true, seatNumber: true } } } },
      },
    });
    return bookings.map((booking) => ({
      id: booking.id,
      eventName: booking.event.name,
      seats: booking.seats
        .map(({ seat }) => ({ rowLabel: seat.rowLabel, seatNumber: seat.seatNumber }))
        .sort((a, b) => a.rowLabel.localeCompare(b.rowLabel) || a.seatNumber - b.seatNumber),
      totalCents: booking.totalCents,
      createdAt: booking.createdAt.toISOString(),
    }));
  }
```

Add to `src/bookings/bookings.controller.ts` (inside the class, after `release`):
```ts
  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  confirm(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingResult> {
    return this.bookings.confirm(eventId, user);
  }
```
and extend the import to `import { BookingResult, BookingsService, HoldResponse } from './bookings.service';`.

`src/bookings/me.controller.ts`:
```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingsService, MyBooking } from './bookings.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('bookings')
  myBookings(@CurrentUser() user: AuthUser): Promise<MyBooking[]> {
    return this.bookings.myBookings(user);
  }
}
```

In `src/bookings/bookings.module.ts`, add `MeController` to `controllers`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:e2e test/bookings-confirm`
Expected: PASS (6 tests). If the overlapping test reports a 500, read the API log for `40P01` (deadlock) — that means the `ORDER BY id` is missing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: confirm bookings with FOR UPDATE transaction and list my bookings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Socket.IO gateway bridged to Redis pub/sub

**Files:**
- Create: `src/realtime/realtime.gateway.ts`
- Modify: `src/realtime/realtime.module.ts`
- Test: `test/realtime.e2e-spec.ts`

**Interfaces:**
- Produces: a Socket.IO server on the HTTP port. Handshake: `auth: { token }` (access JWT); invalid/missing → disconnected. Client events `join_event { eventId }` / `leave_event { eventId }`; server events `seat_update` (`SeatUpdateMessage`) and `sales_opened` (`SalesOpenedMessage`), emitted to room `event:{eventId}` whenever any API instance publishes on `events:{eventId}`.
- Consumes: `AuthService.verifyAccessToken`, `REDIS_SUBSCRIBER`, `EVENT_CHANNEL_PATTERN`, `EventMessage`.

- [ ] **Step 1: Write the failing e2e test**

`test/realtime.e2e-spec.ts`:
```ts
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { createEvent, registerUser } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

function connect(baseUrl: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, { auth: { token }, transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitFor<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function join(socket: Socket, eventId: string): Promise<unknown> {
  return new Promise((resolve) => socket.emit('join_event', { eventId }, resolve));
}

describe('realtime gateway', () => {
  let ctx: TestContext;
  const sockets: Socket[] = [];
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await ctx.stop();
  });

  it('broadcasts held, released and sold to everyone in the event room', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 2 });
    const [seat] = event.seats;
    const alice = await registerUser(ctx.app, 'alice@test.dev');
    const bob = await registerUser(ctx.app, 'bob@test.dev');
    const a = await connect(ctx.baseUrl, alice.accessToken);
    const b = await connect(ctx.baseUrl, bob.accessToken);
    sockets.push(a, b);
    await Promise.all([join(a, event.id), join(b, event.id)]);

    const heldOnB = waitFor<{ type: string; seatIds: string[]; expiresAt: string }>(b, 'seat_update');
    await http().post(`/events/${event.id}/seats/${seat.id}/hold`).set('Authorization', `Bearer ${alice.accessToken}`);
    expect(await heldOnB).toEqual({ type: 'held', seatIds: [seat.id], expiresAt: expect.any(String) });

    const soldOnB = waitFor<{ type: string }>(b, 'seat_update');
    await http().post(`/events/${event.id}/bookings`).set('Authorization', `Bearer ${alice.accessToken}`);
    expect(await soldOnB).toEqual({ type: 'sold', seatIds: [seat.id] });
  });

  it('does not deliver updates for rooms the client has not joined', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const user = await registerUser(ctx.app, 'quiet@test.dev');
    const socket = await connect(ctx.baseUrl, user.accessToken);
    sockets.push(socket);

    const unexpected = waitFor(socket, 'seat_update', 1000).then(
      () => 'received',
      () => 'timed out',
    );
    await http().post(`/events/${event.id}/seats/${event.seats[0].id}/hold`).set('Authorization', `Bearer ${user.accessToken}`);
    expect(await unexpected).toBe('timed out');
  });

  it('disconnects a client with a bad token', async () => {
    const socket = io(ctx.baseUrl, { auth: { token: 'garbage' }, transports: ['websocket'] });
    sockets.push(socket);
    const outcome = await new Promise<string>((resolve) => {
      socket.once('disconnect', () => resolve('disconnected'));
      socket.once('connect_error', () => resolve('disconnected'));
      setTimeout(() => resolve('still connected'), 2000);
    });
    expect(outcome).toBe('disconnected');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:e2e test/realtime`
Expected: FAIL (connect times out or `connect_error`: no gateway).

- [ ] **Step 3: Implement the gateway**

`src/realtime/realtime.gateway.ts`:
```ts
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { EVENT_CHANNEL_PATTERN } from '../common/redis-keys';
import { REDIS_SUBSCRIBER } from '../redis/redis.constants';
import { EventMessage } from './messages';

const CHANNEL_PREFIX = 'events:';
export const roomName = (eventId: string): string => `event:${eventId}`;

interface JoinPayload {
  eventId: string;
}

// origin: true reflects the request origin; fine for a playground where the API is not public.
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly auth: AuthService,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.subscriber.psubscribe(EVENT_CHANNEL_PATTERN);
    this.subscriber.on('pmessage', (_pattern: string, channel: string, raw: string) => {
      const eventId = channel.slice(CHANNEL_PREFIX.length);
      const message = JSON.parse(raw) as EventMessage;
      const eventName = message.type === 'sales_opened' ? 'sales_opened' : 'seat_update';
      this.server.to(roomName(eventId)).emit(eventName, message);
    });
  }

  // No unsubscribe on destroy: RedisModule quits the subscriber connection, which drops every subscription.

  async handleConnection(client: Socket): Promise<void> {
    const token = (client.handshake.auth as { token?: string }).token ?? '';
    try {
      const user: AuthUser = await this.auth.verifyAccessToken(token);
      client.data.user = user;
    } catch {
      this.logger.debug(`Rejected socket ${client.id}: bad token`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join_event')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: JoinPayload): Promise<{ joined: string }> {
    await client.join(roomName(body.eventId));
    return { joined: body.eventId };
  }

  @SubscribeMessage('leave_event')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: JoinPayload): Promise<{ left: string }> {
    await client.leave(roomName(body.eventId));
    return { left: body.eventId };
  }
}
```

Replace `src/realtime/realtime.module.ts` with:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventPublisher } from './event-publisher';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule],
  providers: [EventPublisher, RealtimeGateway],
  exports: [EventPublisher],
})
export class RealtimeModule {}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:e2e test/realtime`
Expected: PASS (3 tests).

Run: `pnpm test && pnpm test:e2e`
Expected: every suite PASS. (Full e2e takes a few minutes: each file boots two containers.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Socket.IO gateway bridged to Redis pub/sub

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Multi-instance check, CI and README

**Files:**
- Create: `docker-compose.scale.yml`, `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Produces: `docker compose -f docker-compose.yml -f docker-compose.scale.yml up --scale api=2` runs two API replicas on host ports 3000 and 3001; a socket on one receives a hold made on the other. CI runs unit and e2e tests.

- [ ] **Step 1: Write the scale override**

`docker-compose.scale.yml`:
```yaml
services:
  api:
    ports: !override
      - "3000-3001:3000"
```

- [ ] **Step 2: Run the two-instance check**

Run:
```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up --build -d --scale api=2
sleep 20
curl -s localhost:3000/health; echo; curl -s localhost:3001/health; echo
```
Expected: both return ok. Then, with the demo data:
```bash
EVENT=$(curl -s localhost:3000/events | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const e=JSON.parse(s).find(x=>x.status==='on_sale');console.log(e.id)})")
SEAT=$(curl -s localhost:3000/events/$EVENT | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).seats[0].id))")
TOKEN=$(curl -s -X POST localhost:3001/auth/register -H 'content-type: application/json' -d '{"email":"scale@test.dev","password":"Password123!"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).accessToken))")
# listener on instance A (port 3000):
node -e "
const { io } = require('socket.io-client');
const s = io('http://localhost:3000', { auth: { token: '$TOKEN' }, transports: ['websocket'] });
s.on('connect', () => s.emit('join_event', { eventId: '$EVENT' }));
s.on('seat_update', (m) => { console.log('instance A saw', m); process.exit(0); });
setTimeout(() => { console.log('no message'); process.exit(1); }, 10000);
" &
sleep 2
# hold on instance B (port 3001):
curl -s -X POST localhost:3001/events/$EVENT/seats/$SEAT/hold -H "authorization: Bearer $TOKEN"; echo
wait
docker compose -f docker-compose.yml -f docker-compose.scale.yml down -v
```
Expected: `instance A saw { type: 'held', ... }` printed by the listener. If `no message` appears, the Redis bridge in the gateway is not subscribed.

- [ ] **Step 3: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm build
      - run: pnpm test
      - run: pnpm test:e2e
```
Testcontainers works on `ubuntu-latest` runners because Docker is preinstalled.

- [ ] **Step 4: Write the README**

`README.md`:
````markdown
# Seatly API

Seat-booking playground: NestJS 11, Prisma + PostgreSQL, Redis (holds, cache, pub/sub), BullMQ, Socket.IO, Docker.
Design: `docs/superpowers/specs/2026-10-12-seatly-design.md`.

## Run everything

```bash
docker compose up --build          # postgres + redis + api on :3000
open http://localhost:3000/docs    # Swagger
```

With the web app checked out as a sibling folder (`../seatly-web`):

```bash
docker compose --profile full up --build   # adds web on :8080
```

Two API replicas (proves the Redis pub/sub bridge):

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up --build --scale api=2
```

## Develop

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm prisma:migrate      # creates/updates the schema
pnpm prisma:seed         # demo events (idempotent)
pnpm start:dev
```

## Test

```bash
pnpm test        # unit (Jest)
pnpm test:e2e    # Testcontainers: real Postgres + Redis per test file (Docker must be running)
```

## How a booking works

1. `POST /events/:id/seats/:seatId/hold` — Lua script does `SET hold:{event}:{seat} "{user}:{token}" NX EX 300`
   and adds the seat to `holds:user:{user}:{event}`. A BullMQ job is scheduled for the expiry.
2. Everyone in the event's socket room gets `seat_update {type:'held'}` via Redis pub/sub.
3. `POST /events/:id/bookings` — verifies the holds, then a Postgres transaction locks the seat rows
   (`SELECT … FOR UPDATE`), inserts the booking, marks seats sold. `booking_seats.seat_id` is unique.
4. The expiry job deletes the hold only if the value still matches its token, so a stale job never
   releases a newer hold.

## Endpoints

See Swagger at `/docs`. Errors always look like `{ statusCode, code, message, details }`.
````

- [ ] **Step 5: Final verification and commit**

Run: `pnpm build && pnpm test`
Expected: PASS.

```bash
git add -A
git commit -m "docs: add README, CI workflow and multi-instance compose override

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Milestone map

| Spec milestone | Tasks |
|---|---|
| 1 Skeleton + Docker | 1, 2, 3, 4, 5, 6 |
| 2 Auth | 7, 8 |
| 3 Events | 9, 10 |
| 4 Hold / release | 11, 12, 13 |
| 5 Jobs | 14, 15 |
| 6 Confirm | 16 |
| 7 Realtime | 17, 18 |

Milestones 8–9 (the Vue app and the `web` compose profile's build) are a separate plan in the `seatly-web` repo.
