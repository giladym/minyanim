# 0008 — Contact visibility: reachable-before-join, with a per-user phone opt-out

**Status**: Accepted (2026-07-03) · **Feature**: post-005 contact-visibility change (revises 003 SC-005 / FR-011 and ROADMAP decision 9)

## Context

The product's core purpose is to **connect people so a minyan forms**. The original 003 model made
all contact (phone + email) and the roster visible **only after commitment** (SC-005 / FR-011 /
ROADMAP decision 9): a non-committed viewer saw an address-free, contact-free `PublicMinyanDTO`, and
the "travelers in the area" list was an **anonymous aggregate count**. In practice this blocked the
connection: you had to join before you could reach anyone, and travelers who had not yet formed a
minyan were unreachable — which also blocked a planned one-time import of known travelers (name +
phone) who have no account.

## Decision

Contact becomes **reachable before joining**, gated by a per-user opt-out, while the physical
meeting point stays commit-only.

- **`user.share_phone`** (boolean, default **ON**; migration 0006; a better-auth additional field).
  A user's phone is shown to others **only when they share it** — enforced identically in the minyan
  roster and the travelers list. Opting out hides the phone from everyone, including committed
  co-participants.
- **Roster before join.** A **signed-in** viewer who has **not** committed now receives a new
  `RosterMinyanDTO` tier: the participant list + host contact (phones of sharers only). The
  **exact coordinates, specific address, and entry notes still reveal only on commit**; **email is
  committed-only**; a **signed-out** visitor still gets the pure `PublicMinyanDTO` (no roster, no
  contact).
- **Travelers list contact.** The discovery "travelers in the area" per-Shabbat buckets now carry
  each traveler's **name + phone** (sharers only). The phone resolves from the owning user's shared
  phone, or — for a **seeded/imported** stay with no account — from the stay's own
  `contactName`/`contactPhone`. This is what makes a one-time import reachable in Search.
- **Stays dashboard.** Each active stay shows an "already in a minyan here" indicator when the owner
  is committed to a minyan at that place/time.

## Consequences

- This is a **deliberate relaxation of SC-005**: contact (phone) and the roster are no longer
  strictly committed-only. The tier ladder is now **public → roster (signed-in) → participant
  (committed) → owner (host)**. The projection boundary that still holds: exact location + address +
  entry notes + email never leave the committed/owner tiers, and nothing leaks to signed-out users.
- Importing personal phone numbers of **unregistered** people and surfacing them in Search is a
  **consent decision owned by the product owner** (pre-launch). Registered users always have the
  opt-out; imported per-stay contacts are shared by default (that is the purpose of seeding them).
  The import script itself is out of scope of this change.
- Remote D1 must be migrated on deploy (`pnpm db:migrate:remote`) — the column is not auto-applied
  by CI / Workers Builds.

## Alternatives rejected

- **Keep contact strictly committed-only + add the opt-out.** Preserves SC-005 but does not meet the
  goal (you must join before contacting anyone) and leaves imported travelers unreachable.
- **Expose contact to signed-out visitors / in the public projection.** Rejected — needlessly widens
  exposure; a sign-in gate is a cheap, meaningful floor and keeps scraping accountable.
- **Reveal the exact address before joining too.** Rejected — a shared phone is the person's choice;
  the physical meeting location is more sensitive and stays commit-only.
