---
description: "Task list for In-App Direct Messaging (Feature 008)"
---

# Tasks: In-App Direct Messaging

**Input**: Design documents from `specs/008-in-app-messaging/` (plan.md, spec.md D1–D9,
data-model.md, contracts/messages.md, quickstart.md).

**Prerequisites**: 001–007 shipped. Branch `008-in-app-messaging`.

**Tests**: REQUESTED — SC-001…SC-008 + quickstart mandate backend coverage
(`apps/backend/test/message.test.ts`, 6 cases). Frontend/e2e cover the UI.

**Organization**: by user story (US1 send/receive P1 → US2 opt-out P2). `[P]` = parallelizable.

**Status**: All tasks complete (documented retroactively).

---

## Phase 1: Setup — Shared Contracts (`packages/shared`)

- [x] T001 [P] Create `packages/shared/src/schemas/message.ts`: `sendMessageSchema` (recipientUserId
  min 1; body trimmed 1–2000, keys `message.recipient_required` / `message.body_required` /
  `message.body_too_long`) + `SendMessageInput`; `MessageDTO { id, body, mine, read, createdAt }`,
  `ConversationDTO { userId, name, lastBody, lastAt, unread }`, `ThreadDTO { userId, name, messages }`
  — TS interfaces, JSDoc. (data-model)
- [x] T002 [P] Extend `packages/shared/src/errors.ts`: `MESSAGE_SELF = "message.self"`,
  `MESSAGE_OPTED_OUT = "message.opted_out"` (rate-limit code `rate.limited` already exists). (contracts §Errors)
- [x] T003 Extend `packages/shared/src/schemas/profile.ts`: add `acceptMessages` to the `Profile`
  interface **and** `acceptMessages: z.boolean().optional()` to `updateProfileSchema`. (D2)
- [x] T004 Export the message schema from `packages/shared/src/schemas/index.ts`; run
  `pnpm --filter shared typecheck`. (depends on T001–T003)

---

## Phase 2: Foundational — schema, migration, repository

**Purpose**: the `message` table + `user.accept_messages` + the data-access layer both stories build on.

- [x] T005 Add the `message` table to `apps/backend/src/db/schema.ts` (id PK; `senderUserId` +
  `recipientUserId` → `user.id` **ON DELETE CASCADE**; body; read default false; createdAt timestamp)
  with `message_recipient_idx` and `message_pair_idx (recipient, sender)`. Add
  `acceptMessages: integer(..., {mode:"boolean"}).notNull().default(true)` to `user`. (D2/D4/D8)
- [x] T006 Register `acceptMessages` in the profile round-trip: `apps/backend/src/auth.ts`
  better-auth `user.additionalFields`; widen `apps/backend/src/repositories/userRepository.ts`
  `updateUser` field type; add it to the `getProfile` field map. (D2) (depends on T005)
- [x] T007 Generate migration `apps/backend/migrations/0008_sloppy_dexter_bennett.sql` (`pnpm
  db:generate`); verify `CREATE TABLE message` + 2 indexes + single `ALTER TABLE user ADD
  accept_messages ... DEFAULT true NOT NULL`. Apply `pnpm db:migrate:local`. (depends on T005)
- [x] T008 Create `apps/backend/src/repositories/messageRepository.ts`: `insertMessage`,
  `listUserMessages(userId, limit=500)` (either direction, newest-first, joined to sender name),
  `listThread(userId, otherId)` (both directions, oldest-first), `markThreadRead(userId, otherId)`,
  `unreadCount(userId)`, `countSentSince(senderId, since)`. JSDoc. (data-model, D3/D6/D7)
- [x] T009 Extend `apps/backend/src/repositories/userRepository.ts` `deleteUserCascade` to
  `db.delete(message).where(or(sender=user, recipient=user))`. (D8) (depends on T005)

**Checkpoint**: table + column migrated; repository green.

---

## Phase 3: User Story 1 — Send, receive, read a conversation (Priority: P1) 🎯 MVP

**Goal**: send a message; the recipient sees it in the inbox with unread; opening the thread clears
unread; guards (self / 404 / rate limit) enforced.

**Independent Test**: A sends B a message; B's inbox shows one conversation, unread 1; opening it
returns the thread and clears the badge.

### Tests for User Story 1

- [x] T010 [P] [US1] `apps/backend/test/message.test.ts` — deliver + inbox unread + read-clears (D7);
  self → `400 message.self`; non-existent recipient → `404`; rate limit → `429`; auth → `401`.
  (SC-001/002/003/005/006)

