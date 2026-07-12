# Phase 1 API Contracts — Multi-type events

Base: `/api` on the backend Worker (Hono). Auth via the better-auth session cookie. Conventions
inherited from 001–013 (unchanged):

- `401 …"auth.required"` if unauthenticated; `404 …"resource.not_found"` if missing **or not
  owned/visible** (never leak existence, never 403); `400 {errors:[{field,code,params?}]}` validation;
  timestamps epoch-ms. Error-code keys in `packages/shared`; FE localizes (he/en).
- Plain Hono + manual `safeParse` (Zod message = code); DTOs enforced via `*.parse()` before
  `c.json()`; service errors throw `AppError(status, code, field)`.
- Temporal checks send `X-Client-Timezone`; the event's own `lat/lng` is preferred for tz.
- The API surface stays the **generic `/api/events`** (003 D21) — `type` is a body/query field, not a
  new route prefix. `seatsRemaining`/`status`/`missingForReady` are **server-derived**, never stored.

New error codes (add to `ERROR_CODES`): `event.type_invalid`, `category.invalid`, `occasion.invalid`,
`rsvp.mode_invalid`, `rsvp.closed`, `visibility.invalid`, `capacity.invalid`, `capacity.full`,
`request.not_pending`, `request.not_host`, `attendance.not_found`, `gathering.attrs_invalid`,
`event.time_invalid` (HH:MM). The shipped minyan `MINYAN_CANCELLED`/`MINYAN_COMPLETED` codes are
generalized to `event.cancelled`/`event.completed` (the `/commit` alias keeps returning the same
localized message so minyan copy is unchanged).

---

## Create / update / cancel (generic, type-aware)

### `POST /api/events`  — create any event type
Body = `CreateEventInput` (widened): generic fields (`type`, `category` (gatherings only), `title`,
`city`, `country`, `lat`, `lng`, `addressPrivate?`, `addressNotes?`, `eventDate`, `startTime?` `'HH:MM'`,
`endTime?` `'HH:MM'`, `rsvpCutoff?`, `occasion?`, `rsvpMode?`, `visibility?`, `capacity?` (guest seats),
`notes?`, `images?`, `hostPartySize`) **plus exactly one detail block** keyed by type:
```jsonc
// hosting (type=gathering, category=hosting)
{ "type":"gathering", "category":"hosting", "title":"…", "city":"…","country":"…","lat":0,"lng":0,
  "eventDate": 0, "occasion":"shabbat", "rsvpMode":"approval", "visibility":"public",
  "capacity": 8, "hostPartySize": 2,
  "gathering": { "mealType":"shabbat_dinner","kashrut":"glatt","dietary":["vegetarian"],
                 "offering":"…","bringItems":"…","alcohol":true,"accessibility":"…" } }
// social (type=gathering, category=social)
{ "type":"gathering", "category":"social", …, "rsvpMode":"open", "capacity": 30,
  "gathering": { "subcategory":"kiddush" } }
// minyan (UNCHANGED payload — back-compat; no category)
{ "type":"minyan", …, "minyan": { "nusach":"any","seferTorah":true,"services":[…] } }
```
Server: `assertUserActive`; `assertNotPast`; `category` is REQUIRED when `type='gathering'`
(missing/unknown → `400 category.invalid`) and FORBIDDEN for `minyan`. **Attrs validation mechanics**:
the wire `gathering` block carries no `category` key (it stays top-level on the event), so a literal
`z.discriminatedUnion` cannot discriminate — validation is a **per-category schema map**:
`ATTRS_BY_CATEGORY[category].parse(body.gathering)`. Unknown category → `400 category.invalid`; attrs
mismatch → `400 gathering.attrs_invalid`. Apply defaults by category for omitted
`rsvpMode`/`visibility`/`capacity` (`CATEGORY_META`: hosting→approval, social→open); create `event` +
detail in one `db.batch`. Host self-attendance is
written **only for `hostSelfAttends` types** (minyan → a `confirmed` attendance that counts toward
quorum; gathering → NO host attendance row, the host is the organizer and is not counted against
`capacity`, R12). Fire nearby notifications (minyan only, as today).
→ `201 OwnerEventDTO`. Missing/foreign-type detail block → `400 gathering.attrs_invalid` /
`event.type_invalid`.

