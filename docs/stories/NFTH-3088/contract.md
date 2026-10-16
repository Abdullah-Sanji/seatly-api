# NFTH-3088 contract

## Round 1

### Operations touched

- `GET /events` (`listEvents`, tag `events`): additive.
  - New optional query parameter `q`: `type: string`, `maxLength: 100`, `required: false`.
  - New `400` response: `ErrorBody`, code `VALIDATION_FAILED` (when `q` is longer than 100 characters).
  - Added an operation `description` and a `200` response example. The response schema is still
    `array<EventSummary>`.

### Schemas touched

None. `EventSummary` is unchanged (AC5). No new `ErrorCode` values because `VALIDATION_FAILED` already
exists. No Socket.IO changes.

### Why

- AC1 and AC2 need `q`. AC4 needs the 100-character limit and a documented 400 response. AC3 and AC5
  need no new shape. TC-1 to TC-6 (BE) and TC-7 to TC-14 (FE) can all be built on this delta.
- The 400 response is documented inline rather than through `components/responses/ValidationFailed`,
  because that shared example describes a body error (`email must be an email`). The inline example
  shows the actual `q` error. The schema and code are the same.

### Examples

`GET /events?q=jazz` returns 200:

```json
[
  {
    "id": "3f1c2a9e-7b4d-4e8a-9c21-5d6f7a8b9c01",
    "name": "Riyadh Jazz Night",
    "venueName": "King Fahd Cultural Centre",
    "startsAt": "2026-11-20T18:00:00.000Z",
    "salesOpenAt": "2026-10-01T09:00:00.000Z",
    "status": "on_sale",
    "availableCount": 42
  }
]
```

`GET /events?q=<101 chars>` returns 400:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "details": { "errors": ["q must be shorter than or equal to 100 characters"] }
}
```

### Breaking-change verdict

`pnpm contract:lint` passes. `pnpm contract:breaking` (oasdiff against `origin/main`) reports **no
breaking changes**. The changelog lists 2 info-level changes: `new-optional-request-parameter` (`q`)
and `response-non-success-status-added` (`400`).

### Notes for implementers

- Matching: a case-insensitive **literal substring** match on `name` OR `venueName` (Prisma
  `contains` + `mode: 'insensitive'`). `%` and `_` must match literally and must not act as
  wildcards. Prisma escapes `contains` values for you, and TC tests should not depend on any other
  behaviour.
- Ordering is `startsAt` ascending in every case, both filtered and unfiltered.
- `q` absent and `q=` (empty) behave identically and return the full list exactly as today (TC-4).
  Do not trim whitespace: the story does not ask for it, so `q=" "` is a literal one-space search.
- Length limit: 100 characters is accepted and 101 is rejected. The limit is enforced by
  `@MaxLength(100)` on a query DTO through the global `ValidationPipe`. The body is the standard
  `ErrorBody` from `AppExceptionFilter`. The exact `details.errors` message text is not part of the
  contract: tests should assert `code`, not the message.
- No match returns `200 []`, not 404.
- FE: send `q` only when it is non-empty. The generated type is
  `operations['listEvents']['parameters']['query'] = { q?: string }`.
