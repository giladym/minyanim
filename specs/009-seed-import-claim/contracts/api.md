# Phase 1 API Contracts — Seed-User Claim

Base: `/api` on the backend Worker (Hono). Conventions inherited from 001–008: `401 auth.required`
when unauthenticated; DTOs hand-built before `c.json()`; validation errors as
`400 { errors: [{ field, code }] }`. The claim endpoints live under the existing profile path
(`/api/me`) in `routes/me.ts` and use the shared `requireUserId(c)` session resolver.

> **Security (D3/FR-004):** the claim WRITE never trusts the submitted seed ids — the server
> **re-verifies** each is a `kind='seed'` user sharing a phone with the caller and merges only the
> verified subset. See [plan.md](../plan.md) §Security Analysis.

---

## Claims

### `GET /api/me/claims`  (authenticated)

Preview the seed users the caller could claim — `kind='seed'` users owning a `phone_number` that
exactly matches one of the caller's own profile phones. A caller with no phone (or no match) gets an
empty list. Never leaks seeds that do not match the caller.

→ `200 { seeds: ClaimableSeedDTO[] }` · `401`

```jsonc
{
  "seeds": [
    {
      "seedUserId": "seed_9f3a…",
      "name": "אבי",                // the seed's display name (shown in the offer)
      "phone": "+972501112222",     // the matched E.164 — the caller has this on their profile
      "stays": 2,                    // count of stays this seed owns
      "events": 1                    // count of minyanim this seed hosts
    }
  ]
}
```

### `POST /api/me/claims`  (authenticated)

Confirm claiming a selected set of seeds: reassign their stays/events/commitments/roles to the
caller, then delete the seed rows (cascading their phones). The server **re-verifies** each id
(kind + phone match) and merges only the verified subset; a forged or non-matching id contributes
nothing.

Body — `claimSeedSchema`:

```jsonc
{ "seedUserIds": ["seed_9f3a…", "seed_1b2c…"] }   // non-empty; each a non-empty string
```

- Empty / invalid body → `400 { errors: [{ field: "seedUserIds", code: "claim.none_selected" }] }`.
- No verified matches (e.g. all ids forged, or caller has no phone) → `200 { claimed: 0, stays: 0,
  events: 0 }` (not an error — nothing was claimable).
- Otherwise → `200 ClaimResult` with what moved.

→ `200 ClaimResult` · `400` · `401`

```jsonc
{ "claimed": 2, "stays": 3, "events": 1 }   // seeds merged, stays moved, events moved
```

**Merge order (server, D5):** drop the verified seeds' commitments to events the caller already
committed to (the `(event_id, user_id)` unique-index conflict) → reassign `commitment` / `eventRole`
/ `stay` / `event` to the caller → delete the seed `user` rows. D1 has no interactive transactions;
the statements run sequentially and the re-verification makes them safe against a partial replay.

---

## Shared contracts (`packages/shared/src/schemas/claim.ts`)

```ts
/** A phone-matched seed offered to the signed-in user. */
export interface ClaimableSeedDTO {
  seedUserId: string;
  name: string;
  phone: string;   // matched E.164
  stays: number;
  events: number;
}

/** Confirm claiming one or more matched seeds. */
export const claimSeedSchema = z.object({
  seedUserIds: z.array(z.string().min(1)).min(1, "claim.none_selected"),
});
export type ClaimSeedInput = z.infer<typeof claimSeedSchema>;
```

`ClaimResult` (`{ claimed, stays, events }`) is returned by the repository/service and serialized
directly; it is not a shared type today (the FE reads the shape inline in `useClaimSeeds`).

## Errors

No new error codes. Reuses `auth.required` (401). Validation of the claim body uses the shared
`claimSeedSchema` → the standard `400 { errors: [{ field, code }] }` shape; `code` is
`"claim.none_selected"` when the id array is empty/missing.

## Discovery (revised by this feature — D4/FR-007)

No new endpoint. The existing discovery travelers list (003) is **tightened**: a `kind='seed'`
owner's **phone is withheld** (name still shown), regardless of `share_phone`, until the seed is
claimed. Enforced server-side via the `ownerKind` field added to the potential-stay projection. See
[ADR 0008](../../../docs/adr/0008-contact-visibility.md) (this revises it for seed owners).

## Import pipeline (Part B) — no HTTP surface

The `tools/seed-import/` pipeline is a **dev-only, local CLI** (Node ≥ 22.6), not an API. Step 1:

```sh
node tools/seed-import/src/inspect.ts <input.csv> [--out <dir>]   # → raw.json + profile.json
```

Steps 2–4 (map / gate / create) are **pending** (D8) and, when built, remain local CLIs against dev
D1 — they never expose an HTTP endpoint and never upload data.
