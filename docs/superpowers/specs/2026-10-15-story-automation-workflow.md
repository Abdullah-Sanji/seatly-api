# Story Automation Workflow: Design

Date: 2026-10-15
Status: approved (decisions confirmed in conversation on 2026-10-15)

## 1. Goal

One entry point, a Jira story key, runs the whole delivery cycle for Seatly with no human
in the loop until PR review:

    /story SEAT-12

Jira story → readiness check → test cases → FE/BE breakdown → API contract handshake →
parallel implementation in both repos → unit, e2e, contract and browser verification →
two PRs → Jira updated. A human reviews and merges the PRs. Nothing else needs a human.

## 2. Repos and where things live

Two sibling repos, both on GitHub under `Abdullah-Sanji`:

| Repo | Role in the workflow |
|---|---|
| `seatly-api` | Control repo. Holds the agents, skill, workflow script, contract and the per-story run folder. |
| `seatly-web` | Consumer of the contract. Generated API types, Playwright browser e2e. |

Control files (all in `seatly-api`):

| Path | Purpose |
|---|---|
| `.claude/skills/story/SKILL.md` | `/story <KEY>` entry point. Runs the workflow. |
| `.claude/workflows/story.js` | Deterministic orchestration: phases, retries, stop conditions. |
| `.claude/agents/*.md` | One role per agent: workspace-setup, story-analyst, contract-author, contract-reviewer, be-implementer, fe-implementer, verifier, release-publisher. |
| `.claude/story.config.json` | Jira names, repo paths, branch patterns, retry caps. The only file to edit when Jira or repo layout changes. |
| `contracts/openapi.yaml` | The API contract (HTTP + Socket.IO). Source of truth for both sides. |
| `docs/stories/<KEY>/` | Run folder: story snapshot, test cases, breakdown, contract delta, verification report. Committed on the BE branch. |

## 3. Pipeline

Each stage has one agent and one artifact that must exist before the next stage starts.

| # | Stage | Agent (model) | Produces | Stops the run when |
|---|---|---|---|---|
| 0 | Setup | workspace-setup (sonnet) | Worktrees `../seatly-worktrees/<KEY>/{api,web}` on `feat/<KEY>-be` / `feat/<KEY>-fe`, deps installed | Worktree or branch cannot be created |
| 1 | Intake | story-analyst (opus) | `story.md`, `test-cases.md`, `breakdown.md`; Jira subtasks; story moved to In Progress | Definition of Ready fails (questions posted to Jira) |
| 2 | Contract | contract-author (opus) + contract-reviewer (opus) | Updated `contracts/openapi.yaml`, `contract.md`, committed on the BE branch | Reviewer still objects after 2 revision rounds |
| 3 | Implement | be-implementer, fe-implementer (sonnet), in parallel | Code + tests on each branch, generated FE types | — |
| 4 | Verify (per side) | verifier (opus) | `verification-<side>.md` with the traceability matrix | Side still fails after 2 implementer retries |
| 5 | Integrate | verifier in integration mode (opus) | Playwright run against both worktrees, `verification.md` | Still failing after 2 retries routed to the owning side |
| 6 | Publish | release-publisher (sonnet) | Two PRs from the templates, Jira comment with matrix and links, story and subtasks moved to In Review | — |

On any stop, release-publisher runs in escalate mode: pushes whatever exists as WIP branches,
posts the reason and the run folder contents to Jira, and the workflow returns a report.

### Definition of Ready (stage 1)

A story is ready when it has: a user-facing goal, numbered acceptance criteria, named roles,
explicit error or empty states where relevant, and an out-of-scope line. If more than roughly
four subtasks per side would be needed, the analyst asks to split the story instead.

### Test cases (stage 1)

Numbered `TC-n`, Given/When/Then, each tagged with the layer that proves it:
`be-unit`, `be-e2e`, `fe-unit`, `browser`. Every automated test written later carries its
TC id in its name. Every TC has exactly one owning side. The verifier's matrix maps
TC → test → result, and a TC with no test is reported as `not automated`, never as passed.

## 4. Contract handshake (stage 2)

The contract is a file, not a conversation.

- `contracts/openapi.yaml` is hand-authored OpenAPI 3.1. It also carries Socket.IO events
  under `x-socket-events` / `x-socket-client-messages` with their payload schemas, and the
  full error code enum.
- The contract-author writes the delta for the story first, before any implementation,
  with one example per new response, and records the reasoning in `docs/stories/<KEY>/contract.md`.
- The contract-reviewer reads it from the frontend's point of view against the test cases.
  Sign-off is automatic: approve, or send objections. Two rounds max.
- After sign-off the contract is frozen for the story. Only the contract-author may change
  it, and a change re-triggers both implementers.

How each side is held to it:

- Backend: the e2e harness (`test/setup/test-app.ts`) validates every HTTP response against
  the contract with `express-openapi-validator`; a mismatch is a `500 CONTRACT_VIOLATION`
  that fails the test that caused it. `test/contract.e2e-spec.ts` asserts the route inventory
  matches the contract exactly. Swagger UI at `/docs` serves the contract file itself.
- Frontend: `pnpm api:types` generates `src/api/generated/openapi.d.ts` from the contract;
  `src/api/types.ts` only aliases those types. CI fails if the generated file is stale.
- Both: CI runs `oasdiff` between the PR's contract and the base branch and fails on
  breaking changes.

## 5. Verification layers

| Layer | Command | Proves |
|---|---|---|
| BE unit | `pnpm test` (Jest) | Logic in isolation |
| BE e2e | `pnpm test:e2e` (Supertest + Testcontainers) | Behaviour against real Postgres/Redis, and contract conformance of every response |
| Contract | `pnpm contract:lint`, CI `oasdiff` | Valid document, no breaking changes |
| FE unit | `pnpm typecheck`, `pnpm test` (Vitest) | Components and stores against generated types |
| Browser | `pnpm e2e` (Playwright) | The story end to end across both repos |

Playwright starts its own compose project `seatly-e2e` on ports 3100/8180/5433/6380 built from
the two worktrees, so it coexists with a developer's dev stack. Only one e2e stack per machine:
stories run one at a time.

The verifier only receives the story, the test cases and the diff. It never sees the
implementers' transcripts, and it must paste real command output into its report.

## 6. Retries and cost

- Contract review: 2 revision rounds, then stop.
- Per-side verification: 2 implementer retries, then stop.
- Integration: 2 retries, failures routed to the side the verifier names, then stop.
- Model per role follows the org rule (simplest capable model): mechanical roles on Sonnet,
  judgment roles (analysis, contract, verification) on Opus. Set in each agent's frontmatter.

## 7. Running it

```bash
cd seatly-api
claude --add-dir ../seatly-web --add-dir ../seatly-worktrees
> /story SEAT-12
```

Prerequisites on the machine: Docker running, `gh auth login` done, the Atlassian MCP
server from `.mcp.json` loaded (Jira), Playwright Chromium installed in `seatly-web`.

## 8. Out of scope

Auto-merge, deployment, multi-story parallelism on one machine, stories that span more
than these two repos, visual regression testing.