### Implementation for User Story 1

- [x] T011 [US1] `apps/backend/src/services/messageService.ts` — `sendMessage(db, senderId, input)`
  with guard order self(400)→exists(404)→accepts(403)→rate(429)→insert (D1/D2/D3);
  `getConversations` (reduce to one preview per other party, lazy name resolution, newest-first, D6);
  `getThread` (markThreadRead then listThread, `mine` per viewer, D7); `getUnreadCount`. JSDoc.
- [x] T012 [US1] `apps/backend/src/routes/messages.ts` — `POST /api/messages` (parse
  `sendMessageSchema` → 201 MessageDTO), `GET /api/messages` (conversations + unread), `GET
  /api/messages/:userId` (thread); all via `requireUserId`. Mount `app.route("/", messages)` in
  `apps/backend/src/index.ts`. (contracts)
- [x] T013 [US1] `apps/frontend/src/lib/messages.ts` — TanStack Query hooks: conversations + unread,
  thread, send mutation (invalidate on success).
- [x] T014 [US1] `apps/frontend/src/features/messages/Messages.tsx` — `MessagesPage` (inbox list, per
  conversation preview + unread) and `MessageThreadPage` (thread bubbles by `mine` + composer). i18n,
  tokens-only, RTL, keyboard.
- [x] T015 [US1] Add routes `/messages` + `/messages/$userId` to `apps/frontend/src/router.tsx`
  (under the authed layout, lazy). Add the header envelope + unread badge to the AppShell.
- [x] T016 [US1] Add a "Message" action to the roster ContactButtons in
  `apps/frontend/src/features/events/MinyanDetail.tsx` (i18n `minyanDetail.contactMessage`) → links to
  the thread with that user. (dependency: 003 roster)

**Checkpoint**: messaging fully functional (MVP).

---

## Phase 4: User Story 2 — Control who can reach you (Priority: P2)

**Goal**: a recipient opt-out (`acceptMessages`) that blocks new sends (403); default ON.

**Independent Test**: B turns off "receive messages"; A's send → `403 message.opted_out`.

### Tests for User Story 2

- [x] T017 [P] [US2] `apps/backend/test/message.test.ts` — B `PATCH /api/me {acceptMessages:false}` →
  A→B `403 message.opted_out` (opt-out guard). (SC-004) *(shipped in the same 6-case file as T010.)*

### Implementation for User Story 2

- [x] T018 [US2] Backend opt-out guard is in `sendMessage` (T011): `recipient.acceptMessages` false →
  `403 message.opted_out`. Round-trip plumbing in T003/T006. (D2)
- [x] T019 [US2] `apps/frontend/src/features/profile/…` — a "receive messages" opt-out toggle
  (`acceptMessages`) with i18n `profile.messagesSection` / `profile.acceptMessages` (+ hint),
  mirroring the language/theme/sharePhone controls; ≥44px, keyboard, tokens-only.

**Checkpoint**: opt-out honored end to end.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T020 [P] i18n he+en parity in `apps/frontend/src/i18n/locales/{he,en}.ts`: `messages.*`,
  `profile.messagesSection` / `profile.acceptMessages` (+ `Hint`), `minyanDetail.contactMessage`,
  `errors.message.*`; the parity test passes. (FR-012)
- [x] T021 [P] e2e / axe pass over the inbox, thread, header badge, roster action, and profile toggle
  — WCAG 2.1 AA + RTL + keyboard. (SC-008)
- [x] T022 Run `specs/008-in-app-messaging/quickstart.md` scenarios 1–5 against `pnpm dev`. Note in
  scope that **block/report is deferred** (D9) and there is **no email/push delivery** in v1.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: T001/T002 [P]; T003 after T002-adjacent; T004 after T001–T003.
- **Phase 2 (Foundational)**: T005→T006/T007/T009; T008 after T005. BLOCKS stories.
- **US1 (Phase 3)**: after Phase 2. T010 test; T011→T012→T013→T014→T015→T016.
- **US2 (Phase 4)**: after Phase 2 (guard in T011; plumbing in T003/T006). T017 test; T018/T019.
- **Polish (Phase 5)**: after the stories; T020/T021 [P]; T022 last.

## Implementation Strategy

**MVP** = Phase 1 + Phase 2 + **US1** (send/receive/read, inbox + thread, guards) — shippable and
independently testable. Then **US2** (the opt-out; its backend guard already lands with US1's
`sendMessage`, so the default-ON behavior is honored from day one). Block/report is a **deferred
fast-follow** (D9); no email/push delivery in v1.
