# Seatly API

Seat-booking playground: NestJS 11, Prisma + PostgreSQL, Redis (holds, cache, pub/sub), BullMQ, Socket.IO, Docker.
Design: `docs/superpowers/specs/2026-10-12-seatly-design.md`.

## Run everything

```bash
docker compose up --build          # postgres + redis + api on :3000 (WEB_ORIGIN allows :5173 and :8080)
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

1. `POST /events/:id/seats/:seatId/hold` — Lua script does `SET hold:{event}:{seat} "{user}:{token}" NX EX <HOLD_TTL_SECONDS + 5>`
   (the key TTL is `HOLD_TTL_SECONDS + 5 s` of grace) and adds the seat to `holds:user:{user}:{event}`.
   A BullMQ job is scheduled for the expiry, delayed by `HOLD_TTL_SECONDS`.
2. Everyone in the event's socket room gets `seat_update {type:'held'}` via Redis pub/sub.
3. `POST /events/:id/bookings` — verifies the holds, then a Postgres transaction locks the seat rows
   (`SELECT … FOR UPDATE`), inserts the booking, marks seats sold. `booking_seats.seat_id` is unique.
4. The expiry job deletes the hold only if the value still matches its token, so a stale job never
   releases a newer hold.

## Endpoints

The contract is `contracts/openapi.yaml` (HTTP + Socket.IO); Swagger at `/docs` serves it, the frontend generates
its types from it and the e2e suite validates every response against it. See `contracts/README.md`. Errors always look like `{ statusCode, code, message, details }`.

## Automated story delivery

`/story <JIRA-KEY>` in Claude Code runs a Jira story through intake, test cases, contract handshake, parallel
backend/frontend implementation, verification and two PRs with no human step until review.
Design: `docs/superpowers/specs/2026-10-15-story-automation-workflow.md`. Config: `.claude/story.config.json`.
