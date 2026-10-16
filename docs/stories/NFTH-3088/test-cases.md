# NFTH-3088 test cases

Routes and copy are taken from `contracts/openapi.yaml` (`GET /events`, operationId `listEvents`,
schema `EventSummary`, error code `VALIDATION_FAILED`), `src/events/events.controller.ts`, and
`seatly-web/src/views/EventsView.vue` (route `/events`, existing copy "No events yet." and
"Could not load events.").

### TC-1  Name substring matches case-insensitively
Layer: be-e2e
Owner: be
Covers: AC1, AC2
Given events "Riyadh Jazz Night" at "King Fahd Cultural Centre" and "Comedy Showcase" at "Boulevard Arena"
When a visitor calls `GET /events?q=jAzZ`
Then the response is 200 with exactly the "Riyadh Jazz Night" event

### TC-2  Venue substring matches when the name does not
Layer: be-e2e
Owner: be
Covers: AC2
Given the same two events
When a visitor calls `GET /events?q=boulevard`
Then the response is 200 with exactly the "Comedy Showcase" event

### TC-3  No match returns an empty list
Layer: be-e2e
Owner: be
Covers: AC2 (empty state)
Given the same two events
When a visitor calls `GET /events?q=zzz-nothing`
Then the response is 200 with body `[]`

### TC-4  Absent or empty q returns the full list as today
Layer: be-e2e
Owner: be
Covers: AC3
Given three events with different start dates
When a visitor calls `GET /events` and `GET /events?q=`
Then both responses are 200, contain all three events ordered by `startsAt` ascending, and are identical

### TC-5  q over 100 characters is rejected
Layer: be-e2e
Owner: be
Covers: AC4 (error state)
Given any events
When a visitor calls `GET /events?q=` with 101 characters
Then the response is 400 with the standard `ErrorBody` and `code` = `VALIDATION_FAILED`
And `GET /events?q=` with exactly 100 characters returns 200

### TC-6  Filtered results keep the EventSummary shape and start-date order
Layer: be-e2e
Owner: be
Covers: AC5, scope (sorting)
Given two events whose names both contain "Night" with different start dates, created out of order
When a visitor calls `GET /events?q=night`
Then the response is 200, each item validates against `EventSummary` (no extra fields such as `seats`), and items are ordered by `startsAt` ascending

### TC-7  Search input renders above the list
Layer: fe-unit
Owner: fe
Covers: AC6
Given `eventsApi.list` resolves with two events
When `EventsView` is mounted at `/events`
Then a search input (accessible label "Search events") is rendered before the events grid

### TC-8  Typing filters through the endpoint, debounced
Layer: fe-unit
Owner: fe
Covers: AC7
Given `EventsView` is mounted with fake timers
When the visitor types "j", "ja", "jaz" within 300 ms
Then `eventsApi.list` is not called again until about 300 ms after the last keystroke, is then called once with `q = "jaz"`, and the grid shows the returned events without navigation away from the view

### TC-9  No-match message
Layer: fe-unit
Owner: fe
Covers: AC8 (empty state)
Given a search term is entered and `eventsApi.list` resolves with `[]`
When the debounce elapses
Then the page shows "No events match your search" and not "No events yet."

### TC-10  Clearing the input restores the full list
Layer: fe-unit
Owner: fe
Covers: AC9
Given a filtered list for "jaz"
When the visitor clears the input
Then after the debounce `eventsApi.list` is called without `q` and all events are shown

### TC-11  Search term syncs with the URL query
Layer: fe-unit
Owner: fe
Covers: AC10
Given the route `/events?q=arena`
When `EventsView` is mounted
Then the input is prefilled with "arena", the first `eventsApi.list` call uses `q = "arena"`
And typing a new term replaces the route query `q` (router.replace, no reload); clearing it removes `q` from the URL

### TC-12  Search failure shows the error state
Layer: fe-unit
Owner: fe
Covers: AC7 (error state)
Given a search term is entered
When `eventsApi.list` rejects
Then the page shows "Could not load events." in an alert

### TC-13  Visitor searches by venue, shares and refreshes, then clears
Layer: browser
Owner: fe
Covers: AC6, AC7, AC9, AC10
Given the seeded demo events and a visitor (not signed in) on `/events`
When the visitor types "Boulevard" in the search input
Then only "Comedy Showcase" is listed and the URL contains `?q=Boulevard`
When the page is reloaded
Then the input still shows "Boulevard" and only "Comedy Showcase" is listed
When the visitor clears the input
Then all seeded events are listed and `q` is gone from the URL

### TC-14  Visitor sees the no-match message end to end
Layer: browser
Owner: fe
Covers: AC8
Given the seeded demo events on `/events`
When the visitor types "zzz-nothing"
Then the page shows "No events match your search"

## Coverage

| AC | Test cases |
|---|---|
| 1 | TC-1 |
| 2 | TC-1, TC-2, TC-3 |
| 3 | TC-4 |
| 4 | TC-5 |
| 5 | TC-6 |
| 6 | TC-7, TC-13 |
| 7 | TC-8, TC-12, TC-13 |
| 8 | TC-9, TC-14 |
| 9 | TC-10, TC-13 |
| 10 | TC-11, TC-13 |
