# NFTH-3088 verification: fe (attempt 2)

Run on 2026-10-17 in `seatly-worktrees/NFTH-3088/web` (branch feat/NFTH-3088-fe, HEAD ffe6cd8). Result: **passed**.

## Commands

### `git diff --stat origin/main...HEAD` (exit 0)

```
 e2e/events-search.spec.ts        |  31 +++++++++
 e2e/global-setup.ts              |  21 +++++++
 playwright.config.ts             |   1 +
 src/api/events.api.spec.ts       |  17 +++++
 src/api/events.api.ts            |   9 +--
 src/api/generated/openapi.d.ts   |  49 ++++++++++++++-
 src/views/EventsView.spec.ts     | 132 +++++++++++++++++++++++++++++++++++++++
 src/views/EventsView.vue         |  60 +++++++++++++++---
 src/views/events-search.logic.ts |  18 ++++++
 9 files changed, 322 insertions(+), 16 deletions(-)
```

### `SEATLY_CONTRACT=<apiDir>/contracts/openapi.yaml pnpm api:types:check` (exit 0)

```
$ pnpm api:types && git diff --exit-code -- src/api/generated/openapi.d.ts
$ openapi-typescript ${SEATLY_CONTRACT:-../seatly-api/contracts/openapi.yaml} -o src/api/generated/openapi.d.ts
✨ openapi-typescript 7.13.0
🚀 /Users/sanji/WebstormProjects/seatly-worktrees/NFTH-3088/api/contracts/openapi.yaml → src/api/generated/openapi.d.ts [22ms]
```

### `pnpm typecheck` (exit 0)

```
$ vue-tsc --noEmit
```

### `pnpm test` (exit 0)

```
$ NODE_OPTIONS=--no-experimental-webstorage vitest run

 RUN  v3.2.7 /Users/sanji/WebstormProjects/seatly-worktrees/NFTH-3088/web

 ✓ src/utils/money.spec.ts (1 test) 1ms
 ✓ src/utils/jwt.spec.ts (5 tests) 2ms
 ✓ src/stores/seat-map.logic.spec.ts (10 tests) 5ms
 ✓ src/utils/time.spec.ts (2 tests) 2ms
 ✓ src/realtime/event-socket.spec.ts (3 tests) 4ms
 ✓ src/api/errors.spec.ts (4 tests) 2ms
 ✓ src/components/Countdown.spec.ts (2 tests) 11ms
 ✓ src/api/events.api.spec.ts (1 test) 3ms
 ✓ src/api/http.spec.ts (7 tests) 9ms
 ✓ src/components/SeatCell.spec.ts (6 tests) 18ms
 ✓ src/stores/auth.store.spec.ts (8 tests) 5ms
 ✓ src/views/MyBookingsView.spec.ts (2 tests) 11ms
 ✓ src/components/EventCard.spec.ts (1 test) 11ms
 ✓ src/stores/seat-map.store.spec.ts (9 tests) 6ms
 ✓ src/views/EventsView.spec.ts (6 tests) 46ms
 ✓ src/router/guard.spec.ts (3 tests) 38ms
 ✓ src/views/EventDetailView.spec.ts (8 tests) 52ms
 ✓ src/config.spec.ts (3 tests) 1ms

 Test Files  18 passed (18)
      Tests  81 passed (81)
   Start at  11:54:55
   Duration  1.08s (transform 1.32s, setup 0ms, collect 3.39s, tests 226ms, environment 7.84s, prepare 1.24s)

```

### `pnpm build` (exit 0)

