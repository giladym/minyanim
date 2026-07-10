# 0011 — Admin foundation (allowlist-bootstrapped) + generic places catalogue from open data

**Status**: Accepted (2026-07-09) · **Feature**: 010 (kosher places & map layers) · Establishes the admin foundation 006 Admin will extend

## Context

Feature 010 adds a religious value-add — nearby **kosher/Jewish places** (synagogues, kosher
restaurants, Chabad houses, mikvehs) as a list + map layer — and needs two things the app didn't
have: (a) a way for **admins** to manage that data (the app had **no admin role or routes** at all;
006 Admin was specified but unbuilt), and (b) a **generic place model** and a **licensable worldwide
data source**. The only prior "places" data was the narrow, single-purpose `beit_chabad_pin` table.

## Decision

- **Admin foundation.** Add `user.is_admin` (better-auth `input:false` — never client-settable) and a
  `requireAdmin` guard. The **first admin is bootstrapped from an env allowlist** (`ADMIN_EMAILS`,
  a secret): a signed-in user whose account email is listed is **idempotently promoted** by the
  guard. The guard is the **only writer** of `is_admin` — no self-service promotion, no DB edit, no
  code change. An `/admin` route surface hosts the layers/places manager and is the intended home for
  future 006 controls (moderation/metrics stay in 006).
- **Generic place model.** A `place` table (name, coords, description, images, address, phone, hours,
  kosher metadata, + source/source_id/license/attribution) grouped by an **admin-managed `layer`**
  (not a code enum — create/rename/reorder/retire without a deploy). `beit_chabad_pin` is generalized
  into this model.
- **Data sources, source-pluggable.** **OpenStreetMap (Overpass)** is the primary *pullable* base —
  open data (**ODbL**, attribution). **Google Places** is live-lookup only (its terms forbid
  storing/caching — never seeds the DB). **Proprietary directories** only by permission. **Manual
  admin entry** always available. Every stored place records its **source + license**, and the UI
  renders required attribution; a license that forbids display means the record isn't stored/shown.
- **Import is dev-only + staged.** `tools/places-import/` (like `tools/seed-import/`): fetch → map →
  gate (dedupe by source id + proximity) → emit **reviewable SQL**; the operator applies it via
  `wrangler d1 execute` (`--remote` = the explicit production authorization). Idempotent upsert on a
  unique `(source, source_id)` index.
- **Accessibility.** The **list is the source of truth**; the clustered MapLibre layer is an
  enhancement (works without a tile key). Navigation is via **Google Maps / Waze** public deep links
  (no map-provider API/key/cost).

Migration **0010** (place + layer tables, `user.is_admin`). Applied to remote dev D1 on deploy.

## Consequences

- The app gains a reusable admin capability + a general, extensible places catalogue; adding a new
  category is data (a layer), not code.
- The allowlist avoids the first-admin chicken-and-egg without a self-promotion attack surface; the
  secret must be configured per environment.
- Licensing is enforced by construction (source + license per row; Google never stored).
- **Deferred (to 011):** the destructive `beit_chabad_pin` **drop** + folding discovery's Chabad query
  into `place`. 010 ships **additively** — it copies the pins into a "Chabad houses" layer and leaves
  the old table + discovery untouched, so there is no data loss or discovery regression.
  **✅ Done in 011** (migration 0012, `specs/011-beit-chabad-consolidation/`): the reconcile-then-drop
  landed and discovery now sources Chabad houses (and any active layer) via the generic
  `placesInBbox`/`PlaceDTO` path — `DiscoveryResult.beitChabad`/`BeitChabadPinDTO` removed, `places` +
  `layers` added, with per-layer toggles on the discovery map. `place` is the single source of truth.

## Alternatives

- **Fixed category enum** instead of admin-managed layers — simpler, but every new category is a code
  change + migration; rejected.
- **DB-only `is_admin`** with no allowlist — reintroduces the first-admin bootstrap problem; rejected
  in favour of the env allowlist (secrets-via-env, constitution-aligned).
- **Google Places as the stored source** — richest data, but its ToS forbids caching place records;
  usable only for live lookups, so it can't seed the catalogue.
- **Keep `beit_chabad_pin` as a parallel table** — forks the read/admin/import paths and re-creates
  the enum-vs-data problem; the generic `place` model subsumes it (drop deferred to 011).
