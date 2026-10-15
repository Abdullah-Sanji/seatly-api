# API contract

`openapi.yaml` is the single source of truth for the Seatly API: HTTP operations, schemas, error
codes and Socket.IO messages (`x-socket-events`, `x-socket-client-messages`).

Who uses it:

- **seatly-web** generates `src/api/generated/openapi.d.ts` from it (`pnpm api:types`).
- **seatly-api e2e** validates every response against it (`src/contract/contract.ts`), and
  `test/contract.e2e-spec.ts` pins the route inventory.
- **Swagger UI** at `/docs` serves it verbatim.
- **CI** lints it and runs `oasdiff` against the base branch; breaking changes fail the PR.

Rules:

1. Change the contract before, or in the same commit as, the behaviour. The story workflow
   changes it in the contract step, before any implementation.
2. Prefer additive changes. A breaking change needs a reason in `docs/stories/<KEY>/contract.md`
   and the CI failure acknowledged in the PR.
3. Every operation: `operationId`, `tags`, `summary`, every response with its `code`s named in
   the description and an example for new shapes.
4. Response schemas use `additionalProperties: false` so unexpected fields are caught.
5. New error codes go in `ErrorCode` here and in `src/common/errors/error-code.enum.ts`.

Local checks:

```bash
pnpm contract:lint
git show origin/main:contracts/openapi.yaml > contracts/openapi.base.yaml
pnpm contract:diff       # changelog vs main
pnpm contract:breaking   # fails on breaking changes
```
