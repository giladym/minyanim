# Phase 1 API Contracts — Admin: Moderation, Curation & Metrics

Base: `/api` on the backend Worker (Hono). Conventions inherited from 001–010: `401 auth.required`;
`404 resource.not_found` if missing (or not visible); DTOs hand-built before `c.json()`; the shared
error shape `{ errors: [{ field, code, params? }] }`. **Every `/api/admin/*` route is behind
`requireAdmin`** (`lib/auth.ts`, 010) → `401` signed-out, `403 auth.forbidden` for a non-admin. The
**flag** endpoints are public in the auth'd sense — any signed-in user (`requireUserId`), no admin.

---

## Flagging (US1) — auth'd users, not admin

### `POST /api/events/:id/flag`  (updated — 003 shipped a reasonless version)
Flag a Minyan for moderation. Body validated by `flagContentSchema`. Idempotent per reporter
(`UNIQUE(content_type, content_id, user_id)`). On the **3rd distinct reporter** the event is
auto-hidden server-side (SC-001) — the response does not change (fire-and-record).
- Body: `{ "reason": "spam"|"inappropriate"|"fake"|"other", "reportUser"?: boolean }`.
- `404 resource.not_found` if the event doesn't exist.
- → `200 { ok: true }` · `401` · `404`.

### `POST /api/stays/:id/flag`  (NEW)
Flag a Stay. Same body + semantics as above, `contentType:"stay"`. `404` if the Stay doesn't exist.
- → `200 { ok: true }` · `401` · `404`.

`reportUser:true` attaches a user-level report (`flag.reported_user_id` = the content owner) so the
queue can surface "the reporter also reported the owner" (US1.3). It does **not** by itself sanction
anyone (SC-002).

### `flagContentSchema` (`packages/shared/src/schemas/moderation.ts`)
```jsonc
{
  "reason": "spam",          // z.enum(["spam","inappropriate","fake","other"])
  "reportUser": false        // optional; default false
}
```
`contentType` is derived from the route (`/events/:id/flag` → `"event"`, `/stays/:id/flag` →
`"stay"`), not from the body — the client cannot spoof it.

---

## Moderation queue & content actions (US3) — admin only

### `GET /api/admin/moderation`
The moderation queue: flagged/hidden content aggregated by `(contentType, contentId)`, **auto-hidden
first**, then by reporter count desc, then oldest-first (FR-003).
- → `200 { entries: ModerationQueueEntryDTO[] }` · `401` · `403`.

### `POST /api/admin/moderation/:contentType/:contentId/dismiss`
Dismiss the flags as invalid → **restore** the content (`hidden=false`) and **clear** its flags
(US3.2 / SC-002.4). Idempotent.
- `:contentType` ∈ `stay|event`; `404 resource.not_found` if the content doesn't exist.
- → `200 { ok: true }` · `401` · `403` · `404`.

### `POST /api/admin/moderation/:contentType/:contentId/remove`
Remove the content → `hidden=true` (kept for the record; flags retained). Idempotent.
- → `200 { ok: true }` · `401` · `403` · `404`.

### `ModerationQueueEntryDTO`
```jsonc
{
  "contentType": "event",
  "contentId": "evt_…",
  "reporterCount": 3,
  "reasons": ["spam", "fake"],           // distinct reasons present
  "hidden": true,                         // true ⇒ auto-hidden / removed, needs review
  "reportedUserId": "usr_…",             // the content owner (sanction target); null if unknowable
  "content": { "city": "Vienna", "country": "AT", "title": "Shacharit" },  // light recognizer
  "createdAt": 1751990400000              // earliest flag (urgency/age)
}
```

---

## User sanctions (US3) — admin only

### `POST /api/admin/users/:id/warn`
Record a warning (advisory; does not change `status`). Logged for audit (FR-008).
- → `200 { ok: true }` · `401` · `403` · `404`.

### `POST /api/admin/users/:id/suspend`
Temporarily suspend. Body `{ "suspendDays": number }` (default 7 if omitted) → `status='suspended'`,
`suspended_until = now + days`.
- **FR-009**: if `:id` is an admin and suspending them would leave **zero active admins** →
  `409 admin.last_admin`.
- → `200 { ok: true, status: "suspended", suspendedUntil }` · `400`/`409 admin.last_admin` · `401` ·
  `403` · `404`.

