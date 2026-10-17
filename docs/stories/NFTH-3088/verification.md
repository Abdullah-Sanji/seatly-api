# NFTH-3088 verification: integration (attempt 2)

## Commands

### 1. `SEATLY_API_DIR=<apiDir> pnpm e2e:fresh`: exit 1

```
[WebServer]  Image seatly-e2e-web Built 
[WebServer]  Network seatly-e2e_default Creating 
[WebServer]  Network seatly-e2e_default Creating 
[WebServer]  Volume seatly-e2e_pgdata Creating 
[WebServer]  Volume seatly-e2e_pgdata Creating 
[WebServer]  Volume seatly-e2e_redisdata Creating 
[WebServer]  Volume seatly-e2e_redisdata Creating 
[WebServer]  Volume seatly-e2e_redisdata Created 
[WebServer]  Volume seatly-e2e_redisdata Created 
[WebServer]  Volume seatly-e2e_pgdata Created 
[WebServer]  Volume seatly-e2e_pgdata Created 
[WebServer]  Network seatly-e2e_default Created 
[WebServer]  Network seatly-e2e_default Created 
[WebServer]  Container seatly-e2e-redis-1 Creating 
[WebServer]  Container seatly-e2e-postgres-1 Creating 
[WebServer]  Container seatly-e2e-redis-1 Created 
[WebServer]  Container seatly-e2e-postgres-1 Created 
[WebServer]  Container seatly-e2e-api-1 Creating 
[WebServer]  Container seatly-e2e-api-1 Created 
[WebServer]  Container seatly-e2e-web-1 Creating 
[WebServer]  Container seatly-e2e-web-1 Created 
[WebServer]  Container seatly-e2e-redis-1 Starting 
[WebServer]  Container seatly-e2e-postgres-1 Starting 
[WebServer]  Container seatly-e2e-redis-1 Started 
[WebServer]  Container seatly-e2e-postgres-1 Started 
[WebServer]  Container seatly-e2e-redis-1 Waiting 
[WebServer]  Container seatly-e2e-postgres-1 Waiting 
Error: Timed out waiting 300000ms from config.webServer.

[ELIFECYCLE] Command failed with exit code 1.
```

### 2. `docker compose -p seatly-e2e -f <apiDir>/docker-compose.yml --profile full logs --tail 100` (stack failed to start): exit 0, last 30 lines

```
postgres-1  | 
postgres-1  | waiting for server to start....2026-10-17 15:08:26.426 UTC [41] LOG:  starting PostgreSQL 17.11 on aarch64-unknown-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
postgres-1  | 2026-10-17 15:08:26.426 UTC [41] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
postgres-1  | 2026-10-17 15:08:26.428 UTC [44] LOG:  database system was shut down at 2026-10-17 15:08:26 UTC
postgres-1  | 2026-10-17 15:08:26.430 UTC [41] LOG:  database system is ready to accept connections
postgres-1  |  done
postgres-1  | server started
postgres-1  | CREATE DATABASE
postgres-1  | 
postgres-1  | 
postgres-1  | /usr/local/bin/docker-entrypoint.sh: ignoring /docker-entrypoint-initdb.d/*
postgres-1  | 
postgres-1  | waiting for server to shut down....2026-10-17 15:08:26.556 UTC [41] LOG:  received fast shutdown request
postgres-1  | 2026-10-17 15:08:26.557 UTC [41] LOG:  aborting any active transactions
postgres-1  | 2026-10-17 15:08:26.558 UTC [41] LOG:  background worker "logical replication launcher" (PID 47) exited with exit code 1
postgres-1  | 2026-10-17 15:08:26.558 UTC [42] LOG:  shutting down
postgres-1  | 2026-10-17 15:08:26.559 UTC [42] LOG:  checkpoint starting: shutdown immediate
postgres-1  | 2026-10-17 15:08:26.585 UTC [42] LOG:  checkpoint complete: wrote 926 buffers (5.7%); 0 WAL file(s) added, 0 removed, 0 recycled; write=0.009 s, sync=0.017 s, total=0.027 s; sync files=301, longest=0.011 s, average=0.001 s; distance=4266 kB, estimate=4266 kB; lsn=0/191E7F8, redo lsn=0/191E7F8
postgres-1  | 2026-10-17 15:08:26.587 UTC [41] LOG:  database system is shut down
postgres-1  |  done
postgres-1  | server stopped
postgres-1  | 
postgres-1  | PostgreSQL init process complete; ready for start up.
postgres-1  | 
postgres-1  | 2026-10-17 15:08:26.678 UTC [1] LOG:  starting PostgreSQL 17.11 on aarch64-unknown-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
postgres-1  | 2026-10-17 15:08:26.678 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
postgres-1  | 2026-10-17 15:08:26.678 UTC [1] LOG:  listening on IPv6 address "::", port 5432
postgres-1  | 2026-10-17 15:08:26.679 UTC [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
postgres-1  | 2026-10-17 15:08:26.681 UTC [57] LOG:  database system was shut down at 2026-10-17 15:08:26 UTC
postgres-1  | 2026-10-17 15:08:26.685 UTC [1] LOG:  database system is ready to accept connections
```

