# Minyanim — Design Reference

The source of truth for the visual design is the Claude design project **"Minyanim
application design"** on claude.ai/design.

- **Open in Claude**: https://claude.ai/design/p/efdab62b-decc-4601-acdc-0ed468057626
- **Project ID**: `efdab62b-decc-4601-acdc-0ed468057626`
- **Access**: via your claude.ai login (the DesignSync tool / `/design-sync` skill) — not an
  MCP server.
- **Files**:
  - `Minyanim.dc.html` — the clickable app prototype (screens for features 001–006)
  - `Minyanim Homepage.dc.html` — the rich marketing homepage (desktop + mobile, animated
    globe). Copy in [`HOMEPAGE-COPY.md`](./HOMEPAGE-COPY.md); brief in
    [`HOMEPAGE-BRIEF.md`](./HOMEPAGE-BRIEF.md).
  - `Minyanim Homepage EN.dc.html` — English LTR homepage (mirrors the RTL layout via the same
    token system; in code this is the same homepage component via i18n, not a separate file)
  - `Theme Explorer.dc.html` — three explored theme directions (A/B/C)
  - `email-verification.html` / `email-password-reset.html` — branded transactional email
    templates (ported to `apps/backend/src/lib/email-templates.ts`)

> **Brand wordmark — `מניין`** (English: *Minyanim*). ✅ Consistent across the implementation
> (i18n, emails, footer) AND the design source (brand fixes applied 2026-06-19: mission eyebrow,
> verb agreement, testimonial). Common-noun plural `מניינים` ("מניינים פעילים" etc.) is correct
> Hebrew and intentionally kept. (FR-011 resolved.)
- **Chosen direction**: **A · Jerusalem Stone (אבן ירושלים)** — warm sand & clay, Assistant
  font, light + dark. (Alternatives explored: B · Voyage / indigo / Heebo; C · Maariv /
  navy + gold / Rubik.)

These `.dc.html` files use Claude's design runtime and do not render in a plain browser.
To re-pull or sync them, use the `DesignSync` tool / `/design-sync` against the project ID
above. The extracted, implementation-ready design system lives in
[`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md).

The design directly informs **Feature 001 (Platform Foundation)** — app shell, theme,
typography — and validates the **003 (Discovery & Quorum)** model (potential vs committed,
quorum/readiness, Sefer Torah + Ba'al Korei badges).
