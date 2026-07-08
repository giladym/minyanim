# Implementation Plan: In-App Direct Messaging

**Branch**: `008-in-app-messaging` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-in-app-messaging/spec.md` (D1–D9).

## Summary

Let any signed-in user send a direct, threaded text message to any other signed-in user and read the
resulting per-correspondent conversations — so a traveler can coordinate a minyan **without exchanging
a phone or email** (D1/D5). Reach is bounded by a per-recipient opt-out (`user.accept_messages`,
default ON — D2) and a per-sender rate limit (20 / 5 min — D3). Messages live in a **dedicated
`message` table** (not the event-only 003 notification system — D4); conversations are **derived at
read time** in the service (D6). Opening a thread marks the caller's received messages read (D7).
Deleting a user cascades away every message they were party to (D8). Block/report is **deferred**
(D9).

Technical spine: a new `message` table + `user.accept_messages` column (migration 0008), a
`messageRepository` + `messageService` (guards + conversation grouping + rate limit) behind three
Hono routes, shared Zod/TS contracts, two error codes, and a frontend inbox + thread page, header
envelope badge, roster "Message" action, and profile opt-out toggle.

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 — unchanged.

**Primary Dependencies**: Hono, Drizzle, Zod v4, better-auth, TanStack Router/Query, react-i18next,
Tailwind v4. **No new runtime deps.** Reuses `lib/auth.ts` (`requireUserId`), `lib/errors.ts`
(`AppError`, `NotFound`, `RateLimited`), and the existing profile round-trip plumbing.

**Storage**: Cloudflare D1 (SQLite) via Drizzle. **One new table** (`message`) + **one ADD COLUMN**
(`user.accept_messages`, default `true`). Conversations are **derived at read time — never stored, no
cron** (mirrors 002 `isPast`, 005 zmanim).

**Testing**: vitest-pool-workers — deliver + unread + read side-effect; self (400); opt-out (403);
non-existent recipient (404); rate limit (429); auth required (401). See
`apps/backend/test/message.test.ts` (6 cases).

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding).

**Project Type**: Web — two-app monorepo.

**Performance Goals**: inbox/thread reads are single bounded queries (the inbox read is capped at 500
rows and reduced in-memory; the thread read is a two-direction filter). No fan-out, no N+1 on the hot
path (a name is only looked up for the rare send-only conversation with no inbound row to borrow from).

**Constraints**: RTL/Hebrew-first, WCAG 2.1 AA (FR-012/SC-008); i18n-only strings; tokens-only colors;
secrets via env bindings only (none new); structured logging (no Winston); JSDoc on exports; KISS.

**Scale/Scope**: 2 user stories; 3 read/write endpoints; 1 new table + 1 profile-field addition; 1
new repository + 1 service; 2 error codes; new FE inbox + thread + badge + roster action + profile
toggle; 1 migration (0008).

## Key Design Decisions

### `message` table vs. the 003 notification system (D4)

The 003/005 `notification` table models **event notifications** — a threshold crossing fans out to many recipients, deduped via an
idempotency ledger. Direct messaging is **two-party, threaded, and read/unread per message**.
Overloading `notification` would force one row-shape to serve two very different access patterns
(fan-out broadcast vs. pairwise conversation) and muddy both. A purpose-built `message` table
(`senderUserId`, `recipientUserId`, `body`, `read`, `createdAt`) with a recipient index and a
recipient+sender pair index serves the inbox and thread reads directly.

### Conversation grouping in the service (D6)

There is no `conversation` table. `getConversations` pulls a user's messages (either direction,
newest-first, capped) and reduces them into one preview per other party in a single pass: the first
time an "other party" appears is that conversation's latest message; inbound-and-unread rows increment
that conversation's unread count. A name is normally taken from an inbound row (which carries the
sender's name via the join); for a conversation where the viewer has *only ever sent*, the name is
resolved lazily from the `user` record. This mirrors the project's derived-at-read convention and
avoids a second persistent entity.

### Rate-limit design (D3)

The limit is a query, not stored state: `countSentSince(senderId, now − 5min)` counts the sender's own
rows in the trailing window; `≥ 20` → `429 rate.limited`. It rides on the same `message` table and
`created_at` index, so there is no separate rate-limit store to maintain or expire.

### Guard ordering in `sendMessage` (D1/D2/D3)

Guards run cheapest-and-most-specific first: self-send (`400 message.self`) → recipient exists (`404`)
→ recipient accepts (`403 message.opted_out`) → under rate limit (`429 rate.limited`) → insert. Only
after all guards pass is a row written, so a rejected send stores nothing (SC-004).

### Read side-effect on thread open (D7)

`GET /api/messages/:userId` calls `markThreadRead` (set `read = true` on the caller's unread inbound
rows from that party) *before* returning the thread. Reading is the acknowledgement; there is no
separate mark-read endpoint, which keeps the unread badge honest with a single round trip.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Layered backend (router→controller→service→repository) | ✅ | `routes/messages.ts` → `messageService` → `messageRepository`; validation at the route via `sendMessageSchema`. (Thin feature — no separate controller file; the service is the domain layer.) |
| Contract-first (shared Zod → DTOs + FE) | ✅ | `sendMessageSchema`, `MessageDTO`, `ConversationDTO`, `ThreadDTO` in `packages/shared`; `Profile.acceptMessages` + `updateProfileSchema.acceptMessages`. |
| Hebrew-first / RTL, WCAG 2.1 AA | ✅ | FR-012/SC-008: inbox, thread, badge, roster action, toggle axe-verified; RTL. |
| i18n-only strings, tokens-only colors | ✅ | `messages.*`, `profile.messagesSection/acceptMessages(+Hint)`, `minyanDetail.contactMessage`, `errors.message.*` — he/en parity; no hardcoded colors. |
| Secrets via env bindings only | ✅ | No new secrets. |
| Structured logging (no Winston), JSDoc, KISS | ✅ | Reuse logger; JSDoc on repo/service exports; no over-engineering (derived conversations, query-based rate limit). |
| Cascade correctness | ✅ | Both FKs `ON DELETE CASCADE`; `deleteUserCascade` explicitly deletes both directions (D8). |
| Abuse controls without block/report | ✅ | Opt-out (D2) + rate limit (D3) ship now; block/report deferred (D9), noted in spec Out of Scope. |

**Result**: PASS — no deviations. The notable additions are a **new table** (`message`, structurally
distinct from the 003 `notification` table — D4) and a **profile field** (`acceptMessages`, mirrors 001's
`language`/`theme`/`sharePhone` pattern) — both deliberate and in-scope. No Complexity Tracking
entries.

## Project Structure

### Documentation (this feature)

```text
specs/008-in-app-messaging/
├── plan.md            # This file
├── spec.md            # Feature spec (D1–D9)
├── data-model.md      # message entity + user.accept_messages, cascade, indexes, migration 0008
├── quickstart.md      # End-to-end validation scenarios
├── contracts/
│   └── messages.md    # The 3 endpoints + Zod request/response shapes + error codes
├── tasks.md           # Completed task checklist (T0##)
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/message.ts       # sendMessageSchema; MessageDTO, ConversationDTO, ThreadDTO (TS interfaces)
├── schemas/profile.ts (extend)  # Profile.acceptMessages + updateProfileSchema.acceptMessages
├── errors.ts (extend)       # MESSAGE_SELF = "message.self", MESSAGE_OPTED_OUT = "message.opted_out"
└── schemas/index.ts (extend)    # export the message schema

