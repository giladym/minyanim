# Feature Specification: In-App Direct Messaging

**Feature Branch**: `008-in-app-messaging`

**Created**: 2026-07-08

**Status**: Implemented (retroactively documented)

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **001** (auth + the `user` profile);
integrates with **003 Minyanim** (a minyan's roster is the primary entry point into a conversation).
Complements the event-only **003/005** notification system without overloading it.

---

## Summary

Any signed-in user can send a direct, in-app text message to any other signed-in user and read the
resulting conversation, **without exchanging a phone number or email**. The purpose is to let a
traveler coordinate a minyan — "are you davening Mincha at 19:00?", "which entrance?" — with the
people already visible to them on a minyan's roster, using only the platform. Messages are grouped
into per-correspondent conversations with an unread badge; opening a conversation clears its unread
count. Each recipient controls a per-account opt-out (`acceptMessages`, default **ON**), and each
sender is held to a rate limit, so the open-to-all reach stays a coordination tool rather than a
spam vector.

---

## Clarifications

### Session 2026-07-08

Decisions (D#) are referenced from the requirements.

- **D1 — Scope = any signed-in user MAY message any other (chosen over context-scoped).** Messaging
  is **not** restricted to a shared minyan/stay context. A user who can *see* another user (the
  common case: on a minyan's roster, a post-005/ADR-0008 visibility tier that already shows names +
  optional phones to any signed-in viewer) can message them. Context-scoping was considered and
  rejected as too restrictive for coordination — the traveler often wants to reach a host before
  committing. The reach is bounded instead by **D2** (recipient opt-out) + **D3** (sender rate limit).
- **D2 — Per-recipient opt-out (`acceptMessages`, default ON).** A new `user.accept_messages`
  boolean, default `true`, lets any user stop receiving *new* messages. When the recipient has opted
  out, a send is rejected `403 message.opted_out`. Default ON keeps the coordination path open for
  the majority while giving an escape hatch. Exposed via the existing profile read/update.
- **D3 — Per-sender rate limit (≤ 20 messages / 5 minutes → 429).** A cheap abuse guard layered on
  top of the opt-out: counting a sender's own messages in the trailing 5-minute window; the 21st in
  that window is rejected `429 rate.limited`. No per-conversation cap and no storage beyond the
  message rows themselves (the count is a query over `created_at`).
- **D4 — A dedicated `message` table, NOT the event-only notification system (007).** Messaging is a
  two-party, threaded, read/unread conversation — structurally different from 007's fan-out
  event-notification model. Overloading `notification` would conflate two concerns; a purpose-built
  `message` table (sender, recipient, body, read, createdAt) keeps both clean.
- **D5 — Messaging works even with no phone/email on file.** The feature's reason to exist is
  reachability without contact details. A recipient with neither a shared phone nor a visible email
  is still messageable (subject to D2/D3) — this is the intended path, not an edge case.
- **D6 — Conversation grouping is derived in the service, not stored.** There is no `conversation`
  table. The inbox is computed at read time by reducing a user's messages into one preview row per
  other party (newest activity first), mirroring the project's derived-at-read convention (002
  `isPast`, 005 zmanim).
- **D7 — Opening a thread marks the viewer's received messages read (a read side-effect).** `GET
  /api/messages/:userId` both returns the thread and flags the caller's inbound-from-that-party
  messages `read = true`, which is what clears the unread badge. Reading is the acknowledgement; no
  separate "mark read" call.
- **D8 — Cascade delete.** Both foreign keys (`sender_user_id`, `recipient_user_id`) reference
  `user` with `ON DELETE CASCADE`, and `deleteUserCascade` explicitly removes every message a user is
  party to (either direction). Deleting a user leaves no orphaned messages.
- **D9 — Block/report DEFERRED to a fast-follow.** Per-user *blocking* and *reporting* are
  explicitly out of scope for this feature (see Out of Scope). The opt-out (D2) + rate limit (D3) are
  the v1 abuse controls; targeted block/report is a planned follow-up.

---

## User Scenarios & Testing

### User Story 1 — Send, receive, and read a conversation (Priority: P1)

A signed-in user messages another user, the recipient sees it in their inbox with an unread badge,
opens the thread to read it, and the unread count clears.

**Independent Test**: User A opens a minyan's roster, taps "Message" next to User B, and sends
"מתפללים יחד בשבת?". User B's header shows an unread badge and their inbox lists one conversation
with A (unread 1). Opening the thread shows A's message and the badge drops to zero.

**Acceptance Scenarios**:

1. **Given** two signed-in users A and B, **When** A sends B a message, **Then** the send returns the
   created message from A's perspective (`mine: true`) and B's inbox shows one conversation with A,
   `unread: 1`, previewing the latest message (US1/D1).
2. **Given** B has an unread message from A, **When** B opens the thread with A, **Then** all of A's
   messages are returned oldest-first and B's total unread count drops to zero (D7).
3. **Given** A and B have exchanged several messages, **When** either opens the inbox, **Then** they
   see a **single** conversation preview for the other party, showing the newest message and its
   time, ordered newest-activity-first (D6).
4. **Given** A has only ever *sent* to B (no inbound row), **When** A opens the inbox, **Then** the
   conversation still shows B's display name (resolved from the user record) — never a blank or an id.

---

### User Story 2 — Control who can reach you (Priority: P2)

A user who no longer wants unsolicited messages turns off "receive messages"; senders are then
blocked from starting or continuing to message them.

**Independent Test**: User B toggles "receive messages" off in their profile. User A's attempt to
message B is rejected with a clear opted-out error; existing threads remain readable.

**Acceptance Scenarios**:

1. **Given** a new user, **When** they view their profile, **Then** "receive messages"
   (`acceptMessages`) is **ON** by default (D2).
2. **Given** B has set `acceptMessages` to `false`, **When** A tries to send B a message, **Then**
   the send is rejected `403 message.opted_out` and no message is stored (D2).
3. **Given** B later turns `acceptMessages` back ON, **When** A sends again, **Then** the message is
   delivered normally.

---

### Edge Cases

- **Messaging yourself** → rejected `400 message.self`; a user cannot open a conversation with
  themselves.
- **Opted-out recipient** → `403 message.opted_out`, nothing stored (D2).
- **Rate limit** → the 21st message from one sender within 5 minutes is rejected `429 rate.limited`;
  earlier messages are unaffected (D3).
- **Non-existent recipient** → `404 resource.not_found` (never leaks whether an id exists vs. is
  simply unreachable — same code as any missing resource).
- **Deleted user** → all messages that user sent or received are removed; the other party's thread no
  longer lists the deleted correspondent (D8).
- **Empty / oversized body** → validation rejects an empty (after trim) body and a body over 2000
  characters with the standard `400 { errors:[{field,code}] }` shape.
- **No phone/email on file** → messaging still works; that is the point (D5).
- **Unauthenticated request** → `401 auth.required` on every messaging endpoint.

---

## Requirements

### Functional Requirements

- **FR-001**: Any **signed-in** user MUST be able to send a text message to any other signed-in user,
  identified by user id — not restricted to a shared minyan/stay context (D1). Every messaging
  endpoint requires authentication (`401 auth.required` otherwise).
- **FR-002**: A message body MUST be non-empty after trimming and at most **2000 characters**;
  violations return the standard `400 { errors:[{field,code}] }` validation shape
  (`message.body_required` / `message.body_too_long`).
- **FR-003**: The system MUST reject a user messaging **themselves** with `400 message.self` and MUST
  NOT store such a message (D1).
- **FR-004**: The system MUST reject a send to a **non-existent** recipient with `404
  resource.not_found`, not leaking existence (D1).
- **FR-005**: A user MUST be able to set a per-account **`acceptMessages`** opt-out (boolean, default
  **`true`**) on their profile; when a recipient's `acceptMessages` is `false`, a send MUST be
  rejected `403 message.opted_out` and nothing stored (D2).
- **FR-006**: A **per-sender rate limit** MUST cap a sender at **20 messages per rolling 5 minutes**;
  the next send in that window MUST be rejected `429 rate.limited` (D3).
- **FR-007**: The inbox read MUST return the caller's conversations as **one preview per other
  party** (other party's id + display name, latest message body + time, that conversation's unread
  count), ordered **newest-activity-first**, plus the caller's **total unread** count — grouped in
  the service, with no stored conversation entity (D6).
- **FR-008**: The thread read (`GET /api/messages/:userId`) MUST return all messages between the
  caller and the other party **oldest-first**, each tagged `mine` from the caller's perspective, and
  MUST **mark the caller's received messages from that party as read** as a side effect (D7).
- **FR-009**: Messaging MUST work when the recipient has **no phone or email** on file — reachability
  without contact details is the intended path (D5).
- **FR-010**: Deleting a user MUST remove **every** message that user sent or received (both foreign
  keys `ON DELETE CASCADE`, and `deleteUserCascade` explicitly deletes both directions), leaving no
  orphaned rows (D8).
- **FR-011**: The message store MUST be a **dedicated `message` table** (sender, recipient, body,
  read, createdAt) — not the event-only notification system (D4).
- **FR-012**: All 008 UI — the inbox list, the thread view + composer, the header envelope + unread
  badge, the roster "Message" action, and the profile "receive messages" toggle — MUST meet WCAG 2.1
  AA, be RTL-correct and keyboard-operable, use i18n-only strings (he/en parity) and tokens-only
  colors.

### Key Entities

- **Message** — a single direct message: `{ id, senderUserId → user (cascade), recipientUserId →
  user (cascade), body, read (default false), createdAt }`. Indexed by recipient
  (`message_recipient_idx`) and by the recipient+sender pair (`message_pair_idx`) for inbox/thread
  reads.
- **Conversation (derived, not stored)** — the set of messages between one user pair, reduced at read
  time into a preview `{ userId (other party), name, lastBody, lastAt, unread }` (D6).
- **User preference** — a new `acceptMessages` boolean on the **001 user profile** (alongside
  `language`/`theme`/`sharePhone`/`havdalahOpinion`): default `true`.

---

## Success Criteria

- **SC-001**: A message sent by A to B appears in B's inbox as one conversation with `unread: 1` and
  in B's thread with A, in 100% of successful sends (US1).
- **SC-002**: Opening the thread clears the recipient's unread count for that conversation to zero,
  in 100% of cases (D7).
- **SC-003**: A user's inbox shows exactly **one** preview per other party regardless of how many
  messages were exchanged, newest-activity-first (D6/FR-007).
- **SC-004**: A send to an opted-out recipient is rejected `403` and stores nothing, in 100% of cases
  (D2/FR-005).
- **SC-005**: A sender's 21st message within a 5-minute window is rejected `429`; the first 20
  succeed (D3/FR-006).
- **SC-006**: A self-send is rejected `400 message.self`; a send to a non-existent user is rejected
  `404`; an unauthenticated request is rejected `401` — each in 100% of cases (FR-001/003/004).
- **SC-007**: Deleting a user removes every message they were party to; a subsequent inbox read by
  the other party does not list the deleted user (D8/FR-010).
- **SC-008**: Messaging UI (inbox, thread, badge, roster action, profile toggle) meets WCAG 2.1 AA
  and is RTL-correct and keyboard-operable (verified).

---

## Assumptions

- The **003 minyan roster** (post-005/ADR-0008 visibility) is the primary place a user discovers who
  to message; the roster's contact controls gained a "Message" action alongside phone/email. Direct
  navigation to a known correspondent's thread is also supported.
- A user's **display name** is always available from the `user` record, so a conversation preview can
  resolve a name even when the viewer has only ever sent (FR-007).
- The rate-limit window and cap (20 / 5 min) are product constants, not user-configurable.
- Message bodies are **plain text**; no attachments, formatting, or rich media in v1.

---

## Dependencies

- **001** — authentication and the `user` profile (the `acceptMessages` field extends it; both
  message FKs reference `user`).
- **003** — the minyan roster, which is the primary UI entry point (a "Message" action in the roster
  contact controls).

---

## Out of Scope

- **Per-user block / report** — explicitly **deferred to a fast-follow** (D9). v1 abuse controls are
  the recipient opt-out (D2) + the sender rate limit (D3).
- **Email / push delivery** — messages are in-app only; no email or push notification is sent when a
  message arrives (the 007 notification system is not wired to messaging in v1).
- **Group / multi-party conversations** — v1 is strictly two-party.
- **Attachments, rich text, edit/delete of a sent message, typing indicators, read receipts beyond
  the recipient's own read state.**
- **Context-scoped restriction** — considered and rejected in favor of the open-to-all model gated
  by opt-out + rate limit (D1).