### `GET /api/events/:id`
Returns the tier for the viewer (R6): host→`OwnerEventDTO`; **confirmed**→`ParticipantEventDTO`;
signed-in non-confirmed (incl. `pending`/`waitlisted`)→`RosterEventDTO`; signed-out→`PublicEventDTO`.
Every DTO carries the derived `rsvpState` (`open` | `closed` — from `rsvpCutoff`/`eventDate` vs now,
R11) and, when capacity is set, `seatsRemaining`. **`rsvpState=closed` does NOT terminate an existing
pending request until the event date passes**: cutoff-passed + date-not-passed → the request stays
pending (the host may still resolve it, FR-016) and the viewer sees "registration closed, your request
still awaits the host"; only once the event date has passed does a still-pending request read as
terminal "closed". Hidden + not host → `404`. Unlisted is reachable by direct id (link) but excluded
from discovery.

**Hosting-category roster privacy**: for `category='hosting'` events, the confirmed guest list
(names/phones) is visible to **confirmed attendees + host only** — a signed-in non-confirmed viewer's
`RosterEventDTO` carries an **aggregate confirmed count** ("4 אורחים אושרו") instead of named
attendees (attending a private home meal is more sensitive than a minyan headcount; a deliberate
revision of ADR-0008's roster openness FOR HOSTING ONLY — minyan + social keep today's roster
behavior). Host contact stays visible pre-request; pending names remain host-only via `/requests`.

### `PATCH /api/events/:id`  — host edits (type-aware)
Body = `UpdateEventInput` (generic fields + optional type-attrs block). Host-only (`404` otherwise).
Reducing `capacity` below the confirmed party-size sum is rejected `400 capacity.invalid` (never
auto-bumps confirmed guests off). → `200 OwnerEventDTO`.

### `POST /api/events/:id/cancel`
Host-only. Voids attendances + roles (idempotent), notifies confirmed attendees (`cancelled`, R8).
→ `200 OwnerEventDTO`.

---

## Attendance (generalized RSVP)

### `POST /api/events/:id/attendance`  — join / request a seat
Body `{ partySize, stayId? }`. Behavior by the event's `rsvpMode` (server decides atomically, R3/R4):
- **open**: single guarded `INSERT … SELECT … RETURNING status` → `confirmed` if the confirmed
  party-size SUM + `partySize` ≤ `capacity` (or `capacity` null); else `waitlisted`.
- **approval** (hosting gatherings): → `pending` (host must approve; no capacity math at request time). Notifies host
  `seat_requested` (R8).
- **invite**: only an invited user may join (v1: scaffolded; non-invited → `404`).
Guards: `assertUserActive`; `assertJoinable` (not cancelled/completed); **not closed** — reject
`400 rsvp.closed` if `now > rsvpCutoff` or the event date has passed (R11). `UNIQUE(event_id,user_id)`:
a re-join after a prior cancel/decline **UPDATEs** the existing row (soft model, R14). → `200 { event:
<tier DTO>, myStatus }`.
Minyan: `rsvpMode='open'`, no capacity → always `confirmed` = today's commit (SC-005).

### `PATCH /api/events/:id/attendance`  — change own party size
Clamped 1..PARTY_SIZE_MAX. Increasing a **confirmed** party re-runs the fit guard and is **rejected
`400 capacity.full` if it no longer fits** (the guest keeps their current confirmed size — symmetric
with the host-side capacity-reduce guard); increasing a **waitlisted/pending** party just updates the
row (no capacity math until confirm/promote). A confirmed row is NEVER demoted to `waitlisted` by this
endpoint. A guest **reducing** party size is the "reduce to fit" path when a host couldn't approve an
over-sized request. → `200`.

### `DELETE /api/events/:id/attendance`  — cancel own attendance
Soft-sets `status='cancelled'` (R14). If the cancelled row was **confirmed** and the event is **open
mode**, atomically promote the **earliest-requested waitlisted attendee that still fits**
(`… WHERE confirmed_sum + party_size ≤ capacity ORDER BY requested_at,id LIMIT 1 RETURNING user_id`) and
notify them `waitlist_promoted` (R4/FR-006). In **approval mode** a freed seat does NOT auto-confirm —
the host is notified a seat opened and may approve a pending request. → `200`.