Container state after the timeout: postgres and redis running and healthy (started 15:08:25, ready 15:08:26); api and web stuck in `created` with StartedAt=0001-01-01, so they never started.

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
 Container seatly-e2e-redis-1 Stopped 
 Container seatly-e2e-redis-1 Removing 
 Container seatly-e2e-redis-1 Removed 
 Container seatly-e2e-postgres-1 Stopped 
 Container seatly-e2e-postgres-1 Removing 
 Container seatly-e2e-postgres-1 Removed 
 Volume seatly-e2e_pgdata Removing 
 Network seatly-e2e_default Removing 
 Volume seatly-e2e_redisdata Removing 
 Volume seatly-e2e_pgdata Removed 
 Volume seatly-e2e_redisdata Removed 
 Network seatly-e2e_default Removed 
```

Docker health check run in the same command: a container started during it reported 17:05:42 UTC while the host read 17:10:10 UTC at the end, and `docker run --rm alpine date` took minutes. Docker reports 4 GB of memory.

### 4. Rerun `SEATLY_API_DIR=<apiDir> pnpm e2e:fresh`: still running when the result was due, last lines so far

```
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: nginx/1.31.6
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: built by gcc 15.2.0 (Alpine 15.2.0) 
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: OS: Linux 7.0.14-linuxkit
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: getrlimit(RLIMIT_NOFILE): 1048576:1048576
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker processes
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 31
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 32
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 33
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 34
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 35
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 36
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 37
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 38
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 39
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 40
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 41
[WebServer] web-1       | 2026/10/17 17:10:36 [notice] 1#1: start worker process 42
[WebServer] api-1       | warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
[WebServer] api-1       | For more information, see: https://pris.ly/prisma-config
[WebServer] api-1       | 

Running 4 tests using 2 workers

  ✓  2 [chromium] › e2e/smoke.spec.ts:5:3 › smoke › SMOKE-1 the events page lists the seeded events (290ms)
  ✓  3 [chromium] › e2e/smoke.spec.ts:13:3 › smoke › SMOKE-2 a new user can register and open the event with sales on (348ms)
  ✓  1 [chromium] › e2e/events-search.spec.ts:3:1 › TC-13 visitor searches by venue, refreshes, then clears (1.9s)
  ✓  4 [chromium] › e2e/events-search.spec.ts:27:1 › TC-14 visitor sees the no-match message end to end (876ms)

  4 passed (12.4s)
EXIT=0
```

## Matrix

| TC | layer | test | result | note |
|---|---|---|---|---|
| TC-13 | browser | web `e2e/events-search.spec.ts:3` | fail | The test covers the Given/When/Then: search Boulevard, check `?q=`, reload, clear, and check that all 3 events return. It never ran because the stack did not start (webServer timed out after 300000ms). |
| TC-14 | browser | web `e2e/events-search.spec.ts:27` | fail | The test types zzz-nothing and asserts "No events match your search". It never ran, for the same reason. |

## Failures

- **side: fe** | **TC-13, TC-14** | `pnpm e2e:fresh` failed with `Error: Timed out waiting 300000ms from config.webServer.` and no tests ran. **Evidence:** compose created api and web but never started them, even though postgres and redis reached healthy within about 1s; the Docker VM clock and execution were lagging by minutes (container 17:05:42 vs host 17:10:10). **Why fe (uncertain):** there is no evidence of an API defect, and the stall looks like the local Docker environment rather than either code base. It is assigned to fe by default because the Playwright webServer and global-setup harness lives in seatly-web. Recommended action: restart Docker Desktop or give it more memory, then rerun. A rerun was started but had not finished when this report was due.
