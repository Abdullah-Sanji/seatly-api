# NFTH-3088  Search events by name or venue

- Key: NFTH-3088
- Type: Story
- Status at intake: Backlog
- Link: https://saudiazmco.atlassian.net/browse/NFTH-3088
- Intake date: 2026-10-16

## Description (verbatim)

As a visitor, I want to filter the events list by typing part of an event name or venue name, so that I can find an event quickly without scrolling.

Scope: the public events list only. No new pages. Search is case-insensitive substring matching on event name and venue name. Sorting stays by start date ascending.

Acceptance criteria

1. The events list endpoint accepts an optional query parameter named q.
1. When q is present, only events whose name or venue name contains q, case-insensitive, are returned.
1. When q is absent or empty, the full list is returned exactly as today.
1. q longer than 100 characters is rejected with the standard validation error body.
1. The response shape of each event is unchanged.
1. The events page shows a search input above the list.
1. Typing in the input filters the list using the endpoint, debounced by roughly 300 ms, without a page reload.
1. When no events match, the page shows the text "No events match your search".
1. Clearing the input restores the full list.
10. The search term is reflected in the page URL as a query parameter so the filtered view can be shared or refreshed.

Out of scope

Searching by date or status, pagination, result highlighting, searching inside the seat map.

Test data

Seeded demo events are sufficient. At least two events must have different venue names so venue search can be distinguished from name search.

## Acceptance criteria

1. `GET /events` accepts an optional query parameter `q`.
2. When `q` is present, only events whose name or venue name contains `q` (case-insensitive) are returned.
3. When `q` is absent or empty, the full list is returned exactly as today.
4. `q` longer than 100 characters is rejected with the standard validation error body.
5. The response shape of each event is unchanged.
6. The events page shows a search input above the list.
7. Typing in the input filters the list using the endpoint, debounced by roughly 300 ms, without a page reload.
8. When no events match, the page shows the text "No events match your search".
9. Clearing the input restores the full list.
10. The search term is reflected in the page URL as a query parameter so the filtered view can be shared or refreshed.

## Definition of Ready verdict: READY

- User-facing goal: yes (visitor finds an event quickly).
- Numbered, observable acceptance criteria: yes (10).
- Roles: visitor (public, unauthenticated list).
- Error / empty states: no-match copy (AC8), over-long `q` validation (AC4). Fetch failure reuses the existing "Could not load events." state.
- Out of scope stated: yes.
- Size: 1 backend and 1 frontend subtask (limit 4 per side).

Assumptions recorded at intake (no new behaviour invented):
- The existing seed (Riyadh Jazz Night / King Fahd Cultural Centre, Comedy Showcase / Boulevard Arena, Spring Orchestra / Ithra Theatre) satisfies the test-data requirement.
- `q` is matched literally; `%` and `_` are not wildcards (substring semantics).
- The URL query parameter on the web page is also named `q` (`/events?q=...`).