### `POST /api/admin/users/:id/ban`
Permanently ban → `status='banned'`, `suspended_until=null`.
- **FR-009**: last-active-admin guard as above → `409 admin.last_admin`.
- → `200 { ok: true, status: "banned" }` · `409 admin.last_admin` · `401` · `403` · `404`.

### `POST /api/admin/users/:id/reinstate`
Lift a suspension/ban → `status='active'`, `suspended_until=null`. Idempotent.
- → `200 { ok: true, status: "active" }` · `401` · `403` · `404`.

### `SanctionInput` (`packages/shared`)
The action comes from the route; the body carries only `{ "suspendDays"?: number }` (positive int,
suspend only). `UserStatus = z.enum(["active","suspended","banned"])` is exported for the FE.

---

## Enforcement (FR-005) — on the acting user's own paths

Not new endpoints — existing write paths call `assertUserActive(db, userId)`:
- `POST /api/stays` (create), `POST /api/events` (host), `POST /api/events/:id/commit` (commit).
- A **banned** actor → `403 user.banned`. A **suspended** (not expired) actor → `403 user.suspended`
  with `params: { until }`. An **expired** suspension auto-clears to `active` and the request proceeds.
The FE renders a status banner from these codes (FR-005 "informed of their status").

---

## Metrics (US5) — admin only

### `GET /api/admin/metrics`
The v1 metrics view (SC current counts + funnel + top locations; full analytics is v2).
- → `200 AdminMetricsDTO` · `401` · `403`.

### `AdminMetricsDTO` (`packages/shared/src/schemas/metrics.ts`, TS interface)
```jsonc
{
  "users":    { "total": 128, "admins": 2, "suspended": 1, "banned": 0 },
  "stays":    { "total": 340, "active": 90, "hidden": 3 },
  "minyanim": { "total": 210, "forming": 40, "ready": 22, "cancelled": 8, "hidden": 1 },
  "funnel":   { "potential": 90, "hosted": 210, "quorum": 22 },   // north-star: quorum (SC / spec matrix)
  "moderation": { "openFlags": 12, "autoHidden": 4 },
  "topLocations": [ { "city": "Vienna", "country": "AT", "count": 14 } ]  // by activity, desc
}
```
Each count is a single aggregate D1 query (no time-series in v1 — DAU/WAU/MAU and new-sign-ups are
computed from `user.createdAt` windows if cheap, else deferred with the metric marked v2 in the UI;
the spec's SC-001 north-star `minyanim reaching quorum` is `funnel.quorum`). Hand-built DTO (no
inbound parsing).

---

## US4 — covered by 010 (no new contract)

Beit Chabad curation is delivered by the 010 places manager: `GET/POST/PATCH/DELETE
/api/admin/places` (and `/api/admin/layers`) already let an admin CRUD the "Chabad houses" layer, and
those places render on the public map (SC-004). 006 adds **no** Chabad-specific endpoint. Fully
retiring the standalone `beit_chabad_pin` table + folding its pins into `place` is **011**.

---

## Errors (new — `packages/shared/src/errors.ts`)

| Code | Constant | When |
|------|----------|------|
| `admin.last_admin` | `ADMIN_LAST_ADMIN` | suspend/ban would leave zero active admins (FR-009) |
| `user.suspended` | `USER_SUSPENDED` | a suspended user attempts create/host/commit (params `{ until }`) |
| `user.banned` | `USER_BANNED` | a banned user attempts create/host/commit |
| `flag.target_invalid` | `FLAG_TARGET_INVALID` | flag with an unknown `contentType` (defence-in-depth; route already scopes it) |

Reuses `auth.required`, `auth.forbidden` (010), `resource.not_found`. Validation of `reason` /
`suspendDays` uses the shared schemas → the standard `400 { errors:[{field,code}] }` shape.

## Shared contracts (`packages/shared`)
- `schemas/moderation.ts`: `flagContentSchema`, `ContentType` (`z.enum(["stay","event"])`),
  `FlagReason` (`z.enum(["spam","inappropriate","fake","other"])`), `UserStatus`, `SanctionInput`,
  `ModerationQueueEntryDTO` (TS interface).
- `schemas/metrics.ts`: `AdminMetricsDTO` (TS interface).
- `errors.ts` (extend): the four new codes above.
