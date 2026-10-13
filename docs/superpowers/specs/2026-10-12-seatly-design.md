# Seatly — Seat Booking Playground: Design Spec

Date: 2026-10-12
Status: draft, awaiting review

## 1. Purpose

Seatly is a learning project. Its job is to make NestJS, PostgreSQL, Redis, BullMQ,
Socket.IO and Docker each do real work in one small, runnable app. The product is a
seat-booking site for events; the goal is the stack, not the product.

Success criteria:

- Every listed tool has a job that the app would break without.
- `docker compose up` in the API repo brings up Postgres, Redis and the API (and
  optionally the web app) from a clean machine.
- Concurrency rules (no double-hold, no double-sell) are enforced and covered by
  e2e tests against real Postgres and Redis.
- The Vue frontend is intentionally plain and exists to exercise the API.

Out of scope for v1: organizer UI, payments, email, seat pricing tiers, admin tools,
browser e2e tests, i18n, cookie-based access tokens.

## 2. Stack and repos

Two separate git repos, side by side:

- `seatly-api` — NestJS 11, TypeScript, pnpm, Prisma on PostgreSQL 17, ioredis on
  Redis 7, BullMQ, Socket.IO (`@nestjs/platform-socket.io`), Passport (local + JWT),
  `@nestjs/throttler` with Redis storage, Swagger, Jest, Supertest, Testcontainers.
- `seatly-web` — Vue 3, Vite, TypeScript, Pinia, Vue Router, axios, socket.io-client,
  Tailwind CSS, Vitest + Vue Test Utils. No component library.

## 3. API architecture

### Modules

| Module | Responsibility |
|---|---|
| `AuthModule` | register, login, refresh, logout; Passport local + JWT strategies; refresh-token allowlist in Redis |
| `EventsModule` | list events, event detail with merged seat map, short Redis cache |
| `BookingsModule` | hold, release, confirm, my bookings; owns Redis hold keys and the Postgres confirm transaction |
| `RealtimeModule` | one Socket.IO gateway; rooms per event; bridged to Redis pub/sub so any API instance can broadcast |
| `QueueModule` | BullMQ queue `holds` with job types `expire-hold` and `open-sales`; the worker |
| `PrismaModule` | `PrismaService` provider |
| `RedisModule` | ioredis clients: one general, one subscriber (pub/sub needs a dedicated connection) |

Cross-cutting:

- Global `ValidationPipe` with `class-validator` DTOs (`whitelist: true`, `transform: true`).
- Global exception filter producing the error envelope in §7.
- Rate limiting on `/auth/login`, `/auth/register` and the hold endpoint via
  `@nestjs/throttler` backed by Redis (10 holds/min/user, 5 logins/min/IP).
