# Story runs

Each automated story run (`/story <KEY>`) writes its artifacts here, under `docs/stories/<KEY>/`,
and commits them on the backend branch `feat/<KEY>-be` so a reviewer can follow the reasoning.

| File | Written by | Content |
|---|---|---|
| `story.md` | story-analyst | Snapshot of the Jira story (summary, description, acceptance criteria) and the readiness verdict |
| `test-cases.md` | story-analyst | `TC-n` cases, Given/When/Then, layer (`be-unit`, `be-e2e`, `fe-unit`, `browser`), owning side |
| `breakdown.md` | story-analyst | FE and BE subtasks with Jira keys and the TCs each owns |
| `contract.md` | contract-author | What changed in `contracts/openapi.yaml`, why, examples, reviewer objections and resolutions |
| `verification-be.md`, `verification-fe.md` | verifier | Per-side traceability matrix with real command output |
| `verification.md` | verifier (integration) | Browser e2e results and the final matrix across all layers |
| `run.md` | release-publisher | PR links, Jira comment, and anything that stopped or was retried |

Never edit these by hand during a run. After a run they are history.
