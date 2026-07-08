# Specification Quality Checklist: Seed Import + Seed-User Claim / Merge

**Purpose**: Validate specification completeness and quality
**Created**: 2026-07-08 (retroactive)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details leak into the requirements — note: `user.kind`, migration 0009, and
      E.164 are named as binding project constraints (the shipped model / match key), not as
      implementation choices; the requirements are otherwise capability-level.
- [x] Focused on user value and business needs (connecting travelers pre-launch; letting people own
      their imported trips)
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain (the one open decision — import row semantics, D8 — is
      explicitly captured as a blocking, deferred item, not an unresolved ambiguity)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic where possible (SC-004/005 state a verifiable security/
      privacy outcome, not an implementation)
- [x] All acceptance scenarios are defined (US1 import, US2 claim, US3 seed privacy)
- [x] Edge cases are identified (forged id, multiple seeds one phone, no phone, commitment conflict,
      unresolvable location, bad phone, duplicate across runs)
- [x] Scope is clearly bounded (Part A shipped; Part B Steps 2–4 pending; SMS OTP + admin-approved
      claims + ongoing sync out of scope)
- [x] Dependencies and assumptions identified (001/002/003/007 + ADR 0008)

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (import staged pipeline, phone-match claim, seed privacy)
- [x] Feature meets measurable outcomes defined in Success Criteria (for the shipped Part A)
- [x] Security-sensitive decision (D3) documented with mitigations + accepted residual risk + launch
      gate

## Notes

- **Retroactive spec** — written after Part A shipped and import Step 1 landed, to bring the feature
  into the spec-kit house format. It records the *as-built* system, not a forward plan.
- **Part B is partial by design.** Import Steps 2–4 (FR-013/014/015, tasks T019–T023) are
  **pending**, blocked on the row-semantics decision (D8). The pipeline safely stops after Step 1's
  reviewable artifacts (`raw.json` / `profile.json`); no data reaches the database until Steps 2–4 are
  built and gated (D9). This is intentional, not an oversight.
- **Security posture is a launch gate.** The beta accepts in-app-confirm + server re-verification
  (D3/FR-004/FR-005) in the absence of SMS OTP; a production launch must add a verified-phone gate.
