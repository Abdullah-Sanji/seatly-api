# NFTH-3088 run report: Search events by name or venue

- Branches: feat/NFTH-3088-be (seatly-api), feat/NFTH-3088-fe (seatly-web)
- Subtasks: NFTH-3089 (BE), NFTH-3090 (FE)
- Artifacts: story.md, breakdown.md, test-cases.md, contract.md, verification-be.md, verification-fe.md, verification.md

## Matrix

| TC | Layer | Test | Result |
|----|-------|------|--------|
| TC-1 | be-e2e | test/events.e2e-spec.ts: name substring matches case-insensitively | pass |
| TC-2 | be-e2e | test/events.e2e-spec.ts: venue substring matches when the name does not | pass |
| TC-3 | be-e2e | test/events.e2e-spec.ts: no match returns an empty list | pass |
| TC-4 | be-e2e | test/events.e2e-spec.ts: absent or empty q returns the full list as today | pass |
| TC-5 | be-e2e | test/events.e2e-spec.ts: q over 100 characters rejected; 100 accepted | pass |
| TC-6 | be-e2e | test/events.e2e-spec.ts: filtered results keep EventSummary shape and order | pass |

| TC | Layer | Test | Result |
|----|-------|------|--------|
| TC-7 | fe-unit | src/views/EventsView.spec.ts: search input renders above the list | pass |
| TC-8 | fe-unit | src/views/EventsView.spec.ts: typing filters through the endpoint, debounced ~300 ms | pass |
| TC-9 | fe-unit | src/views/EventsView.spec.ts: shows the no-match message | pass |
| TC-10 | fe-unit | src/views/EventsView.spec.ts: clearing the input restores the full list | pass |
| TC-11 | fe-unit | src/views/EventsView.spec.ts: search term syncs with the URL query q | pass |
| TC-12 | fe-unit | src/views/EventsView.spec.ts: search failure shows the error state | pass |
| TC-13 | browser | e2e/events-search.spec.ts: visitor searches by venue, refreshes, then clears | pass (1.9s, fresh stack) |
| TC-14 | browser | e2e/events-search.spec.ts: visitor sees the no-match message end to end | pass (fresh stack) |

Minor gap noted by the verifier: TC-13 does not assert that Spring Orchestra is absent from the venue filter.

## Pull requests

- Backend: https://github.com/Abdullah-Sanji/seatly-api/pull/1
- Frontend: https://github.com/Abdullah-Sanji/seatly-web/pull/1
