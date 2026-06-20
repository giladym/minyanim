# Phase 1 API Contracts — Discovery & Quorum Formation

Base: `/api` on the backend Worker (Hono). Auth via the better-auth session cookie (001).
Conventions inherited from 001/002:

- `401 { errors:[{field:null, code:"auth.required"}] }` if unauthenticated;
  `404 … "resource.not_found"` if missing **or not owned** (never leak existence / never 403);
  `400 { errors:[{field, code, params?}] }` validation; timestamps epoch-ms. Error-code keys live
  in `packages/shared`; the frontend localizes (he/en).
- Plain Hono + manual `safeParse` (Zod message = code); DTOs enforced via `*.parse()` before
  `c.json()`; service errors throw `AppError(status, code, field)` (D13 reality).
- Requests that do a temporal check send **`X-Client-Timezone`** (002 convention); the event's own
  `lat/lng` is preferred for tz when present.
- User-facing copy is "מניין"; the API surface is generic **`/api/events`** (`type=minyan`), per
  D21. `committedMen`/`status`/`missingForReady` are **server-derived** (R4), never stored.

---

## Discovery

### `GET /api/discovery?lat={}&lng={}&radiusKm={}&from={}&to={}&nusach={}&seferTorah={}`

Search an area + date range; returns per-Shabbat **potential** and hosted **Minyanim** (R2/R3).
`lat/lng` (+ `radiusKm`, default 15) define the bounding box; alternatively `city`/`country` for
coord-less match. Excludes `hidden` and cancelled/completed events (D19/R9). Filters: `nusach`
(includes `any`, D16), `seferTorah` (true filters by `minyan.sefer_torah`). Authenticated; **no
Stay of the caller's own is required** (D22).
→ `200`
```json
{
  "potential": [
    { "shabbat": "2026-08-07", "menCount": 11, "seferTorahCount": 2 }
  ],
  "minyanim": [ /* PublicMinyanDTO[] — address-free */ ],
  "beitChabad": [ { "id":"bcp_…","name":"…","city":"…","lat":0,"lng":0 } ],
  "attribution": "© MapTiler © OpenStreetMap contributors"
}
```
`PublicMinyanDTO` omits `address_private` + contact **structurally** (SC-005). `200` with empty
arrays is valid. Target p95 < 2 s (SC-001).

### `GET /api/discovery/near-stay/{stayId}`

FR-019 (D22, pull): potential + hosted Minyanim near an owned Stay's location for its date range —
the "Minyanim near this stay" detail. → `200` (same shape as `/discovery`) · `404` if the Stay isn't
owned. When `minyanim` is empty, `potential` still populates (prompt-to-host, no dead end).

### `GET /api/discovery/near-stay-counts`

Batched counts for the My-Stays dashboard (avoids N+1 across stay cards, R15): one request returns
`{ counts: { [stayId]: nearbyMinyanCount } }` for all the caller's active Stays. The dashboard
renders the per-card "N Minyanim near this stay" link from this single response (FR-019).

---

## Events (Minyanim)

### `POST /api/events`

Host a Minyan. Body = `CreateEventInput` (shared Zod; `type:"minyan"` + minyan attrs):
```json
{
  "type": "minyan",
  "city":"…","country":"…","lat":0,"lng":0,"addressPrivate":"…|null",
  "eventDate": 1754524800000,
  "notes": "…|null",
  "minyan": {
    "nusach": "ashkenaz",
    "seferTorah": true,
    "services": [
      { "tefilla": "maariv", "time": null },
      { "tefilla": "shacharit", "time": "08:30" },
      { "tefilla": "mincha", "time": null }
    ]
  },
  "hostNumMen": 1
}
```
Enums (shared Zod SSOT): `type:'minyan'`; `tefilla∈{shacharit,mincha,maariv}`;
`nusach∈{ashkenaz,sefard,chabad,mizrachi,any}`; each service `time` is optional and matches
`^([01]\d|2[0-3]):[0-5]\d$`; `services` has ≥1 entry; `hostNumMen` 1..50. `addressPrivate` + `notes`
optional (coords are the location). Validation: structural via
shared Zod; **temporal** server-side (`eventDate` not before destination-local today — tz from the
event's mandatory `lat/lng`; reuse 002's check; no `X-Client-Timezone` fallback since events always
have coords). Creates event + minyan + **host self-commitment** (`hostNumMen`) in one **non-atomic**
`db.batch`; the response DTO is assembled from inputs + generated ids (D11/R6).
→ `201` `OwnerMinyanDTO`. `400`: `location.required`, `date.in_past`, `party_size.invalid`.

### `PATCH /api/events/{id}` (host-only)

Edit a hosted Minyan. Body (all optional): `{ addressPrivate?, notes?, nusach?, seferTorah?,
services? }`. **The date is immutable in v1.** Toggling `seferTorah:false` or removing the Shacharit
service (or any readiness-affecting change) recomputes derived status and may fire a `quorum_lost`
crossing fan-out (R9).
→ `200 OwnerMinyanDTO` · `404` if not the host (never leak existence) · `400` validation.