### `POST/PATCH/DELETE /api/events/:id/commit`  — legacy minyan alias (unchanged wire)
The shipped minyan FE keeps calling these; they delegate to the attendance service (open mode,
`status='confirmed'`). No behavior/pixel change (SC-005, R13).

### `GET /api/events/:id/requests`  — host: list pending requests
Host-only. Returns `[{ attendanceId, user: <public profile + phone if shared>, partySize,
requestedAt, status }]` for `status='pending'`, ordered by `requestedAt` (the queue). Non-host → `404`.
(Approval mode has no `waitlisted` rows.)

### `POST /api/events/:id/requests/:attendanceId/approve`
Host-only. One guarded `UPDATE … WHERE id=? AND status='pending' AND (capacity IS NULL OR
confirmed_sum + party_size ≤ capacity) RETURNING id`. On 1 row → `confirmed`; notify requester
`request_approved`; the guest now sees the exact address on next read (R6). On **0 rows** (ambiguous),
one cheap follow-up read disambiguates: not pending → `400 request.not_pending`; would exceed capacity →
`400 capacity.full` (the guest may reduce party size, or the host messages them — FR-007). → `200
OwnerEventDTO`.

### `POST /api/events/:id/requests/:attendanceId/decline`
Host-only. → `declined`; notify requester `request_declined`; requester never sees the address.
→ `200 OwnerEventDTO`.

---

## My events (FR-017)

### `GET /api/me/events`
Signed-in. Returns `{ hosting: [...], attending: [...] }` of compact event rows: `id`, `kind`,
`title`/`city`, `date`, `status`, `myStatus` (attending rows), and `pendingRequestCount` for hosted
approval-mode events — the host's reliable path back to the requests queue (the badge source for the
"האירועים שלי" surface + the header envelope). No address/contact fields (compact rows only).

---

## Discovery (generalized)

### `GET /api/discovery?lat&lng&radiusKm&from&to&types&categories&occasion&nusach&seferTorah`
Extends 003. New params:
- `types` — CSV subset of `minyan,gathering` (default: all). Filters events by `event.type`.
- `categories` — CSV subset of `hosting,social` (default: all). Filters gathering rows by
  `event.category` (minyan rows are unaffected). Together, `types`+`categories` express the UI's
  kind filter (הכל · מניינים · אירוח · מפגשים).
- `occasion` — one of `OccasionSchema` (default: any). Filters by `event.occasion`.
- `nusach`/`seferTorah` — **minyan-only sub-filters**, applied only to minyan rows (unchanged).

Note: the UI never sends the internal axes directly — the shared **`EVENT_KINDS`** map in
`packages/shared` (`minyan→{type:'minyan',category:null,labelKey,icon}`,
`hosting→{type:'gathering',category:'hosting',…}`, `social→{type:'gathering',category:'social',…}`)
is the ONE home of the kind→(type,category) mapping; the FE picker, discovery chips, `?kind=` deep
links, and server default-resolution (with `CATEGORY_META` defaults) all read it.
Returns per-Shabbat `potential` (unchanged), `events: PublicEventDTO[]` (all in-scope types,
address-free + fuzzed coords), `places`/`layers` (010/011, unchanged), `attribution`. Excludes
`hidden`, cancelled, completed, and non-`public` visibility (unlisted/invite are link-only). The
prior `minyanim` field is replaced by the generalized `events` (FE reads `type` to render).

---

## DTO privacy invariant (all types, SC-003)

`PublicEventDTO`/`RosterEventDTO` **structurally omit** `addressPrivate`, `addressNotes`, exact
`lat/lng`, and contact `email`; those keys appear only on `ParticipantEventDTO`/`OwnerEventDTO`, and
only when the viewer's attendance is `confirmed` (or host). A `pending`/`waitlisted` requester (e.g. on
a hosting gathering) is a non-confirmed viewer. Additionally, for **hosting-category** events the
non-confirmed `RosterEventDTO` omits the named `attendees` list and carries an aggregate confirmed
count instead (see `GET /api/events/:id`). Verified by per-type DTO non-exposure tests.
