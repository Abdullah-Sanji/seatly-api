# NFTH-3088 verification (be), attempt 1

Worktree: `seatly-worktrees/NFTH-3088/api`, branch `feat/NFTH-3088-be` @ 3d52a51.

**Result: FAILED.** All six TCs pass, but `pnpm test:e2e` exits 1. The cause is two realtime/expiry suites that this diff does not touch (see Failures).

## Commands

| Command | Exit |
|---|---|
| `git diff --stat origin/main...HEAD` | 0 |
| `pnpm contract:lint` | 0 |
| `pnpm build` | 0 |
| `pnpm test` | 0 |
| `pnpm test:e2e` | 1 |
| `pnpm test:e2e -- test/expiry.e2e-spec.ts test/realtime.e2e-spec.ts` (rerun) | 1 (expiry fails, realtime passes) |
| `pnpm test:e2e -- test/expiry.e2e-spec.ts` (branch worktree, 3 more runs) | 1, 1, 1 |
| `pnpm test:e2e -- test/expiry.e2e-spec.ts test/realtime.e2e-spec.ts` (main checkout 7150d2d) | 0 |
| `pnpm test:e2e -- test/expiry.e2e-spec.ts` (main checkout, 2 more runs) | 0, 0 |
| `pnpm test:e2e -- test/expiry.e2e-spec.ts` (branch HEAD 3d52a51 in scratch worktree using main's node_modules) | 0 |

### git diff --stat origin/main...HEAD
```
 contracts/openapi.yaml                    |  35 +++++++-
 docs/stories/NFTH-3088/breakdown.md       |  45 ++++++++++
 docs/stories/NFTH-3088/contract.md        |  76 ++++++++++++++++
 docs/stories/NFTH-3088/story.md           |  61 +++++++++++++
 docs/stories/NFTH-3088/test-cases.md      | 139 ++++++++++++++++++++++++++++++
 docs/stories/NFTH-3088/verification-fe.md | 118 +++++++++++++++++++++++++
 src/events/events.controller.ts           |   7 +-
 src/events/events.service.ts              |  23 ++++-
 src/events/list-events.query.ts           |   8 ++
 test/events.e2e-spec.ts                   |  85 +++++++++++++++++-
 test/setup/fixtures.ts                    |   9 +-
 11 files changed, 594 insertions(+), 12 deletions(-)
```

### pnpm contract:lint
```
$ ts-node scripts/contract-lint.ts
contract ok: 10 paths, 11 operations (/Users/sanji/WebstormProjects/seatly-worktrees/NFTH-3088/api/contracts/openapi.yaml)
```

### pnpm build
```
$ nest build
```

### pnpm test
```
$ jest
PASS src/common/redis-keys.spec.ts
PASS src/redis/redis-url.spec.ts
PASS src/events/seat-map.spec.ts
PASS src/seed/seed.spec.ts
PASS src/config/env.validation.spec.ts
PASS src/realtime/event-publisher.spec.ts
PASS src/common/filters/app-exception.filter.spec.ts
PASS src/realtime/realtime.gateway.spec.ts
PASS src/queue/holds.processor.spec.ts
PASS src/auth/auth.service.spec.ts
PASS src/bookings/bookings.service.spec.ts

Test Suites: 11 passed, 11 total
Tests:       36 passed, 36 total
Snapshots:   0 total
Time:        2.476 s, estimated 3 s
Ran all test suites.
```

### pnpm test:e2e (full run)
```
2:FAIL test/expiry.e2e-spec.ts (17.871 s)
21:  ● hold expiry jobs › releases a hold after the TTL via the delayed job and broadcasts it
23:    timed out waiting for released
27:    > 23 |     const timer = setTimeout(() => reject(new Error('timed out waiting for released')), timeoutMs);
35:PASS test/open-sales.e2e-spec.ts (120.148 s)
36:PASS test/bookings-confirm.e2e-spec.ts (6.512 s)
37:FAIL test/realtime.e2e-spec.ts (6.627 s)
56:  ● realtime gateway › broadcasts held and sold to everyone in the event room
58:    timed out waiting for seat_update
62:    > 16 |     const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
70:PASS test/bookings-hold.e2e-spec.ts
89:PASS test/events.e2e-spec.ts
90:PASS test/auth.e2e-spec.ts
91:PASS test/holds.e2e-spec.ts
110:PASS test/contract.e2e-spec.ts
111:PASS test/throttle.e2e-spec.ts
112:PASS test/health.e2e-spec.ts
PASS test/health.e2e-spec.ts

Test Suites: 2 failed, 9 passed, 11 total
Tests:       2 failed, 51 passed, 53 total
Snapshots:   0 total
Time:        167.603 s
Ran all test suites.
[ELIFECYCLE] Command failed with exit code 1.
```

### pnpm test:e2e -- test/expiry.e2e-spec.ts (branch rerun)
```
      at node_modules/.pnpm/ioredis@5.11.1_supports-color@8.1.1/node_modules/ioredis/built/redis/event_handler.js:88:34
      at node_modules/.pnpm/ioredis@5.11.1_supports-color@8.1.1/node_modules/ioredis/built/Redis.js:761:24
      at tryCatcher (node_modules/.pnpm/standard-as-callback@2.1.0/node_modules/standard-as-callback/built/utils.js:12:23)
      at node_modules/.pnpm/standard-as-callback@2.1.0/node_modules/standard-as-callback/built/index.js:33:51

FAIL test/expiry.e2e-spec.ts (18.243 s)
  hold expiry jobs
    ✕ releases a hold after the TTL via the delayed job and broadcasts it (8071 ms)
    ✓ a stale job from a released hold does not kill a newer hold on the same seat (6087 ms)

  ● hold expiry jobs › releases a hold after the TTL via the delayed job and broadcasts it

    timed out waiting for released

      21 | function waitForReleased(socket: Socket, timeoutMs = 3000): Promise<SeatUpdateMessage> {
      22 |   return new Promise((resolve, reject) => {
    > 23 |     const timer = setTimeout(() => reject(new Error('timed out waiting for released')), timeoutMs);
         |                                           ^
      24 |     const listener = (message: SeatUpdateMessage) => {
      25 |       if (message.type === 'released') {
      26 |         clearTimeout(timer);

      at Timeout._onTimeout (test/expiry.e2e-spec.ts:23:43)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 passed, 2 total
Snapshots:   0 total
Time:        18.363 s, estimated 19 s
Ran all test suites matching /test\/expiry.e2e-spec.ts/i.
[ELIFECYCLE] Command failed with exit code 1.
```

### main baseline
```
PASS test/expiry.e2e-spec.ts (15.103 s)
PASS test/realtime.e2e-spec.ts

Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        18.75 s
Ran all test suites matching /test\/expiry.e2e-spec.ts|test\/realtime.e2e-spec.ts/i.
```

### branch HEAD with main node_modules
```
✓ Lockfile passes supply-chain policies (verified 1d ago)
    ✓ releases a hold after the TTL via the delayed job and broadcasts it (4604 ms)
    ✓ a stale job from a released hold does not kill a newer hold on the same seat (6079 ms)
Tests:       2 passed, 2 total
```

## Matrix

| TC | layer | test | result | note |
|---|---|---|---|---|
| TC-1 | be-e2e | test/events.e2e-spec.ts:72 `TC-1 name substring matches case-insensitively` | pass | Seeds "Riyadh Jazz Night" @ King Fahd Cultural Centre and "Comedy Showcase" @ Boulevard Arena; `q=jAzZ` → 200, names exactly `['Riyadh Jazz Night']`. |
| TC-2 | be-e2e | test/events.e2e-spec.ts:89 `TC-2 venue substring matches…` | pass | `q=boulevard` → exactly `['Comedy Showcase']`. Uses the events TC-1 created (order-dependent within the describe; acceptable with `--runInBand`). |
| TC-3 | be-e2e | test/events.e2e-spec.ts:95 `TC-3 no match returns an empty list` | pass | `q=zzz-nothing` → 200, body `[]`. |
| TC-4 | be-e2e | test/events.e2e-spec.ts:101 `TC-4 absent or empty q…` | pass | Adds Late (+300d) and Early (+1d) out of order; `GET /events` and `?q=` are both 200 and deep-equal, contain all the seeded events, and `startsAt` is ascending. |
| TC-5 | be-e2e | test/events.e2e-spec.ts:116 `TC-5 q over 100 characters…` | pass | 101 chars → 400 `VALIDATION_FAILED` (body checked against the ErrorBody contract by the harness); 100 chars → 200. |
| TC-6 | be-e2e | test/events.e2e-spec.ts:128 `TC-6 filtered results keep the EventSummary shape…` | pass | Zeta Night (+50d) is created before Alpha Night (+40d); `q=night` → `[Riyadh Jazz Night, Alpha Night, Zeta Night]`; each item has exactly the 7 EventSummary keys (no `seats`), and the harness also validates the items against the contract. |

All six run in the `PASS test/events.e2e-spec.ts` suite of the full e2e run above.

## Failures

- **side: be**, TC: none (suite gate). `pnpm test:e2e` exits 1 in the BE worktree. Failing tests: `hold expiry jobs › releases a hold after the TTL via the delayed job and broadcasts it` (`timed out waiting for released`) fails on every run (4/4). `realtime gateway › broadcasts held and sold to everyone in the event room` (`timed out waiting for seat_update`) failed once and passed on rerun. Both log `[ioredis] Unhandled error event: Connection in subscriber mode`.
  - Evidence that this is environmental, not caused by the diff: the diff touches nothing under realtime, queue, redis or holds. The same suite passes on the main checkout (3/3). It also passes when branch HEAD 3d52a51 runs in a scratch worktree with main's `node_modules`. `ls node_modules/.pnpm` differs between the two installs (for example, the worktree has no `@nest-lab+throttler-storage-redis`, `@nestjs+bullmq`, `@nestjs+core` or `@nestjs+platform-socket.io` entries with main's peer hashes). So the worktree's dependency install is the cause.
  - Suggested action: reinstall the worktree deps (`pnpm install --frozen-lockfile`) and rerun `pnpm test:e2e`. No code change to the story is needed.
