# Phase 1 Data Model — In-App Direct Messaging

Date: 2026-07-08 · Storage: Cloudflare D1 (SQLite) via Drizzle. **One new table** (`message`) + **one
profile-column addition** (`user.accept_messages`). Conversations are **derived at read time** — no
`conversation` entity (mirrors 002 `isPast`, 005 zmanim).

---

## New table — `message`

`apps/backend/src/db/schema.ts` → `message`:

| Field | Type | Notes |
|-------|------|-------|
| id | text, PK | `crypto.randomUUID()` |
| senderUserId | text NOT NULL → `user.id` **ON DELETE CASCADE** | who sent it |
| recipientUserId | text NOT NULL → `user.id` **ON DELETE CASCADE** | who receives it |
| body | text NOT NULL | plain text; validated 1–2000 chars at the route (trimmed) |
| read | integer (boolean) NOT NULL default `false` | set true when the recipient opens the thread (D7) |
| createdAt | integer (timestamp) NOT NULL | `new Date()` at insert; drives ordering + the rate-limit window |

**Indexes**:
- `message_recipient_idx` on `(recipient_user_id)` — unread count + "who messaged me".
- `message_pair_idx` on `(recipient_user_id, sender_user_id)` — thread reads + `markThreadRead`.

A **conversation** is the set of `message` rows between a given user pair; it is not a stored entity.

## Change to `user` (the 001 profile, D2)

`user` gains:

```
acceptMessages: integer("accept_messages", { mode: "boolean" }).notNull().default(true)
```

Default **ON** — any signed-in user may message you until you opt out. Registered in the profile
round-trip (`updateProfileSchema.acceptMessages` + the `Profile` interface), read/written via the
existing `GET /api/me` / `PATCH /api/me`.

## Migration 0008

`apps/backend/migrations/0008_sloppy_dexter_bennett.sql`:

```sql
CREATE TABLE `message` (
  `id` text PRIMARY KEY NOT NULL,
  `sender_user_id` text NOT NULL,
  `recipient_user_id` text NOT NULL,
  `body` text NOT NULL,
  `read` integer DEFAULT false NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_recipient_idx` ON `message` (`recipient_user_id`);
--> statement-breakpoint
CREATE INDEX `message_pair_idx` ON `message` (`recipient_user_id`,`sender_user_id`);
--> statement-breakpoint
ALTER TABLE `user` ADD `accept_messages` integer DEFAULT true NOT NULL;
```

> The `ALTER TABLE user ADD` is a clean single-column add (no PRAGMA-wrapped table rebuild), so it
> does not hit the D1 `PRAGMA foreign_keys` rejection despite `user`'s many FK children.

**NOTE (per CLAUDE.md):** schema changes ship per feature — the remote dev D1 must be migrated on
deploy (`pnpm db:migrate:remote`); CI / Workers Builds do NOT auto-migrate.

## Cascade / deletion (D8)

Both foreign keys declare `ON DELETE CASCADE`. In addition, `userRepository.deleteUserCascade`
**explicitly** deletes messages in both directions:

```
db.delete(message).where(or(eq(message.senderUserId, userId), eq(message.recipientUserId, userId)))
```

so deleting a user leaves no orphaned messages, and the other party's inbox no longer lists the
deleted correspondent.

## Derived — conversations & unread (D6, `messageService`)

- **Inbox** (`getConversations`): `listUserMessages(userId, limit=500)` (either direction,
  newest-first, joined to the **sender's** name) reduced into one `ConversationDTO` per other party.
  The first row seen for an "other party" is that conversation's latest message. Inbound-and-unread
  rows increment `unread`. Name comes from an inbound row's sender name; for a send-only conversation
  (no inbound row) the name is resolved lazily via `findUser`. Sorted newest-activity-first.
- **Unread total** (`getUnreadCount`): `count(*)` where `recipientUserId = userId AND read = false`.
- **Thread** (`getThread`): `markThreadRead` first (set `read = true` on the caller's unread inbound
  rows from that party — D7), then `listThread` (both directions, oldest-first) mapped to
  `MessageDTO` with `mine = senderUserId === userId`.
- **Rate limit** (`countSentSince`): `count(*)` where `senderUserId = senderId AND createdAt > since`
  (D3).

## DTO boundary

- `MessageDTO` — `{ id, body, mine, read, createdAt }` (createdAt as epoch ms). `mine` is
  viewer-relative (drives bubble alignment); no raw `senderUserId`/`recipientUserId` crosses.
- `ConversationDTO` — `{ userId (other party), name, lastBody, lastAt, unread }`.
- `ThreadDTO` — `{ userId (other party), name, messages: MessageDTO[] }`.
- `Profile` gains `acceptMessages`; `UpdateProfileInput` gains it (optional boolean).

## Tests (data-model-critical)

- **Deliver + unread + read**: A→B → B's inbox has one conversation, `unread:1`; opening the thread
  → B's total unread `0` (SC-001/002).
- **Self**: A→A → `400 message.self`, nothing stored.
- **Opt-out**: B sets `acceptMessages:false` → A→B `403 message.opted_out` (SC-004).
- **Non-existent recipient**: → `404`.
- **Rate limit**: 20 succeed, 21st → `429` (SC-005).
- **Auth**: unauthenticated send → `401`.