```
$ vue-tsc --noEmit && vite build
vite v6.4.4 building for production...
transforming...
✓ 157 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                                         0.46 kB │ gzip:  0.30 kB
dist/assets/index-BL6R8LxA.css                                         13.50 kB │ gzip:  3.52 kB
dist/assets/events.api-CQ1ATj8G.js                                      0.22 kB │ gzip:  0.18 kB
dist/assets/time-KgO_e5GA.js                                            0.27 kB │ gzip:  0.21 kB
dist/assets/bookings.api-CP9_jsbG.js                                    0.42 kB │ gzip:  0.26 kB
dist/assets/LoginView-CguvIJ47.js                                       1.07 kB │ gzip:  0.69 kB
dist/assets/RegisterView-C5tOTcd8.js                                    1.21 kB │ gzip:  0.77 kB
dist/assets/MyBookingsView-DBkoO0jh.js                                  1.34 kB │ gzip:  0.74 kB
dist/assets/AuthForm.vue_vue_type_script_setup_true_lang-DVZPjIhx.js    1.40 kB │ gzip:  0.73 kB
dist/assets/EventsView-DuCd9IoN.js                                      2.49 kB │ gzip:  1.36 kB
dist/assets/EventDetailView-Tz9ti_Qd.js                                53.18 kB │ gzip: 17.62 kB
dist/assets/index-CkEdpNbQ.js                                         155.89 kB │ gzip: 59.56 kB
✓ built in 442ms
```

### `pnpm exec playwright test --list e2e/events-search.spec.ts` (exit 0)

```
Listing tests:
  [chromium] › events-search.spec.ts:3:1 › TC-13 visitor searches by venue, refreshes, then clears
  [chromium] › events-search.spec.ts:27:1 › TC-14 visitor sees the no-match message end to end
Total: 2 tests in 1 file
```

`api:types:check` regenerates the types from the BE worktree contract and then runs `git diff --exit-code` on `src/api/generated/openapi.d.ts`. It exited 0, so the committed types match the contract.

Attempt 2 adds `e2e/global-setup.ts`, wired into `playwright.config.ts`. Before any test runs, it polls `http://localhost:${API_PORT:-3100}/health` for up to 180 s. It skips the wait when `E2E_BASE_URL` is set. This change answers the integration attempt-1 failure, where tests ran before the API was ready. Only the integration stage can show whether it works.

## Matrix

| TC | layer | test | result | note |
|---|---|---|---|---|
| TC-7 | fe-unit | src/views/EventsView.spec.ts "TC-7 search input renders above the list" | pass | Finds `input[aria-label="Search events"]` and checks that it comes before `.grid` in DOM order. |
| TC-8 | fe-unit | src/views/EventsView.spec.ts "TC-8 typing filters through the endpoint, debounced ~300 ms" | pass | Uses fake timers to type j, ja, jaz 100 ms apart. There is no new call at 299 ms and exactly one call with "jaz" at 300 ms. The grid then shows only the returned event. |
| TC-9 | fe-unit | src/views/EventsView.spec.ts "TC-9 shows the no-match message" | pass | When the API returns `[]`, the page shows "No events match your search" and does not show "No events yet." |
| TC-10 | fe-unit | src/views/EventsView.spec.ts "TC-10 clearing the input restores the full list" | pass | Starts at ?q=jaz and clears the input. The last call is `list(undefined)` and both events render. `events.api.spec.ts` checks that an empty or missing q sends no params. |
| TC-11 | fe-unit | src/views/EventsView.spec.ts "TC-11 search term syncs with the URL query q" | pass | The input is prefilled from ?q=arena and the first call uses "arena". Typing calls `router.replace` once and sets q=jazz. Clearing removes q from the URL. |
| TC-12 | fe-unit | src/views/EventsView.spec.ts "TC-12 search failure shows the error state" | pass | When the API rejects, the `[role=alert]` text is exactly "Could not load events." |
| TC-13 | browser | e2e/events-search.spec.ts "TC-13 visitor searches by venue, refreshes, then clears" | pass | Read and listed by Playwright. It covers every Given/When/Then: the Boulevard filter, q in the URL, the reload keeping the input and the filter, and the clear showing all three seeded events with no q. Not run in fe mode; the integration stage runs it. |
| TC-14 | browser | e2e/events-search.spec.ts "TC-14 visitor sees the no-match message end to end" | pass | Read and listed by Playwright. It types "zzz-nothing" and expects "No events match your search". Not run in fe mode; the integration stage runs it. |

## Failures

None.