apps/backend/src/
├── db/schema.ts (extend)    # message table (2 indexes) + user.acceptMessages (default true)
├── ../migrations/0008_*.sql # CREATE TABLE message + 2 indexes + ALTER user ADD accept_messages
├── repositories/messageRepository.ts  # insert / listUserMessages / listThread / markThreadRead / unreadCount / countSentSince
├── repositories/userRepository.ts (extend) # deleteUserCascade also deletes the user's messages
├── services/messageService.ts          # sendMessage (guards), getConversations, getThread, getUnreadCount
├── routes/messages.ts       # POST /api/messages, GET /api/messages, GET /api/messages/:userId
└── index.ts (extend)        # app.route("/", messages)

apps/frontend/src/
├── lib/messages.ts          # queries/mutation: conversations+unread, thread, send
├── features/messages/Messages.tsx  # MessagesPage (inbox) + MessageThreadPage (thread + composer)
├── router.tsx (extend)      # /messages + /messages/$userId routes
├── components/AppShell (extend)     # header envelope + unread badge
├── features/events/MinyanDetail.tsx (extend)  # "Message" action in roster ContactButtons
└── features/profile/… (extend)      # "receive messages" opt-out toggle
```

**Structure Decision**: Web two-app monorepo (unchanged). A new `message` repository + service behind
three routes, plus a profile-field addition (mirrors 001) and frontend inbox/thread/badge/roster/
toggle surfaces. All contracts in `packages/shared`.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
