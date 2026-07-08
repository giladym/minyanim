# Minyanim — Product Roadmap & Feature Decomposition

**Last updated**: 2026-07-08

This document is the source of truth for how the Minyanim platform is decomposed into
features and for the cross-cutting product decisions that every feature spec inherits.
Individual feature specs (`specs/00N-*/spec.md`) reference this file rather than
re-stating shared context.

---

## Product in one paragraph

A web platform for observant Jewish men who travel and need to form a מניין (quorum of
10 men) — most critically on Shabbat (Friday–Saturday), and also for weekday prayers.
Users register **Stays** (where they will be and when). The platform reveals where
enough men are converging, lets someone **host a Minyan** at a specific point, and lets
others **commit** to it. It replaces the manual Google-Sheet + WhatsApp workflow used
today by traveling communities.

**Visual design**: see [`design/`](./../design/) — the "Jerusalem Stone" direction
(Assistant font, warm clay/sand, light + dark). [`design/DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md)
holds the implementation-ready tokens; it primarily drives Feature 001.

---

## Cross-cutting decisions (apply to all features)

1. **Host-point model.** A *Stay* records where a person is. A *Minyan* is a specific
   gathering (precise location + date + tefilla + time) that a host designates and that
   others commit to. Quorum is counted against a **Minyan**, not a whole city. The city
   view shows *potential* (men with stays in the area); a hosted Minyan is the
   *committed* quorum. This mirrors the Excel's "מניין אצלנו בעז״ה" pattern.
2. **Prayer scope: Shabbat + weekday.** Shabbat is the primary case. Stays and Minyanim
   also support weekday tefillot (Shacharit, Mincha, Maariv) per the Excel's
   "מנחה וערבית" notes.
3. **Completeness ≠ headcount.** Quorum is *10 men*. A Shabbat-morning Torah-reading
   minyan is only *ready* when it also has *a Sefer Torah* AND *a Ba'al Korei* (someone
   who can read it) — a Torah nobody can lein is useless. Status reflects all three.
4. **Nusach (in v1).** Minyanim carry an optional nusach (Ashkenaz / Sefard / Chabad /
   Mizrachi / any); users may set a default; discovery can filter by it.
5. **Prayer roles (light, in v1).** A Minyan exposes claimable role slots — **Ba'al Tefila**
   (leader) and **Ba'al Korei** (Torah reader). Participants claim/release them. Gabbai and
   role scheduling are v2.
6. **Notifications: email + in-app in v1; web push in v2.** Triggered on quorum
   thresholds ("quorum reached", "N more needed").
7. **Hebrew-first, RTL primary; English secondary.** Per the project constitution.
8. **Google SSO + email/password** for v1 (email verification + password reset, account
   linking by verified email — per 001 clarification); 30-day persistent sessions with a
   shared-device short-session option. Features are auth-method-agnostic — no flow may assume a
   Google identity.
9. **Contact-info visibility (revised — ADR 0008, post-005):** the goal is to connect people, so
   contact is **reachable before joining**, gated by a per-user opt-out:
   - A minyan's **roster (names) + phone** is visible to any **signed-in** viewer, not only
     committed ones; a **signed-out** visitor sees neither (pure public projection).
   - **Phone** is shown only for a person who **shares it** (`user.share_phone`, default ON).
     **Email**, the **exact coordinates**, the **specific address**, and **entry notes** remain
     **committed-participant / host only**.
   - The discovery **travelers list** shows each traveler's name + phone (sharers only), including
     seeded/imported stays via their own `contactName`/`contactPhone`.
   - Tier ladder: **public → roster (signed-in) → participant (committed) → owner (host)**. This
     supersedes the original "contact only for confirmed participants" rule (003 SC-005/FR-011).
10. **Generic event model.** A Minyan is persisted as a generic **`event`** with a **`type`**
    discriminator (`minyan` is the only type in v1), applied throughout the application — D1
    schema, `packages/shared` Zod contracts, services, and the `/api/events` surface. Commitments
    and notifications reference the generic `event`. Additional event types are future features
    that add a `type` value, not a rewrite. User-facing copy still uses the domain term "מניין"
    (003 decision D21).
11. **In-app messaging (ADR 0009, feature 008).** Beyond the WhatsApp/email deep links of decision 9,
    any signed-in user may send another a **direct in-app message** (`message` table), so people can
    coordinate without exposing a phone. Gated by a per-recipient opt-out (`user.accept_messages`,
    default ON) + a per-sender rate limit. Per-user block/report is a fast-follow.
12. **Seed users + phone-match claim (ADR 0010, feature 009; revises decision 9 for seeds).** The
    one-time import (decision 9 anticipated it) creates **seed users** — `user.kind='seed'`,
    synthetic email, no account, can't sign in — who own visible stays/events. When a real user's
    profile phone matches a seed's, they claim+merge its data (server re-verifies the match) and the
    seed is deleted. Seed contact (phone) is **hidden in discovery until claimed** (they haven't
    consented); their name still shows. Claim auth is **in-app confirm** for the private beta — a
    launch gate requires SMS-OTP or verified-email before public release.

---

## Shared entities (canonical definitions)

- **User** — Google-authenticated account. Fields: Google identity, display name, email,
  language preference (default Hebrew), theme preference (extensible identifier — Light /
  Dark / System in v1, default "system"), zero or more phone numbers (E.164). Supports
  self-service account deletion that cascade-removes all data the user owns (Stays,
  Minyanim they host, commitments, folders).
- **Stay (שהייה)** — a user's presence at a place over a date range. Fields: location
  (city, country, coordinates), specific address (private), arrival date, departure
  date, number of men in party, brings Sefer Torah, prayer needs (Shabbat always;
  weekday tefillot optional), notes, group members, folder, status.
- **Minyan (מניין)** — a hosted gathering at a precise point. Fields: host (User),
  location (address + coordinates), date(s), tefilla(ot) + time, Sefer Torah available,
  **nusach** (Ashkenaz / Sefard / Chabad / Mizrachi / any), **role slots** (Ba'al Tefila,
  Ba'al Korei — claimable by participants), participants, status (forming / quorum-reached
  / ready / cancelled / completed).
  **Cardinality:** one location may host *many* Minyanim — distinguished by tefilla, time,
  host, or nusach (e.g. a hotel with both a 07:00 and an 08:30 Shacharit, or separate
  Friday-night and Shabbat-morning minyanim). Each Minyan belongs to exactly one location.
- **Commitment** — a User joining a Minyan with a party size (men count) for specific
  date(s)/tefillot. Commitments are what aggregate toward quorum.
- **Folder** — a user-defined grouping of that user's Stays.
- **Beit Chabad Pin** — static, curated map entity (name, address, phone, coordinates).
  Informational in v1. Seeded via a one-time import from an officially permitted Chabad.org
  dataset/API (pending licensing) and maintained thereafter by admins.
- **Notification** — email + in-app message triggered by quorum events (system-generated).
- **Message** — a direct user-to-user in-app message (sender, recipient, body, read). Distinct from
  Notification (that is event-driven/system). Feature 008 / ADR 0009.
- **Seed user** — an imported placeholder (`user.kind='seed'`, synthetic email, no account) that
  owns visible Stays/Minyanim until the real person claims them by phone match. Feature 009 / ADR 0010.
- **Admin** — an elevated user role with moderation (remove Stays/Minyanim, ban users),
  Beit Chabad pin curation, and basic platform metrics. Defined in Feature 006.

---

## Feature breakdown & dependency order

| # | Feature | Delivers | Depends on |
|---|---------|----------|------------|
| **001** | Platform Foundation | Google SSO + 30-day sessions, app shell/nav, RTL design system & theme, marketing homepage, basic profile, Hebrew-date + holidays header widget | — |
| **002** | Stays — Create & Manage | Stay entity + CRUD, Add-Stay form with map location picker, Sefer Torah flag, prayer needs, My Stays dashboard (nearest-first), edit/cancel | 001 |
| **003** | Discovery & Quorum Formation | Map + search, *potential* aggregation, host a Minyan, commit/leave, quorum + readiness status (10 men + Sefer Torah + Ba'al Korei), **nusach** + role slots, Beit Chabad pins, filters, **email + in-app notifications** | 002 |
| **004** | Folders & History | Folder CRUD, assign Stays, history view + "attended" tag | 002 |
| **005** | Per-Stay Zmanim | Candle-lighting / Havdalah per Shabbat within a Stay/Minyan | 002 |
| **006** | Admin | Moderation (remove content, ban users), Beit Chabad curation, basic metrics | 001 (+ data from 002/003) |
| **007** | Phone onboarding | Soft post-login nudge for users with no phone → profile with focused field + banner (frontend-only) | 001, 002 |
| **008** | In-app messaging | Direct user↔user messages, per-recipient opt-out + rate limit, inbox/thread UI (ADR 0009) | 001, 003 |
| **009** | Seed import + claim | Seed users (`user.kind`), dev-only staged import tool, phone-match claim/merge, seed-contact hidden until claimed (ADR 0010) | 001, 002, 003, 007 |

**Recommended build order:** 001 → 002 → 003, with 004 and 005 in parallel after 002.
006 (Admin) can be built any time after 001 but is most useful once 003 produces real data.
After 001 + 002 the product is usable single-player; 003 adds the multiplayer quorum loop.
**Status (2026-07-08):** 001–005 + 007–009 shipped to dev; 006 Admin specified but not built;
feature 009 import steps 2–4 (map → gate → create seed rows) pending a real-sheet row-semantics
decision (`tools/seed-import/` step 1 is built).

---

## Deferred to v2 (not in any v1 feature)

- Web push notifications (email + in-app ship in v1).
- Full prayer-role management beyond Ba'al Tefila / Ba'al Korei (gabbai, role scheduling/rota).
- Recurring synagogue fixed schedules.
- Native iOS / Android apps (v1 is web; PWA candidate).
- **Recurring / repeat Stays** (a "duplicate stay" quick action is a candidate v1 fast-follow;
  true recurrence is v2).
- **Real-time** Chabad.org sync (v1 does a one-time seed import + admin curation).
- Full admin analytics dashboard (v1 admin ships moderation, curation, and basic counts only).

> Promoted into v1 (formerly v2): nusach preference, light prayer roles (Ba'al Tefila /
> Ba'al Korei), one-time Chabad.org seed import, and a minimal admin (Feature 006).

---

## Open items to resolve during planning

- Geocoding / map provider — **decided (002 clarification): MapTiler primary, Google Places
  fallback, geocoding server-side**; pending account/key + ToS confirmation (cost ~$25/mo Flex
  at launch).
- **Chabad.org data licensing/ToS** — MUST be verified and permission obtained before any
  import; falls back to manual admin curation if not permitted.
- Spam / abuse mitigation given open Google sign-in (no verification in v1) — Feature 006 moderation.
- PWA / offline support for travelers with poor connectivity abroad.
- Zmanim data provider (e.g. Hebcal-class API) for both the header calendar and per-Stay zmanim.
- Exact v1 admin metrics set (see Feature 006 spec for the proposed matrix).
