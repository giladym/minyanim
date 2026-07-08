# Quickstart & Validation — In-App Direct Messaging

End-to-end scenarios proving Feature 008. References [contracts/messages.md](./contracts/messages.md),
[data-model.md](./data-model.md), and SC-001…SC-008.

## Prerequisites
- 001–007 applied; the 008 migration applied (`message` table + 2 indexes + `user.accept_messages`
  column, default `true` — locally `pnpm db:migrate:local`, remote dev `pnpm db:migrate:remote`).
- Two signed-in users, A and B (each has a session cookie + a user id — from `GET /api/me`).

## Scenario 1 — Send, receive, read (US1, SC-001/002/003)
1. As A: `POST /api/messages { recipientUserId: B, body: "מתפללים יחד בשבת?" }` → `201` with
   `MessageDTO { mine: true }`.
2. As B: `GET /api/messages` → `{ conversations: [{ userId: A, name: <A's name>, lastBody, lastAt,
   unread: 1 }], unread: 1 }` (SC-001/003).
3. As B: `GET /api/messages/:A` → `ThreadDTO` with A's message (`mine: false`), oldest-first.
4. As B again: `GET /api/messages` → `unread: 0` — opening the thread cleared it (SC-002/D7).
5. Send several more each way → the inbox still shows a **single** conversation per party, newest
   activity first (SC-003).

## Scenario 2 — Opt-out blocks a send (US2, SC-004)
1. As B: `PATCH /api/me { acceptMessages: false }` → `200`.
2. As A: `POST /api/messages { recipientUserId: B, body: "hello" }` → `403`, code
   `message.opted_out`; nothing stored (SC-004).
3. As B: `PATCH /api/me { acceptMessages: true }` → `200`; A's next send delivers normally.

## Scenario 3 — Self, non-existent, rate limit, auth (edges, SC-005/006)
1. As A: `POST /api/messages { recipientUserId: A, … }` → `400`, code `message.self`.
2. As A: `POST /api/messages { recipientUserId: "nope-does-not-exist", … }` → `404`.
3. As A: send 20 messages to B → all `201`; the **21st** within 5 minutes → `429` (SC-005).
4. Unauthenticated `POST /api/messages` (no cookie) → `401` (SC-006).

## Scenario 4 — Cascade delete (SC-007)
- Delete user A → every message A sent or received is removed; B's `GET /api/messages` no longer
  lists A (SC-007/D8).

## Scenario 5 — UI entry point + badge (US1, SC-008)
- On a minyan detail's roster, the "Message" action next to a member opens the thread with that user.
- The header envelope shows the unread badge; opening a thread updates it.
- The profile "receive messages" toggle reflects and updates `acceptMessages`.

## Automated checks (CI)
- **Backend** (vitest-pool-workers) — `apps/backend/test/message.test.ts` (6 cases):
  1. delivers a message → recipient sees it in the thread + conversation unread, then read clears;
  2. rejects messaging yourself (`400 message.self`);
  3. blocks sending to an opted-out user (`403 message.opted_out`);
  4. `404`s messaging a non-existent user;
  5. rate-limits past 20 in the window (`429`);
  6. requires auth (`401`).

  Run:
  ```
  pnpm --filter @minyanim/backend test message
  ```
- **Frontend** (Vitest + TL): inbox list + thread composer render; opt-out toggle round-trips.
- **e2e** (Playwright + axe): inbox, thread, header badge, roster "Message" action, and profile
  toggle meet WCAG 2.1 AA, RTL, keyboard (SC-008).
