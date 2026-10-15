# seatly-api

NestJS 11 + Prisma/PostgreSQL + Redis (holds, cache, pub/sub) + BullMQ + Socket.IO. pnpm. TypeScript strict.
Design: `docs/superpowers/specs/2026-10-12-seatly-design.md`. Delivery automation:
`docs/superpowers/specs/2026-10-15-story-automation-workflow.md` and `/story <JIRA-KEY>`.

## Commands

```bash
docker compose up -d postgres redis   # local deps
pnpm prisma:migrate && pnpm prisma:seed
pnpm start:dev
pnpm test            # unit (Jest, *.spec.ts under src)
pnpm test:e2e        # Testcontainers (Docker required); every response validated against the contract
pnpm contract:lint   # contracts/openapi.yaml is valid OpenAPI
pnpm build
```

## The contract rule

`contracts/openapi.yaml` is the API contract for HTTP and Socket.IO. The frontend generates its
types from it; the e2e harness fails any response that does not match it; `test/contract.e2e-spec.ts`
fails if a served route is missing from it or a documented one is not served.

- Change behaviour → change the contract in the same commit. Never the other way round silently.
- Additive changes only unless the story says otherwise; CI fails on breaking changes (oasdiff).
- Every operation needs an `operationId`, every error response documents its `code`s.
- Socket events go under `x-socket-events`; their payload schemas live in `components/schemas`.
- Swagger UI at `/docs` serves this file. Do not add `@nestjs/swagger` response decorators.

## Conventions

- Errors: throw `AppException(ErrorCode, HttpStatus, message, details)`. Add new codes to the
  enum in `src/common/errors/error-code.enum.ts` AND to `ErrorCode` in the contract.
- Response shapes are plain interfaces next to the service that produces them; keep field names
  identical to the contract schema.
- Tests: unit next to the code; e2e in `test/*.e2e-spec.ts` using `startTestApp()` and
  `test/setup/fixtures.ts`. Name tests after the story test case they prove: `it('TC-3 …')`.
- Prettier: single quotes, trailing commas, width 100. Run `pnpm format` before committing.
- Commit messages: conventional (`feat:`, `fix:`, `test:`, `docs:`), one logical change each.

## Story runs

`docs/stories/<KEY>/` holds the artifacts of one automated story run (see `docs/stories/README.md`).
Branches: `feat/<KEY>-be` here, `feat/<KEY>-fe` in seatly-web. Worktrees under `../seatly-worktrees/<KEY>/`.
Workflow config: `.claude/story.config.json`.
