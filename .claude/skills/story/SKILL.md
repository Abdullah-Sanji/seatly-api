---
name: story
description: Deliver one Jira story end to end with no human in the loop until PR review. Usage /story SEAT-12. Runs the "story-delivery" workflow: intake and test cases, FE/BE breakdown, API contract handshake, parallel implementation in both repos, unit/e2e/contract/browser verification, two PRs and Jira updates.
---

# /story <JIRA-KEY>

The argument is the Jira key, e.g. `SEAT-12`. This command is the user's explicit opt-in to run the multi-agent `story-delivery` workflow.

## Steps

1. Validate the argument matches `^[A-Z][A-Z0-9]+-\d+$`. If not, say so and stop.
2. Pre-flight, in the seatly-api checkout (the current directory):
   - `docker info` works (Testcontainers and the browser e2e stack need it).
   - `gh auth status` works (PRs).
   - Jira tools are reachable: `ToolSearch("+jira")` lists a tool that gets an issue. If not, tell the user to load the Atlassian MCP server (`/mcp`) and stop.
   - `.claude/story.config.json` has `jira.projectKey` set, or the key's prefix is used as-is.
   - `../seatly-web` exists.
   Report any failure in one line each and stop; do not try to fix the machine.
3. Run the workflow with the Workflow tool:
   - `name`: `story-delivery`
   - `args`: `{ "key": "<KEY>", "date": "<today YYYY-MM-DD>" }`
   It runs in the background and notifies on completion. Do not poll it; do not start other work on the story meanwhile.
4. When it completes, report to the user in a few lines: status (`published` or `stopped` with stage and reason), the two PR links, the Jira key, and the count of test cases by result from the matrix. If stopped, name the run folder `docs/stories/<KEY>/` on the backend branch and the Jira comment the escalation posted.

## Notes

- The run writes to worktrees under `../seatly-worktrees/<KEY>/`; it never touches the main checkouts' working trees.
- One story at a time per machine (the browser e2e stack uses fixed ports).
- Re-running `/story <KEY>` resumes on the existing branches; the workflow's agents reuse the worktrees.
