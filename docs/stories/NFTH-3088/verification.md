# NFTH-3088 verification: integration (attempt 1)

Result: **FAILED**. The first `pnpm e2e:fresh` run exited 1. An immediate second run of the same command exited 0 with 4/4 tests passing. The failure comes from a readiness race in the e2e harness, not from the story's code. Details are under Failures.

## Commands

### 1. `SEATLY_API_DIR=<apiDir> pnpm e2e:fresh` (run 1): exit 1

Tests started as soon as nginx served `/config.js`, while the API container was still booting (its Prisma startup lines appear after "Running 4 tests"). The browser got `net::ERR_CONNECTION_RESET` on `GET http://localhost:3100/events` (seen in the trace's network log), and the page rendered `alert: Could not load events.` Once the stack was up, curl against the same API showed it responding correctly: `/events` returned all three events, `/events?q=Boulevard` returned only Comedy Showcase, and the CORS header for origin :8180 was present.

```
[WebServer]  Container seatly-e2e-api-1 Creating 
[WebServer]  Container seatly-e2e-api-1 Created 
[WebServer]  Container seatly-e2e-api-1 Starting 
[WebServer]  Container seatly-e2e-api-1 Started 
Running 4 tests using 2 workers
[WebServer] api-1       | warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
[WebServer] api-1       | For more information, see: https://pris.ly/prisma-config
[WebServer] api-1       | 
  ✘  2 [chromium] › e2e/events-search.spec.ts:3:1 › TC-13 visitor searches by venue, refreshes, then clears (10.3s)
  ✘  1 [chromium] › e2e/smoke.spec.ts:5:3 › smoke › SMOKE-1 the events page lists the seeded events (10.3s)
  ✓  4 [chromium] › e2e/smoke.spec.ts:13:3 › smoke › SMOKE-2 a new user can register and open the event with sales on (397ms)
  ✓  3 [chromium] › e2e/events-search.spec.ts:27:1 › TC-14 visitor sees the no-match message end to end (966ms)
...


       6 |     await page.goto('/events');
       7 |     await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
    >  8 |     await expect(page.getByText('Riyadh Jazz Night')).toBeVisible();
         |                                                       ^
       9 |     await expect(page.getByText('Comedy Showcase')).toBeVisible();
      10 |     await expect(page.getByText('Spring Orchestra')).toBeVisible();
      11 |   });
        at /Users/sanji/WebstormProjects/seatly-worktrees/NFTH-3088/web/e2e/smoke.spec.ts:8:55

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/smoke-smoke-SMOKE-1-the-events-page-lists-the-seeded-events-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/smoke-smoke-SMOKE-1-the-events-page-lists-the-seeded-events-chromium/error-context.md

    attachment #3: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/smoke-smoke-SMOKE-1-the-events-page-lists-the-seeded-events-chromium/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/smoke-smoke-SMOKE-1-the-events-page-lists-the-seeded-events-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  2 failed
    [chromium] › e2e/events-search.spec.ts:3:1 › TC-13 visitor searches by venue, refreshes, then clears 
    [chromium] › e2e/smoke.spec.ts:5:3 › smoke › SMOKE-1 the events page lists the seeded events ───
  2 passed (29.0s)
[ELIFECYCLE] Command failed with exit code 1.
```

### 2. `SEATLY_API_DIR=<apiDir> pnpm e2e:fresh` (run 2, re-run to tell a flake from a real defect): exit 0

```
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: using the "epoll" event method
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: nginx/1.31.6
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: built by gcc 15.2.0 (Alpine 15.2.0) 
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: OS: Linux 7.0.14-linuxkit
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: getrlimit(RLIMIT_NOFILE): 1048576:1048576
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker processes
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 31
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 32
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 33
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 34
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 35
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 36
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 37
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 38
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 39
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 40
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 41
[WebServer] web-1       | 2026/10/16 18:08:00 [notice] 1#1: start worker process 42
[WebServer] api-1       | warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
[WebServer] api-1       | For more information, see: https://pris.ly/prisma-config
[WebServer] api-1       | 

Running 4 tests using 2 workers

  ✓  2 [chromium] › e2e/smoke.spec.ts:5:3 › smoke › SMOKE-1 the events page lists the seeded events (319ms)
  ✓  3 [chromium] › e2e/smoke.spec.ts:13:3 › smoke › SMOKE-2 a new user can register and open the event with sales on (309ms)
  ✓  1 [chromium] › e2e/events-search.spec.ts:3:1 › TC-13 visitor searches by venue, refreshes, then clears (2.0s)
  ✓  4 [chromium] › e2e/events-search.spec.ts:27:1 › TC-14 visitor sees the no-match message end to end (881ms)

  4 passed (10.2s)
```

### 3. `SEATLY_API_DIR=<apiDir> pnpm e2e:down`: exit 0

```
$ docker compose -p seatly-e2e -f ${SEATLY_API_DIR:-../seatly-api}/docker-compose.yml --profile full down -v
 Container seatly-e2e-web-1 Stopping 
 Container seatly-e2e-web-1 Stopped 
 Container seatly-e2e-web-1 Removing 
 Container seatly-e2e-web-1 Removed 
 Container seatly-e2e-api-1 Stopping 
 Container seatly-e2e-api-1 Stopped 
 Container seatly-e2e-api-1 Removing 
 Container seatly-e2e-api-1 Removed 
 Container seatly-e2e-redis-1 Stopping 
 Container seatly-e2e-postgres-1 Stopping 
 Container seatly-e2e-postgres-1 Stopped 
 Container seatly-e2e-postgres-1 Removing 
 Container seatly-e2e-postgres-1 Removed 
 Container seatly-e2e-redis-1 Stopped 
 Container seatly-e2e-redis-1 Removing 
 Container seatly-e2e-redis-1 Removed 
 Volume seatly-e2e_redisdata Removing 
 Volume seatly-e2e_pgdata Removing 
 Network seatly-e2e_default Removing 
 Volume seatly-e2e_pgdata Removed 
 Volume seatly-e2e_redisdata Removed 
 Network seatly-e2e_default Removed 
```

## Matrix

| TC | layer | test | result | note |
|---|---|---|---|---|
| TC-13 | browser | web `e2e/events-search.spec.ts:3` "TC-13 visitor searches by venue, refreshes, then clears" | fail | The test covers the full Given/When/Then: it types Boulevard and checks `?q=Boulevard` in the URL, that Comedy Showcase is shown and Riyadh Jazz Night is not; then it reloads and checks the input value and list again; then it clears the input and checks that all 3 seeded events are back and `q` is gone. Run 1 failed at line 7 because the API was not ready ("Could not load events."). Run 2 passed. The test checks "only Comedy Showcase" through the absence of Jazz Night but not of Spring Orchestra (a minor gap). |
| TC-14 | browser | web `e2e/events-search.spec.ts:27` "TC-14 visitor sees the no-match message end to end" | pass | Types zzz-nothing and asserts the text "No events match your search". Passed in both runs. |

## Failures

- **side: fe** | **TC-13** | The Playwright `webServer` in `playwright.config.ts` (unchanged on this branch) waits only for `${baseURL}/config.js`, which nginx serves before the API is listening. On a fresh stack the first tests can run against an API that is not yet up, so TC-13 and SMOKE-1 failed. **Evidence:** in run 1 the trace shows `Failed to load resource: net::ERR_CONNECTION_RESET` for `http://localhost:3100/events`, and the page snapshot shows `alert: Could not load events.` The API's startup logs appear after "Running 4 tests". The same API returned correct data to curl afterwards, and the identical command passed 4/4 in run 2. **Why fe:** the API returns correct results, so this is not a `be` defect. The readiness wait is in the seatly-web repo, for example waiting on the API's health URL as well. This is a pre-existing harness flake, not a bug in the search feature.
