# 0009 — In-app direct messaging: any user, with a per-recipient opt-out + rate limit

**Status**: Accepted (2026-07-08) · **Feature**: 008 (in-app messaging)

## Context

Until now the only way to reach another person was a **WhatsApp / email deep link** built from a
shared phone or email (ADR 0008). That forces contact onto an external channel and requires
exposing a phone number. Users need a way to coordinate a minyan **inside the app** — e.g. a
traveler asking a host about times, or co-participants arranging who brings a Sefer Torah — without
handing out a phone number.

The existing `notification` table is strictly **event-centric** (every row references an `event`;
it drives quorum/cancellation nudges). It is the wrong shape for person-to-person threads.

Two scoping options were weighed: **context-scoped** (only people already connected — a minyan's
host and its committed participants) versus **open** (any signed-in user may message any other).

## Decision

Add **direct user-to-user messaging**, open to any signed-in user, on a dedicated table.

- New **`message`** table (`sender_user_id`, `recipient_user_id`, `body`, `read`, `created_at`;
  both FKs `ON DELETE CASCADE`). A "conversation" is the set of rows between a user pair; the inbox
  preview + unread counts are **derived at read time** in the service (no conversation table).
- **Open scope**: any signed-in user may message any other — chosen over context-scoped because the
  product's purpose is connecting people who are *not yet* in the same minyan (mirrors the ADR-0008
  reasoning), and scoping to existing participants would block first contact.
- Guardrails instead of scope: a per-recipient opt-out **`user.accept_messages`** (boolean, default
  **ON**) and a per-sender **rate limit** (≤ 20 messages / 5 minutes, counted over `created_at`).
  Send guards, in order: not-self (`message.self`) → recipient exists → recipient accepts
  (`message.opted_out`) → under rate limit (`rate.limited`) → insert.
- Delivery is **in-app only** (no email/push in v1). Reachable everywhere a `userId` is known —
  notably the minyan roster — so it works even when a person shares no phone/email.

Migration **0008** (`message` table + `accept_messages` column). Applied to remote dev D1 on deploy
(`pnpm --filter @minyanim/backend db:migrate:remote`); CI does not auto-migrate.

## Consequences

- People can coordinate without exposing a phone; complements (does not replace) the WhatsApp/email
  affordances from ADR 0008.
- Abuse surface exists (open messaging). The opt-out + rate limit are the v1 mitigations; they are
  weaker than context-scoping, which is the accepted trade-off for reachability.
- `deleteUserCascade` must remove a user's messages in both directions (done) — no orphans.
- Conversation grouping in application code is fine at community scale; if volume grows it may need a
  materialised last-message index.

## Alternatives

- **Context-scoped messaging** (host ↔ traveler + co-participants only): lower abuse surface, but
  blocks first contact between people not yet in the same minyan — the exact gap ADR 0008 opened up.
- **Overload the `notification` table** (add sender + body, nullable event): mixes two concerns and
  complicates the event-centric queries; rejected in favour of a clean `message` table.
- **Per-user block + report**: deferred to a fast-follow; the global `accept_messages` opt-out +
  rate limit cover v1. When added, this ADR should be amended.
