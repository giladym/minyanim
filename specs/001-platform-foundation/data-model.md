# Phase 1 Data Model — Platform Foundation

Date: 2026-06-18 · Storage: Cloudflare D1 (SQLite) via Drizzle ORM

**Ownership**: better-auth **owns** the `user`, `account`, `session`, and `verification` tables
(generated via its Drizzle adapter). `language` and `theme` are added through better-auth's
**`additionalFields`** on `user` (not hand-edited). `phone_number` and all later-feature tables
are **ours**, referencing `user(id)` with `ON DELETE CASCADE`. A **single migration pipeline**
(drizzle-kit generate → `wrangler d1 migrations apply`) covers both better-auth's and our tables.

---

## Entities

### user
The account. better-auth base fields + app extensions.

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | better-auth id |
| name | text | display name (pre-filled from Google) |
| email | text, unique | from Google |
| email_verified | integer (bool) | better-auth |
| image | text, null | Google avatar (optional) |
| language | text, default `'he'` | `'he'` \| `'en'` (extensible) |
| theme | text, default `'system'` | extensible theme identifier — `'light'`\|`'dark'`\|`'system'`\|future |
| created_at | integer (ts) | |
| updated_at | integer (ts) | |

Validation: `language ∈ {he,en}` (v1); `theme` is a free identifier defaulting to `system`.

### account (better-auth)
Links a user to a credential source: the **Google** provider (provider id, account id, OAuth
tokens) **and/or** the **email+password** credential (better-auth stores the password **hash**
here under a `credential`/`email` provider — never a plaintext password). A user may have
multiple `account` rows. **Account linking**: rows sharing a **verified email** resolve to one
`user` (FR-014). `user_id` FK → `user(id)` ON DELETE CASCADE.

### session (better-auth)
Server-side sessions enabling revocation / sign-out-everywhere.

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | |
| user_id | text FK → user(id) | ON DELETE CASCADE |
| token | text, unique | session token |
| expires_at | integer (ts) | 30 days default; short for shared-device |
| ip_address | text, null | |
| user_agent | text, null | |
| created_at / updated_at | integer (ts) | sliding `updateAge ≈ 1 day` |

### verification (better-auth)
Short-lived tokens: OAuth state, **email-verification**, and **password-reset** tokens
(FR-013). Expire; not user-facing.

### phone_number
Multiple contact numbers per user (FR-006).

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | |
| user_id | text FK → user(id) | ON DELETE CASCADE |
| e164 | text | stored in E.164 international format |
| label | text, null | optional ("local SIM", "home") |
| created_at | integer (ts) | |

Validation: `e164` MUST match E.164 (`^\+[1-9]\d{1,14}$`); phones optional (zero or more).

---

## Relationships

```
user 1───* account        (Google link)
user 1───* session         (devices; revoked on delete)
user 1───* phone_number
user 1───* verification
```

All child tables: `ON DELETE CASCADE` from `user`. Later features (Stay, Minyan, Commitment,
Folder) add the same cascade so **deleting a user removes 100% of owned data** (FR-008/SC-007).

## Lifecycle / state

- **Account creation**: on first Google sign-in → upsert `user` (language=`he`, theme=`system`),
  create `account` + `session`.
- **Session**: created on sign-in; `expires_at` = now+30d (default) or short (shared device);
  sliding renewal; deleted on sign-out / revoke / account deletion.
- **Account deletion**: explicit confirm → call better-auth **`deleteUser`** (it removes its
  own `account`/`session`/`verification`/`user` rows); our tables (`phone_number`, later Stays/
  Minyanim/Folders) are removed by **`ON DELETE CASCADE`** from `user`. User is signed out and
  the cookie cleared. Re-sign-in with the same Google identity creates a fresh empty user.

## Indexes

- `user.email` UNIQUE; `session.token` UNIQUE; `session.user_id`, `phone_number.user_id`,
  `account.user_id` indexed (FK lookups + cascade). Declare these in the Drizzle schema.

## Notes

- **Verify D1 enforces `ON DELETE CASCADE`** (SQLite FK enforcement / migration
  `defer_foreign_keys`): add an **integration test** that creates a user with children, deletes
  the user, and asserts zero orphans (FR-008/SC-007). Do NOT rely on cascade unverified.
- D1 has no interactive transactions; if any multi-statement write must be atomic, use
  `db.batch([...])` (a single atomic batch), not `db.transaction`.
- The Jewish-calendar header derives data at request time on the Worker; it persists no
  calendar entity (see [research.md](./research.md) D7).
