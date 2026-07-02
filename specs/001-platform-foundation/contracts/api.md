# Phase 1 API Contracts — Platform Foundation

Base: `/api` on the Worker (Hono). Auth via better-auth session cookie
(`HttpOnly; Secure; SameSite=Lax`). All bodies JSON. Routes are defined with
**`@hono/zod-openapi`** from shared Zod schemas (`packages/shared`); the OpenAPI doc + Swagger
UI are generated from them.

Conventions:
- `401` if unauthenticated on protected routes; `400` on validation failure; timestamps epoch ms.
- **Errors are returned as stable codes, never localized strings** — the frontend i18n renders
  the user-facing text (he/en). Shape: `{ "errors": [{ "field": "<name|null>", "code": "<key>",
  "params"?: {} }] }`. Error-code keys live in `packages/shared`.

---

## Auth (handled by better-auth, mounted at `/api/auth/*`)

These are provided by better-auth's handler; documented here as the effective contract.

### `GET /api/auth/sign-in/google?sharedDevice={bool}&redirect={path}`
Starts Google OAuth (authorization code + PKCE). `sharedDevice=true` → the resulting session
is short-lived (ends on browser close / brief inactivity) instead of 30 days. Sets a
short-lived `HttpOnly` state/PKCE cookie, redirects to Google.
**`redirect` MUST be validated as a relative, same-origin path** (reject absolute URLs /
protocol-relative) to prevent open redirects; fall back to the dashboard if invalid.

### `GET /api/auth/callback/google`
OAuth redirect target. Exchanges the code server-side, upserts `user` + `account`, creates
`session`, sets the session cookie, and redirects to the validated `redirect` (default:
dashboard). Failure → redirect to the homepage with an error **code** in the query (frontend
localizes the message).

### Email + password (better-auth)
- `POST /api/auth/sign-up/email` — `{ email, password, name }` → creates user, sends a
  verification email. → `200` (unverified until verified).
- `POST /api/auth/sign-in/email` — `{ email, password, sharedDevice? }` → session cookie on
  success; `403 { code: "auth.email_unverified" }` if not yet verified.
- `GET  /api/auth/verify-email?token=…` — verifies the address (link from email).
- `POST /api/auth/send-verification-email` — `{ email }` → resends (rate-limited; generic 200).
- `POST /api/auth/request-password-reset` — `{ email }` → sends reset email. **Always `200`**
  regardless of whether the email exists (no account enumeration).
- `POST /api/auth/reset-password` — `{ token, password }` → sets the new password.

All of the above are **rate-limited** (`429 { code: "rate.limited" }`). Password rules
(min length etc.) are enforced via shared Zod schema; failures return field `code`s.
**Account linking**: a verified email shared between a Google account and an email/password
account resolves to one `user` (FR-014).

### `GET /api/auth/get-session`
Returns the current session + user, or `null`. → `200 { user, session } | { user: null }`.

### `POST /api/auth/sign-out`
Revokes the current session (deletes the row). → `200 { ok: true }`. Clears cookie.

---

## Profile

### `GET /api/me`
Current user's profile.
→ `200`
```json
{
  "id": "usr_…",
  "name": "ישראל ישראלי",
  "email": "user@example.com",
  "language": "he",
  "theme": "system",
  "phones": [{ "id": "ph_…", "e164": "+972501234567", "label": "נייד" }]
}
```
`401` if unauthenticated.

### `PATCH /api/me`
Update editable profile fields. Body (all optional):
```json
{ "name": "string (1..120)", "language": "he|en", "theme": "light|dark|system|<id>" }
```
→ `200` updated profile · `400` `{ "errors": [{ "field": "name", "code": "name.too_long" }] }`

### `POST /api/me/phones`
Add a phone number. Body: `{ "e164": "+972…", "label": "string?|null" }`.
Validation: `e164` matches `^\+[1-9]\d{1,14}$` (else `400`
`{ "errors": [{ "field": "e164", "code": "phone.invalid_e164" }] }`). → `201` `{ id, e164, label }`.

### `DELETE /api/me/phones/{id}`
Remove a phone number the user owns. → `204` · `404` if not owned.

### `DELETE /api/me`
Permanently delete the account and all owned data (cascade), then sign out. Requires explicit
confirmation from the client (e.g. `{ "confirm": true }`); without it → `400`.
→ `200 { ok: true }` and the session cookie is cleared. Re-sign-in creates a fresh empty user.

---

## Calendar (server-side compute; see research D7)

### `GET /api/calendar/today?tz={iana}&lat={n}&lng={n}`
Returns the current Hebrew date and the next upcoming holiday for the header. Computed on the
Worker (no calendar library shipped to the client). `tz` defaults to the request's inferred
timezone; `lat`/`lng` optional (for nightfall rollover precision).
→ `200`
```json
{
  "hebrew": { "day": 28, "monthKey": "sivan", "year": 5786, "formatted_he": "כ״ח בסיון תשפ״ו" },
  "gregorianDate": "2026-06-18",
  "upcomingHoliday": { "key": "rosh_chodesh_tamuz", "inDays": 3 }
}
```
Returns **structured/keyed** data (holiday `key`, Hebrew month `monthKey`) so the frontend
localizes names (he/en); `formatted_he` is provided for convenience. `upcomingHoliday` may be
`null`. Response carries cache headers and **expires at the location's next nightfall**.

### `GET /api/health`
Liveness/readiness probe (also checks D1 connectivity). → `200 { "ok": true }`.

---

## Errors

Returned as stable codes (frontend localizes). Shape:
`{ "errors": [{ "field": "<name|null>", "code": "<key>", "params"?: {} }] }`.

| HTTP | Meaning |
|------|---------|
| 400 | validation failure — one or more `{ field, code }` entries |
| 401 | unauthenticated on a protected route (`code: auth.required`) |
| 404 | not found / not owned (`code: resource.not_found`) |
| 429 | rate-limited (`code: rate.limited`) |
| 500 | unexpected (`code: server.error`); calendar source unavailable degrades gracefully (FR-005) |
