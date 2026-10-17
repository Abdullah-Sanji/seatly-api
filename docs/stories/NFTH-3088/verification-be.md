# NFTH-3088 verification (be), attempt 2

Date: 2026-10-16. Worktree: `/Users/sanji/WebstormProjects/seatly-worktrees/NFTH-3088/api`, branch `feat/NFTH-3088-be` at `640a125`.

## Commands

### `git diff --stat origin/main...HEAD` (exit 0)

```
 contracts/openapi.yaml                    |  35 +++++-
 docs/stories/NFTH-3088/breakdown.md       |  45 ++++++++
 docs/stories/NFTH-3088/contract.md        |  76 +++++++++++++
 docs/stories/NFTH-3088/story.md           |  61 +++++++++++
 docs/stories/NFTH-3088/test-cases.md      | 139 ++++++++++++++++++++++++
 docs/stories/NFTH-3088/verification-be.md | 171 ++++++++++++++++++++++++++++++
 docs/stories/NFTH-3088/verification-fe.md | 118 +++++++++++++++++++++
 src/events/events.controller.ts           |   7 +-
 src/events/events.service.ts              |  23 +++-
 src/events/list-events.query.ts           |   8 ++
 src/queue/holds.processor.ts              |  22 +++-
 src/redis/redis.module.ts                 |  11 +-
 test/events.e2e-spec.ts                   |  85 ++++++++++++++-
 test/setup/fixtures.ts                    |   9 +-
 14 files changed, 794 insertions(+), 16 deletions(-)
```

### `pnpm contract:lint` (exit 0)

```
$ ts-node scripts/contract-lint.ts
contract ok: 10 paths, 11 operations (/Users/sanji/WebstormProjects/seatly-worktrees/NFTH-3088/api/contracts/openapi.yaml)
```

### `pnpm build` (exit 0)

```
$ nest build
```

### `pnpm test` (exit 0)

```
$ jest
PASS src/redis/redis-url.spec.ts
PASS src/common/redis-keys.spec.ts
PASS src/seed/seed.spec.ts
PASS src/events/seat-map.spec.ts
PASS src/config/env.validation.spec.ts
PASS src/realtime/event-publisher.spec.ts
PASS src/common/filters/app-exception.filter.spec.ts
PASS src/realtime/realtime.gateway.spec.ts
PASS src/queue/holds.processor.spec.ts
PASS src/bookings/bookings.service.spec.ts
PASS src/auth/auth.service.spec.ts

Test Suites: 11 passed, 11 total
Tests:       36 passed, 36 total
Snapshots:   0 total
Time:        2.405 s, estimated 3 s
Ran all test suites.
```

### `pnpm test:e2e` (exit 0)

```
$ jest --config test/jest-e2e.json --runInBand
PASS test/expiry.e2e-spec.ts (14.5 s)
PASS test/open-sales.e2e-spec.ts
PASS test/bookings-confirm.e2e-spec.ts
PASS test/realtime.e2e-spec.ts
PASS test/auth.e2e-spec.ts
PASS test/bookings-hold.e2e-spec.ts
PASS test/events.e2e-spec.ts
PASS test/contract.e2e-spec.ts
PASS test/health.e2e-spec.ts
PASS test/throttle.e2e-spec.ts
PASS test/holds.e2e-spec.ts

Test Suites: 11 passed, 11 total
Tests:       53 passed, 53 total
Snapshots:   0 total
Time:        42.938 s, estimated 45 s
Ran all test suites.
```

### `pnpm test:e2e --verbose test/events.e2e-spec.ts` (exit 0)

```
$ jest --config test/jest-e2e.json --runInBand --verbose test/events.e2e-spec.ts
PASS test/events.e2e-spec.ts
  events
    ✓ lists events with available counts, ordered by start (24 ms)
    ✓ returns the seat map with held / held_by_me / sold states (49 ms)
    ✓ validates the id and reports unknown events (2 ms)
    search (NFTH-3088)
      ✓ TC-1 name substring matches case-insensitively (9 ms)
      ✓ TC-2 venue substring matches when the name does not (2 ms)
      ✓ TC-3 no match returns an empty list (2 ms)
      ✓ TC-4 absent or empty q returns the full list as today (19 ms)
      ✓ TC-5 q over 100 characters is rejected with VALIDATION_FAILED; 100 accepted (2 ms)
      ✓ TC-6 filtered results keep the EventSummary shape and start-date order (9 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        3.532 s
Ran all test suites matching /test\/events.e2e-spec.ts/i.
```

## Matrix

| TC | layer | test | result | note |
|---|---|---|---|---|
| TC-1 | be-e2e | test/events.e2e-spec.ts: `TC-1 name substring matches case-insensitively` | pass | Sets up the two events from the Given, calls `GET /events?q=jAzZ`, and asserts the result is exactly `['Riyadh Jazz Night']` |
| TC-2 | be-e2e | test/events.e2e-spec.ts: `TC-2 venue substring matches when the name does not` | pass | `q=boulevard` returns exactly `['Comedy Showcase']`. That match can only come from the venue field |
| TC-3 | be-e2e | test/events.e2e-spec.ts: `TC-3 no match returns an empty list` | pass | Asserts 200 and a body of `[]` |
| TC-4 | be-e2e | test/events.e2e-spec.ts: `TC-4 absent or empty q returns the full list as today` | pass | Calls `GET /events` and `?q=`, asserts both bodies are identical, contain all the named events, and are sorted ascending by startsAt |
| TC-5 | be-e2e | test/events.e2e-spec.ts: `TC-5 q over 100 characters is rejected with VALIDATION_FAILED; 100 accepted` | pass | 101 chars gives 400 with code VALIDATION_FAILED; exactly 100 chars gives 200. The contract declares `maxLength: 100` |
| TC-6 | be-e2e | test/events.e2e-spec.ts: `TC-6 filtered results keep the EventSummary shape and start-date order` | pass | Zeta is created before Alpha but starts later. `q=night` returns them in start-date order, and the test asserts each item has exactly the EventSummary keys (no `seats`). The harness also validates the response against the contract |

## Failures

None.
