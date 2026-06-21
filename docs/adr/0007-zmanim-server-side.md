# 0007 — Zmanim computed server-side; only formatted times cross to the client

**Status**: Accepted (2026-06-21) · **Feature**: 005 Per-Stay Zmanim

## Context

Feature 005 surfaces per-Shabbat candle-lighting and Havdalah times for a Stay/Minyan. The times
are computed with **`kosher-zmanim`** — already a backend dependency (Feature 001 uses it for Hebrew
dates / holidays). `kosher-zmanim` is **LGPL**, and the project constitution + CLAUDE.md flag a
**legal sign-off as pending** for shipping it; the standing rule is that it is computed
**server-side only and never shipped to the client**.

005 expands the *surface* of that usage (astronomical zmanim via `ComplexZmanimCalendar` +
`GeoLocation`, not just `JewishCalendar`), so we record the containment decision explicitly.

## Decision

- Zmanim are computed **in the backend Worker** (`apps/backend/src/lib/zmanim.ts`), offline, from the
  location's coordinates + IANA timezone (`tzFromCoords`). No external zmanim API; no network on the
  read path.
- The HTTP responses (`GET /api/stays/:id/zmanim`, `GET /api/events/:id/zmanim`) carry **only
  formatted `HH:mm` strings + opinion labels** — never the `kosher-zmanim` library, a `GeoLocation`,
  a `DateTime`, or raw astronomical inputs.
- `kosher-zmanim` MUST NOT appear in `apps/frontend` (no dependency, no import). This is guarded by a
  build-time check (SC-006): a static no-import grep over `apps/frontend/src` and a grep of the built
  `apps/frontend/dist` bundle.

## Consequences

- The LGPL surface stays entirely server-side — no new distribution obligation arises from 005 (the
  library is not conveyed to users). The **pending legal sign-off remains a launch gate**, unchanged.
- The frontend renders plain strings; switching the displayed Havdalah opinion (a user preference) is
  pure client-side selection over the two times the server already returned.
- Computation is in-isolate CPU (sub-millisecond), so no caching layer is needed in v1; responses
  carry a short `cache-control` (`private` for the owner-scoped Stay read, `public` for the Minyan).

## Alternatives rejected

- A third-party zmanim HTTP API (Hebcal-class): re-introduces a networked, quota'd dependency and a
  secret on a read path, for no benefit — the offline engine is already in the bundle.
- Computing on the client: would ship the LGPL library to browsers (violates the standing rule and
  the pending sign-off) and leak the astronomical engine.
