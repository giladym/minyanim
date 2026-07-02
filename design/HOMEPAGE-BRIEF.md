# Homepage Design Brief — Marketing-Rich, Animated, RTL

Goal: replace the plain wireframe homepage with a premium, warm, mission-driven marketing
page that works on **mobile and desktop**, with tasteful motion and full reduced-motion
support. Visual system: Jerusalem Stone (see [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md),
AA-corrected tokens), Assistant Hebrew display type, RTL-first.

## Reference bar (what "good" looks like)

- **Quietly animated globe of converging travelers** — build on **COBE** (~5KB WebGL globe,
  lat/long markers + arc flight-paths + drag-to-spin): https://cobe.vercel.app/ . Quality
  bar: Stripe globe (https://stripe.com/blog/globe), GitHub globe.
- **Restrained SaaS motion** — Linear (https://linear.app): gradient hero, sticky/pinned
  scroll-transform feature sections; quiet, not flashy.
- **Faith/community warmth + trust** — Sefaria (dignity via whitespace + harmonized
  Hebrew/Latin type), Chabad (documentary photography of real observance, deep blue + warm
  gold), Calm/Headspace (earthy low-saturation palette, "companionship" copy, scale-based
  social proof). Direct competitor GoDaven proves reverence = reliability/immediacy
  (map + pins + "temporary minyan for travelers").

## Structure (desktop → mobile)

1. **Split hero** (RTL): large Hebrew display headline + sub + Google CTA on the **right**;
   stone-textured visual / globe on the **left**. Stacks vertically on mobile. Keep text
   column ~`70ch` max. (Clear text+CTA heroes test ~20% higher than image-heavy.)
2. **Live activity globe / map** — world lighting up as travelers converge; pulsing pins;
   animated arcs. A counter ("X גברים, Y ערים, Z מניינים").
3. **"איך זה עובד"** — 3 steps (רשמו שהייה · גלו מי באזור · ארחו והשלימו מניין), scroll-revealed.
4. **The problem/mission** — warm narrative: the manual Excel/WhatsApp pain → a minyan
   anywhere. Optional documentary photography of travelers/Shabbat.
5. **Social-proof drip** — community quotes/logos mid-page and a testimonial beside the CTA.
6. **Footer CTA** — closing "התחברו עם Google" with trust line.

## Motion (tasteful + performant)

- Scroll reveals via `IntersectionObserver` animating only `transform`/`opacity`
  (fade/slide-up). Consider CSS scroll-driven animations (compositor, 60fps) with progressive
  enhancement; GSAP ScrollTrigger only for pinned/scrubbed sequences.
- COBE globe for the activity section; pulsing location pins (Lottie/animated SVG); count-up
  numbers on viewport entry (requestAnimationFrame).
- **Accessibility (hard requirement):** honor `prefers-reduced-motion: reduce` — disable
  parallax/panning/scaling (vestibular triggers); any autoplay loop needs a pause control.
  Scroll-driven/GSAP do NOT auto-respect it — guard manually.

## RTL / desktop specifics

- `dir="rtl" lang="he"` on root; CSS **logical properties** (`margin-inline`, `text-align:
  start/end`, `inset-inline`) so one stylesheet serves both directions.
- Mirror nav order, menus, directional icons; swap hero panel sides. Do NOT mirror numbers,
  logos, media controls.
- Desktop measure 50–75 chars/line; generous whitespace.

## Cultural motifs + tone

- Jerusalem-stone warmth; subtle stone-texture overlay on section backgrounds.
- Large **Hebrew display type as hero** (Assistant Bold/Black, sparing).
- Motif of **gathering / "ten converging"** — a circle of ten, a map lighting up — over
  literal numerals. Shabbat candles for warmth. Magen David used sparingly as a proud mark.
- Copy: warm, mission-driven, communal ("companionship / service"), not corporate/transactional.

## Sources
Stripe globe, GitHub globe, COBE (cobe.vercel.app), Linear, Sefaria, Chabad, Hebcal,
Calm/Headspace palette, GoDaven (godaven.com/about), Assistant typeface (Ben Nathan),
web.dev i18n, MDN prefers-reduced-motion & scroll-driven animations, GSAP ScrollTrigger.