- Swagger UI at `/docs`.
- `GET /health` pings Postgres (`SELECT 1`) and Redis (`PING`).
- Config via `@nestjs/config` with a validated env schema (`DATABASE_URL`, `REDIS_URL`,
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WEB_ORIGIN`, `HOLD_TTL_SECONDS`, `PORT`).

### Authentication

- Password hashing: argon2.
- Access token: JWT, 15 min, returned in the response body, sent as `Authorization: Bearer`.
- Refresh token: JWT with a random `jti`, 7 days, delivered **only** as a cookie:
  `httpOnly`, `Secure` (disabled in local dev over http), `SameSite=Lax`,
  `Path=/auth`. The path is `/auth` rather than `/auth/refresh` so that `POST /auth/logout` also receives the cookie and can revoke it. The browser never reads it.
- Allowlist: Redis key `refresh:{userId}:{jti}` with the token's TTL. Refresh rotates:
  the old `jti` is deleted, a new one is written and a new cookie is set. Presenting a
  `jti` that is not in Redis returns `401 REFRESH_INVALID`. Logout deletes the `jti`
  and clears the cookie.
- CORS: `origin = WEB_ORIGIN` (comma-separated list of allowed origins, e.g. the Vite dev server and the Docker web image), `credentials: true`.
- Socket handshake: the access token is passed in `auth.token`; invalid or missing
  token disconnects the socket.

## 4. Data model

### PostgreSQL (Prisma)

| Table | Columns | Notes |
|---|---|---|
| `users` | `id` uuid pk, `email` unique, `password_hash`, `created_at` | |
| `events` | `id` uuid pk, `name`, `venue_name`, `starts_at`, `sales_open_at`, `status` enum (`upcoming`, `on_sale`, `closed`) | seeded |
| `seats` | `id` uuid pk, `event_id` fk, `row_label`, `seat_number` int, `price_cents` int, `status` enum (`available`, `sold`) | unique `(event_id, row_label, seat_number)` |
| `bookings` | `id` uuid pk, `user_id` fk, `event_id` fk, `total_cents` int, `created_at` | |
| `booking_seats` | `booking_id` fk, `seat_id` fk | pk `(booking_id, seat_id)`; **unique on `seat_id`** — the database-level guarantee that a seat is sold at most once |

Holds are not stored in Postgres.

### Redis keys

| Key | Type | TTL | Purpose |
|---|---|---|---|
| `hold:{eventId}:{seatId}` | string `"{userId}:{holdToken}"` | `HOLD_TTL_SECONDS` + 5 s grace | the hold; created with `SET NX EX` |
| `holds:user:{userId}:{eventId}` | set of `seatId` | refreshed to `HOLD_TTL_SECONDS` + 5 s on each add | the user's current holds for confirm |
| `seatmap:{eventId}` | string (JSON) | 5 s | cache of the merged seat map |
| `refresh:{userId}:{jti}` | string `"1"` | 7 d | refresh-token allowlist |
| channel `events:{eventId}` | pub/sub | — | seat-state messages, consumed by every gateway instance |
| BullMQ queue `holds` | BullMQ internal | — | delayed jobs; `expire-hold` job id = `hold.{eventId}.{seatId}.{holdToken}` (BullMQ job ids may not contain `:`) |

`holdToken` is a random UUID generated per hold. It is never derived from the user.
It exists so that a stale expiry job from an earlier hold cannot release a newer hold
on the same seat.

## 5. Core flows

### 5.1 Hold a seat — `POST /events/:eventId/seats/:seatId/hold`

1. Guards: JWT; throttler (10/min/user).
2. Load the event; if `status != on_sale` → `409 SALES_NOT_OPEN`.
3. `SCARD holds:user:{u}:{e}` ≥ 6 → `409 HOLD_LIMIT_REACHED`.
4. Load the seat; if `status = sold` → `409 SEAT_SOLD`. (Fast reject only; the
   confirm transaction is the real guarantee.)
5. Generate `holdToken`. Run Lua script `hold.lua` atomically:
   `SET hold:{e}:{s} "{u}:{token}" NX EX (ttl + 5 s grace)`; if it succeeded, `SADD holds:user:{u}:{e} {s}`
   and `EXPIRE` the set to `ttl + 5 s grace`. If `SET NX` failed → `409 SEAT_HELD`.
6. Enqueue BullMQ job `expire-hold`, id `hold.{e}.{s}.{token}`, delay `ttl` seconds,
   data `{eventId, seatId, userId, holdToken}`.
7. `DEL seatmap:{e}`; `PUBLISH events:{e} {"type":"held","seatIds":[s],"expiresAt":…}`.
8. `200 { seatId, expiresAt }`.

If step 6 fails after step 5 succeeded, the key's TTL still clears the hold; only the
broadcast is lost. Acceptable; documented in code.
The key TTL is 5 s longer than the job delay so the expiry job, which is what broadcasts `released`, always runs before Redis silently drops the key; the TTL only matters if the job is lost.

### 5.2 Release a seat — `DELETE /events/:eventId/seats/:seatId/hold`

Lua script `release.lua`: if `GET hold:{e}:{s}` starts with `"{u}:"` then `DEL` it and
`SREM holds:user:{u}:{e} {s}`, return 1; else return 0. On 0 → `403 NOT_HOLDER`.
On 1 → invalidate cache, publish `released`. The queued expiry job is left in place; it
no-ops on value mismatch (or on key absence).

### 5.3 Confirm booking — `POST /events/:eventId/bookings`

No body. Confirms every seat in `holds:user:{u}:{e}`.

1. `SMEMBERS holds:user:{u}:{e}`; empty → `400 NO_HELD_SEATS`.
2. `MGET` all hold keys; any key missing or not prefixed with `"{u}:"` →
   `409 HOLD_EXPIRED` with `details.lostSeatIds`.
3. Prisma interactive transaction:
   - `SELECT id, status, price_cents FROM seats WHERE id = ANY($1) FOR UPDATE`
   - any `sold` → throw → rollback → `409 SEAT_SOLD` with `details.seatIds`
   - insert `bookings`, insert `booking_seats`, `UPDATE seats SET status='sold'`.
4. After commit: `DEL` the hold keys and the user set; `DEL seatmap:{e}`;
   `PUBLISH … {"type":"sold","seatIds":[…]}`.
5. `201 { bookingId, seatIds, totalCents }`.

Crash between steps 3 and 4 leaves hold keys behind for at most `ttl`; the expiry job
then deletes them. Seats are already `sold`, so the only effect is a delayed
`released` message for seats that the next map fetch will show as `sold`. Acceptable.

### 5.4 Expiry job — worker for `expire-hold`

Lua script `expire.lua`: `if GET key == "{userId}:{holdToken}" then DEL key; SREM userSet seatId;
return 1 end; return 0`. On 1 → invalidate cache, publish `released`. On 0 → done.
Job options: 3 attempts, exponential backoff from 1 s, `removeOnComplete: true`.

### 5.5 Open sales job — `open-sales`

The seed script enqueues one `open-sales` job per `upcoming` event, delayed until
`sales_open_at`, job id `open-sales.{eventId}` (idempotent re-seeding). Worker sets
`events.status = on_sale` and publishes `{"type":"sales_opened"}`.

### 5.6 Live updates

- Client connects with `auth: { token }`. Gateway verifies the JWT in the handshake.
- `join_event { eventId }` → `socket.join('event:'+id)`; `leave_event` leaves.
- On startup each API instance `PSUBSCRIBE events:*`. Each message is re-emitted to
  the matching room as `seat_update` (or `sales_opened`). This is what makes
  `docker compose up --scale api=2` behave correctly.
- Client reconnect: re-fetch `GET /events/:id` once, then resume. No replay.

### 5.7 Seat map read — `GET /events/:id`

Cache hit on `seatmap:{e}` → return. Miss → load seats from Postgres, `MGET` all hold
keys for the event, mark `held`, cache for 5 s. If the request is authenticated, seats
whose hold value is prefixed with the caller's id are returned as `held_by_me`; this
personalisation is applied after the cache read, so the cache stays user-agnostic.

## 6. API surface

| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/auth/register` | — | `{ accessToken }` + refresh cookie |
| POST | `/auth/login` | — | `{ accessToken }` + refresh cookie |
| POST | `/auth/refresh` | refresh cookie | `{ accessToken }` + rotated cookie |
| POST | `/auth/logout` | JWT | 204, cookie cleared |
| GET | `/events` | — | `[{ id, name, venueName, startsAt, salesOpenAt, status, availableCount }]` |
| GET | `/events/:id` | optional JWT | event + `seats: [{ id, rowLabel, seatNumber, priceCents, state }]`, `state ∈ available / held / held_by_me / sold` |
| POST | `/events/:id/seats/:seatId/hold` | JWT | `{ seatId, expiresAt }` |
| DELETE | `/events/:id/seats/:seatId/hold` | JWT | 204 |
| POST | `/events/:id/bookings` | JWT | `{ bookingId, seatIds, totalCents }` |
| GET | `/me/bookings` | JWT | `[{ id, eventName, seats, totalCents, createdAt }]` |
| GET | `/health` | — | `{ postgres: 'ok', redis: 'ok' }` |
| GET | `/docs` | — | Swagger UI |

Socket.IO: client → `join_event`, `leave_event`; server → `seat_update { type: held | released | sold, seatIds, expiresAt? }`, `sales_opened`.

## 7. Error handling

Global filter envelope:

```json
{ "statusCode": 409, "code": "SEAT_HELD", "message": "Seat is held by another user", "details": {} }
```

Codes: `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `REQUEST_FAILED`,
`REFRESH_INVALID`, `RATE_LIMITED`, `EMAIL_TAKEN`, `EVENT_NOT_FOUND`, `SEAT_NOT_FOUND`,
`SALES_NOT_OPEN`, `SEAT_SOLD`, `SEAT_HELD`, `HOLD_LIMIT_REACHED`, `NOT_HOLDER`,
`NO_HELD_SEATS`, `HOLD_EXPIRED`, `INTERNAL`.

`EMAIL_TAKEN` is returned by register on a duplicate email; `NOT_FOUND`, `FORBIDDEN` and
`REQUEST_FAILED` map framework-raised 404/403/other 4xx errors.
The enum lives in the API and is copied verbatim into the web client.

Unknown exceptions log with a request id and return `500 INTERNAL` without internals.

## 8. Web app

- **Auth store (Pinia)**: access token in memory only. On app load it calls
  `/auth/refresh` once (cookie goes automatically); 401 means logged out. An axios
  interceptor attaches the bearer and, on 401, refreshes once and retries the request.
- **Routes**: `/login`, `/register` (shared form component), `/events`, `/events/:id`,
  `/me/bookings`. Booking routes require auth; guard redirects to `/login`.
- **Seat map page**: grid of rows × seats, cell colour by state. Click = hold or
  release (own seat). Side panel: your seats, countdown to earliest expiry, total,
  Confirm button. Opens one socket, emits `join_event`, applies `seat_update` to the
  store. `HOLD_EXPIRED` from confirm highlights the lost seats. `sales_opened` flips
  the page from "opens at …" to the live map.
- **Seat map store**: one source of truth for map state, own held seat IDs and expiry;
  written by both REST responses and socket messages.
- **Docker**: multi-stage build, nginx serves `dist`, `API_URL` injected into a
  `config.js` at container start via an entrypoint script.

## 9. Docker and local dev

`seatly-api/docker-compose.yml`:

- `postgres` (postgres:17, volume, healthcheck)
- `redis` (redis:7, `--appendonly yes`)
- `api` (Dockerfile, depends on healthy db/redis, entrypoint runs
  `prisma migrate deploy` then `prisma db seed` if no events exist, then starts)
- `web` (profile `full`, `build: ../seatly-web`) so `docker compose --profile full up`
  runs everything when both repos are siblings.

Local dev without containers for the API: `docker compose up postgres redis` then `pnpm start:dev`.

## 10. Testing

### API

- **Unit (Jest)**: `BookingsService` (all error codes, with Prisma and Redis mocked),
  `AuthService` (rotation, revocation), expiry worker (value match / mismatch),
  seat map merge.
- **E2E (Jest + Supertest + Testcontainers)**: real Postgres and Redis per test file,
  `HOLD_TTL_SECONDS=1` for expiry tests. Required cases:
  1. Two users hold the same seat concurrently → exactly one `200`, one `409 SEAT_HELD`.
  2. 20 parallel confirms over overlapping held seats → no `seat_id` appears twice in
     `booking_seats`; the unique index is asserted directly.
  3. Hold, wait for expiry job → seat `available`, socket client received `released`.
  4. Release then re-hold → the stale job does not remove the new hold.
  5. Refresh token reuse after rotation → `401 REFRESH_INVALID`.
  6. `/health` reports both dependencies.
- Scripts: `pnpm test`, `pnpm test:e2e`. GitHub Actions runs both.

### Web

- Vitest: seat map store (applying each `seat_update` type), seat cell component
  states, auth interceptor refresh-once behaviour.

## 11. Build order

Each milestone ends runnable with tests green.

1. Skeleton: NestJS app, Prisma schema + migration, seed, compose (db, redis, api),
   `/health`, Swagger, env validation.
2. Auth: register/login/refresh/logout, cookies, Redis allowlist, guards, throttler.
3. Events: list, detail, seat map merge, cache.
4. Hold/release: Lua scripts, user set, error codes, e2e race test.
5. Jobs: BullMQ worker, `expire-hold` with token check, `open-sales`.
6. Confirm: `FOR UPDATE` transaction, unique index, parallel confirm test.
7. Realtime: gateway, Redis pub/sub bridge, `--scale api=2` check.
8. Web: auth pages, events list, seat map with socket, bookings page, Dockerfile.
9. Polish: READMEs, CI, `web` compose profile.

Milestones 1–7 are the `seatly-api` repo; 8 creates `seatly-web`; 9 touches both.
