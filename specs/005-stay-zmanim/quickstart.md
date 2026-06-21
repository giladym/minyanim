# Quickstart & Validation — Per-Stay Zmanim

End-to-end scenarios proving Feature 005. References [contracts/api.md](./contracts/api.md),
[data-model.md](./data-model.md), and SC-001…SC-008.

## Prerequisites
- 001–004 applied; the 005 migration applied (`user.havdalah_opinion` column, default `geonim`).
- A Stay **with coordinates** covering a Shabbat (e.g. Kraków, Fri–Sun), a **coordless** Stay
  covering a Shabbat (manual city), and a Shabbat-dated hosted Minyan.

## Scenario 1 — Stay zmanim (US1, SC-001/002/004)
1. `GET /api/stays/:id/zmanim` for the Kraków Stay → `200` with one `shabbatot` entry: `shabbatDate`,
   `candleLighting`, `havdalahGeonim`, `havdalahRabbeinuTam` — all in Kraków local time, matching a
   published luach within ±1 min (SC-001).
2. A Stay spanning two Shabbatot → two entries, ascending (FR-002).
3. A Stay with no Shabbat in range → `coversShabbat:false`, empty `shabbatot` (SC-004); the card
   shows no zmanim affordance.
4. The dashboard list read (`GET /api/stays?scope=active`) is **unchanged** — no zmanim, no added
   latency (D5/SC-002).

## Scenario 2 — Coordless + uncomputable (US1, SC-003/005)
1. `GET /api/stays/:id/zmanim` for the coordless Stay → `hasCoordinates:false`, empty `shabbatot`;
   the UI shows "add a map location" + a CTA into the edit/map-pick flow (SC-003) — never an error.
2. A Stay at Tromsø over a June Shabbat → the entry's times are `null` with `note:"uncomputable"`;
   the UI shows "cannot be computed at this location" (SC-005) — never a fabricated time.

## Scenario 3 — Minyan zmanim, public (US2, SC-004)
1. `GET /api/minyan/:id/zmanim` (no auth) for a Shabbat-dated Vienna Minyan → `200` with Vienna's
   times; a committed viewer and a signed-out viewer get **identical** times (R10).
2. A weekday Minyan → `coversShabbat:false`, empty (SC-004).

## Scenario 4 — Havdalah preference (US3, SC-007)
1. New user → `GET /api/me` shows `havdalahOpinion:"geonim"`; zmanim UI shows the Geonim tzeit as
   Havdalah by default.
2. `PATCH /api/me { havdalahOpinion: "rabbeinu_tam" }` → `200`; reopening zmanim shows the 72-min
   time as Havdalah.
3. `havdalahOpinion: "both"` → both end-of-Shabbat times shown, each labeled.

## Scenario 5 — Yom-Tov adjacency (edge, D2)
- A Shabbat whose motzaei runs directly into Yom Tov → the entry's Havdalah fields are `null` with
  `note:"havdalah_yom_tov"`; candle-lighting (Friday) is still shown. No wrong Havdalah time.

## Automated checks (CI)
- **Backend** (vitest-pool-workers): `lib/zmanim` known-value (Jerusalem 40-min offset; Kraków/NYC/
  London ±1 min); high-latitude → null; Yom-Tov guard; endpoint owner-scope (stay) + public (minyan);
  coordless → `hasCoordinates:false`; weekday minyan → empty; profile `havdalahOpinion` default +
  round-trip.
- **Frontend** (Vitest + TL): expandable section gated by `coversShabbat`; coordless CTA; "cannot
  compute" note; opinion-aware Havdalah; preference control.
- **e2e** (Playwright + axe): zmanim section + preference meet WCAG 2.1 AA, RTL, keyboard (SC-008);
  assert `kosher-zmanim` is absent from the frontend bundle (SC-006).
