# NFTH-3088 breakdown

## Backend

### NFTH-3089  [BE] Optional q search on GET /events

What to build:
- Query DTO for `GET /events`: optional string `q`, `@MaxLength(100)`; longer values rejected by the
  global ValidationPipe as 400 `VALIDATION_FAILED` with the standard ErrorBody.
- `EventsService.listEvents(q?)`: when `q` is non-empty, filter `name` OR `venueName` with
  `contains` + `mode: 'insensitive'`, matching `%` and `_` literally; keep `orderBy: { startsAt: 'asc' }`.
  Absent or empty `q` behaves exactly as today. `EventSummary` unchanged.
- Contract (same commit, additive): `q` query parameter (string, maxLength 100) and a 400
  `ErrorBody` response documenting `VALIDATION_FAILED` on operation `listEvents`.
- e2e tests named `it('TC-n …')`.

Owns: TC-1, TC-2, TC-3, TC-4, TC-5, TC-6

Touched areas: `src/events/events.controller.ts`, `src/events/events.service.ts`,
new `src/events/list-events.query.ts`, `contracts/openapi.yaml`, `test/events.e2e-spec.ts`.

## Frontend

### NFTH-3090  [FE] Search input on the events page with debounced, URL-synced filtering

What to build:
- `eventsApi.list(q?)` sends `q` only when non-empty; regenerate types from the contract.
- `EventsView`: search input labelled "Search events" above the grid; fetch debounced about 300 ms;
  no page reload; ignore stale responses from earlier terms.
- Route query sync: `?q=` prefills the input and drives the first fetch; typing uses
  `router.replace`; clearing removes `q` and restores the full list.
- States: "No events match your search" for an empty result with an active term; "No events yet."
  stays for an empty unfiltered list; "Could not load events." on failure.
- Vitest specs and Playwright specs named after the TCs.

Owns: TC-7, TC-8, TC-9, TC-10, TC-11, TC-12, TC-13, TC-14

Touched areas: `src/views/EventsView.vue`, `src/api/events.api.ts`, `src/api/generated`,
new `src/views/EventsView.spec.ts`, new `e2e/events-search.spec.ts`.

## Jira

- Subtasks created: NFTH-3089 (BE, labels backend, claude-story), NFTH-3090 (FE, labels frontend, claude-story).
- Comment "Automation: test cases" posted on NFTH-3088.
- Status transition to "In Progress" not available from Backlog (available: Blocked, Rejected, TODO, Archive); status left unchanged.