### `GET /api/events/{id}`

Fetch one Minyan. Uses **`optionalUserId(c)`** (new helper — returns `string|null`, never throws,
unlike 002's `requireUserId`; only precedent for a public route is `routes/calendar.ts`). Shape by
caller relationship (R10/R11): host → `OwnerMinyanDTO`; committed participant → `ParticipantMinyanDTO`;
signed-in non-participant → `PublicMinyanDTO`; **unauthenticated (join-link pre-auth)** →
`PublicMinyanDTO` + sign-in CTA (D13). `404` if missing or `hidden` to a non-owner.

### `POST /api/events/{id}/cancel`

Host-only soft cancel (D11). `{ "confirm": true }` (else `400 confirm.required`). In one `db.batch`
voids commitments + roles; fan out `cancelled` (in-app sync + email via `defer`); drops from active
discovery. **Idempotent** — cancelling an already-cancelled event returns `200` with no re-fan-out.
→ `200 {ok:true}` · `404` if not the host (never leak existence; never 403).

---

## Commitments

### `POST /api/events/{id}/commit`

Body `{ "numMen": 3, "stayId": "stay_…|null" }` (`CreateCommitmentInput`; 1 ≤ numMen ≤ 50, D15).
`UNIQUE(event_id,user_id)` ⇒ duplicate → `409 commitment.duplicate` (use PATCH to change). Rejects
a `cancelled`/`completed` event (`minyan.cancelled` / `minyan.completed`). Sets a soft, non-blocking
**conflict** flag if the caller already has an active commitment on the **same `event_date`** (same
Shabbat/day — can't be in two places; D14/R12). Reveals the address on
success (R10). Recompute + crossing fan-out (R8/R9 — in-app rows synchronous, email via `defer`).
→ `201 { "minyan": ParticipantMinyanDTO, "conflict": true|false }` (single envelope).

### `PATCH /api/events/{id}/commit`

Change party size. Body `{ "numMen": 5 }` (1..50). Triggers the **same recompute + crossing
fan-out** as commit/withdraw (a downward change can fire `quorum_lost`, R9); returns updated
`status`/`committedMen`. → `200 { "minyan": ParticipantMinyanDTO } ` · `404 not_committed`.

### `DELETE /api/events/{id}/commit`

Withdraw. Releases any roles held; recompute (may fire `quorum_lost`, R9). → `200 {ok:true}` ·
`404 not_committed`.

---

## Roles

### `POST /api/events/{id}/roles/{role}` · `DELETE /api/events/{id}/roles/{role}`

`role ∈ {baal_tefila, baal_korei}`. Claim = atomic insert-on-conflict (R5): `409
role.already_claimed` if taken; `403 not_committed` if the caller hasn't committed. Release =
delete the caller's claim → reopen + recompute readiness. → `200 ParticipantMinyanDTO`.

---

## Notifications

### `GET /api/notifications?unreadOnly={bool}`

The caller's in-app inbox, newest-first. → `200 { notifications: NotificationDTO[], unread: N }`.

### `POST /api/notifications/{id}/read` · `POST /api/notifications/read-all`

Mark read. → `200 {ok:true}`.

> In-app `notification` rows are written **synchronously** with the authoritative write (source of
> truth). The **email** is deferred via `defer`/`ctx.executionCtx.waitUntil`, sent through a net-new
> backend localized template map (`he`/`en`, keyed by `user.language`) over an **injectable**
> `EmailSender` (per-recipient try/catch, log-and-continue; best-effort). Not a client call (R8).

---

## Flag (affordance; thresholds owned by 006 — D19)

### `POST /api/events/{id}/flag`

Record a flag (`UNIQUE(event_id,user_id)` — one per user; repeat → `200` idempotent). 003 only
stores flags and honors `event.hidden`; the 3-flag auto-hide rule + moderation UI are Feature 006.
→ `200 {ok:true}`.

---

## WhatsApp share (client-side; FR-012)

No new endpoint. The client builds a `https://wa.me/?text=…` URL from the **`PublicMinyanDTO`**
(public location, date, tefilla/time, `committedMen`, and the `/minyan/:id` join link) — **never**
the `address_private` (SC-005). The join link routes through sign-in (Google or email/password)
preserving a redirect to `/minyan/:id` (D13/R11).

---

## Errors (003 additions)

| Code | Meaning |
|------|---------|
| `commitment.duplicate` | already committed (use PATCH to change size) |
| `commitment.conflict` | (soft) overlapping commitment, same tefilla/date/time — non-blocking |
| `not_committed` | participant-only action by a non-participant |
| `role.already_claimed` | role slot already filled |
| `minyan.cancelled` / `minyan.completed` | commit/act on a non-active event |
| `party_size.invalid` | numMen outside 1..50 |

Plus inherited: `auth.required`, `resource.not_found`, `confirm.required`, `rate.limited`,
`geo.unavailable`, `date.in_past`, `location.required`, `server.error`.
