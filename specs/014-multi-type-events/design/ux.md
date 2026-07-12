# UX Design — Multi-type events (hosting, gatherings, occasions)

Date: 2026-07-12 · Design system: [`design/DESIGN-SYSTEM.md`](../../../design/DESIGN-SYSTEM.md)
(Heritage Voyage / Jerusalem Stone). Tokens SoT: `apps/frontend/src/theme/tokens.css`. This doc
defines the user experience for generalizing events to three user-facing **kinds** — **מניין / Minyan**
(type=`minyan`), **אירוח / Hosting** (type=`gathering`, category=`hosting`), **מפגש / Gathering**
(type=`gathering`, category=`social`) — with a generalized RSVP model, per plan.md/research.md. Users
see kinds only, never the internal type/category axes. It is normative for the FE tasks.

## Design principles

1. **Minyan is the flagship and stays untouched.** Every existing minyan screen, URL, color, and
   interaction is preserved pixel-for-pixel (SC-005). Generalization is done by *branching*, not
   replacing: the minyan branch of each shared component renders exactly today's UI.
2. **Additive, not a redesign.** New types slot into the existing `events`/`discovery` feature modules
   and the existing card/hero/roster chrome. No new global navigation paradigm.
3. **Kind is legible at a glance.** Each kind carries a consistent icon + accent so a traveler scanning
   discovery instantly distinguishes a minyan from a hosting event from a social gathering — without
   relying on color alone (icon + label + shape, for AA).
4. **RTL / Hebrew-first, mobile-first, WCAG 2.1 AA** — non-negotiable per constitution. Built at 375 px
   first; ≥44 px targets; logical properties; `aria-live` on seat-count/status; axe-gated.
5. **Privacy is felt, not just enforced.** The UI makes it obvious *why* the exact address is hidden
   ("visible after the host approves your seat") so the reveal-on-approval moment is a delightful
   payoff, not a confusion.

## Kind visual language (icon + accent, never color-only)

| Kind | Icon (inline SVG, `components/Icon.tsx`) | Accent token | User-facing name (he / en) |
|------|------------------------------------------|--------------|----------------------------|
| Minyan | existing minyan/tefilla glyph | `--primary` (forest green) — unchanged | מניין / Minyan |
| Hosting (אירוח) | table/plate glyph (new) | `--clay` (terracotta) accent, green CTAs | אירוח · סעודות / Hosting (a Shabbat meal) — **never bare** (below) |
| Social gathering (מפגש) | people/spark glyph (new) | a NEW distinct accent token pair (e.g. `--sky` light/dark, AA-checked), green CTAs | מפגש / Gathering |

**The אירוח label NEVER appears bare — always qualified** (אירוח alone can read as lodging): chip
"אירוח · סעודות", card badge "אירוח · סעודת שבת" (the meal-type qualifier), seats copy "מקומות ליד
השולחן: N" (not "מקומות נותרו"); English label "Hosting (a Shabbat meal)", short chip
"Hosting · Meals".

**Social accent**: `--teal` now equals the primary green family (tokens.css Heritage refresh) so it
cannot differentiate; add a NEW distinct accent token pair for social (e.g. `--sky` light/dark,
AA-contrast-checked) to tokens.css, or fall back to icon+shape-only differentiation.

Accents color the **kind badge/pin/chip only**. Per the design system, **primary CTAs stay green**
(`bg-primary`), terracotta remains accent + destructive. So a hosting card has a clay kind-badge but a
green "Request a seat" button. Occasion renders as a **secondary chip** (e.g. "שבת", "פסח") using
`bg-chip` + `text-muted` (the documented chip-contrast rule — never `text-faint` on `bg-chip`).

## Entry points & navigation

- **Host an event**: **minyan-context entry points stay one-tap for the flagship.** The dashboard/Stay
  `⋮` "host a minyan" CTAs **deep-link `kind=minyan` and skip the picker** (`/minyan/new?fromStay=…`
  keeps working, pre-selecting minyan) — zero added taps for a returning minyan host (protects SC-005
  UX). Normative host entry points: (1) the **bottom-nav ＋ FAB** opens a two-option sheet
  ("＋ שהות חדשה" / "＋ אירוע חדש" → kind picker); (2) the **dashboard shows a persistent
  "ארחו אצלכם" card** for users with no upcoming Stay (routes to the picker); (3) discovery's
  "organize/host here" CTA routes to the picker with location/date prefilled (kind NOT forced) when not
  arriving from a minyan context — minyan context keeps the one-tap deep link. New route
  `/event/new?kind=&fromStay=…` (`kind=minyan|hosting|social`; kind maps to the internal
  type+category).
- **Discovery**: unchanged entry from a Stay; the results now include hosting events + social
  gatherings with new filters (below).
- **Detail routes**: `/minyan/$id` **kept** (public join links must not break). Gatherings use
  `/event/$id` (a single public detail route that renders by kind). Internally both resolve to the
  same `EventDetail` component.

## Screen 1 — Host: kind picker

A single mobile column of three large, tappable cards (radio-group semantics, keyboard arrow-navigable,
`aria-checked`). **Minyan is listed first (the flagship) with equal visual weight — no kind is badged
"recommended", so the flagship is never visually deprioritized** (resolves the loop's flagship-friction
finding). Each card: kind icon + name + one-line purpose:

- **מניין** — "ארגון תפילה במניין" (organize a prayer minyan)
- **אירוח** — "אירוח אורחים לסעודת שבת/חג" (host guests for a Shabbat/holiday meal)
- **מפגש** — "מסיבה, קידוש, או מפגש קהילתי" (party, kiddush, or community meetup)

Under the hood each kind maps to (type, category) via the shared **`EVENT_KINDS`** map in
`packages/shared` — `minyan→{type:'minyan',category:null,labelKey,icon}`,
`hosting→{type:'gathering',category:'hosting',…}`, `social→{type:'gathering',category:'social',…}` —
the ONE home of the kind→(type,category) mapping; the picker, discovery chips, `?kind=` deep links,
and server default-resolution (with `CATEGORY_META` defaults) all read it (`CATEGORY_META` alone has
no minyan entry — `EVENT_KINDS` covers the picker's minyan label/icon). The picker never exposes the
internal axes.

Choosing a card advances to the kind-specific form. When `?kind=` is present (deep link) the picker is
skipped. Back returns to the picker (not out of the flow) — except when `?kind=` skipped the picker,
where back-from-form exits the flow (not to a picker the user never saw). Layout mirrors the existing
`HostMinyanForm` container styling (card, `mn-fadeup` transform-only entrance).

## Screen 2 — Host: kind-specific create form

Shared header + generic fields (title, location via the existing LocationPicker, date, **optional
start/end time** (`HH:MM`), **occasion select** [Shabbat, festivals, Chanukah, Purim, none], description,
photos via the existing `ImageUploader kind="event"`, notes). Then a **kind section**:

- **Minyan branch** — *renders today's exact fields* (nusach, Sefer Torah, services/times, roles are
  derived). No change.
- **Hosting branch** — meal type (Shabbat dinner / lunch / seudah shlishit / holiday / weekday),
  **guest seats** (numeric stepper → `event.capacity`; helper text "seats for guests — you're not
  counted"; seats copy "מקומות ליד השולחן: N"), an optional **RSVP cutoff** (date/time; helper
  "requests close then"), kashrut level,
  dietary accommodations (multi-select chips), "what I'm offering", "what to bring", optional alcohol
  toggle + accessibility note. RSVP mode defaults to **approval** (labeled, changeable: "Approve each
  guest" ✓ vs "Anyone can join"). Visibility: public vs unlisted (link-only) toggle.
  **Start time is REQUIRED for hosting** (a guest needs an arrival time; FR-009), with a
  zmanim-assisted default when occasion=Shabbat/festival (candle-lighting + 30 min suggestion,
  editable). **Meal-type ↔ occasion derive**: mealType `shabbat_dinner|shabbat_lunch|seudah_shlishit`
  pre-selects occasion=Shabbat (editable); mealType `holiday_meal` makes occasion REQUIRED (which
  holiday?). **Form fold (serves SC-001 < 3 min)**: above the fold = title / mealType / date+time /
  seats / location; a collapsed "פרטים נוספים" section holds dietary, offering/bring, alcohol,
  accessibility, cutoff, visibility, photos.
- **Social branch** — subcategory (party / kiddush / farbrengen / meetup / other), optional capacity,
  RSVP mode defaults to **open**.

Reuse the `fieldCls`/`labelCls`/`errCls` field styling (consolidated from the duplicated inline
triplet). Single green "Publish" CTA. All labels i18n-keyed; the hosting form must be completable in
< 3 min (SC-001) → sensible defaults, optional fields visually secondary.

## Screen 3 — Event detail (kind-driven)

One `EventDetail` component, a **green hero** shared by all kinds (place, date, occasion chip, host).
Below the hero, a **kind-driven body**:

- **Minyan** — today's exact hero extras (status pill + live pulse, animated quorum `/10` progress bar,
  readiness checklist, RolesSection). Unchanged.
- **Hosting** — a **seats meter** (`aria-live`: "3 of 4 seats left") replacing the quorum bar; seudah
  facts (meal type, kashrut, dietary chips, offering, what-to-bring); the **RSVP band** adapts to the
  viewer's status (below).
- **Social** — a lighter body: subcategory, optional capacity meter, description; simple RSVP band.

Shared for all: `OrganizerCard`, photos `Gallery`, `FlagButton`, and the **tiered address reveal** —
non-confirmed viewers see city/neighborhood + a muted lock hint ("הכתובת המדויקת תיחשף לאחר אישור");
confirmed viewers/host see exact address + entry notes + contact (the existing reveal, generalized).

**Hosting guest-list privacy**: on a hosting-category event the confirmed guest list (names/phones) is
shown to **confirmed attendees + host only**; a signed-in non-confirmed viewer sees an **aggregate
count** ("4 אורחים אושרו") instead of named attendees — attending a private home meal is more
sensitive than a minyan headcount (a deliberate, hosting-only revision of ADR-0008's roster openness;
minyan + social keep today's roster). Host contact stays visible pre-request; pending names remain
host-only (Screen 5).

**Share**: the address-free WhatsApp share (`buildShareText`) is generalized to `EventDetail` for all
kinds. After publishing an **unlisted** event, show a copy-link confirmation: "האירוע לא מופיע
בחיפוש — שתפו את הקישור".

**SHOULD (delight, low cost):** a **hosting event with a Shabbat/festival occasion** shows
a collapsible **candle-lighting / Havdalah zmanim** panel, reusing 005's already-event-scoped
`GET /api/events/:id/zmanim` (no new backend). Meets the natural guest expectation the PM lens flagged;
not on the critical path.

## Screen 4 — RSVP band states (the generalized attendance UX)

The band under the hero adapts to `rsvpMode` × the viewer's `myStatus` × the derived `rsvpState`.
**Approval-mode hosting gatherings use `pending` as the ordered queue — there is no "waitlisted #2"
state for a hosting event (that would imply a fairness order the host isn't bound to). `waitlisted`
appears only in open mode.**

| Viewer state | Hosting (approval) | Social gathering/minyan (open) |
|--------------|--------------------|--------------------------------|
| Signed-out | "Sign in to request a seat" | "Sign in to join" |
| No attendance, seats free, open | green **"Request a seat"** + party-size stepper | green **"I'm coming"** / commit |
| No attendance, at capacity | **"Request a seat"** (host approves as seats free) | **"Join the waitlist"** (muted-green) |
| `pending` | amber band, expectation-setting copy: **"המארח קיבל התראה — נעדכן אותך כאן ובמייל כשיאשר"** + cancel; **address hidden**. At full capacity the copy reads: "האירוע מלא כרגע — אם יתפנה מקום, המארח יוכל לאשר אותך" | n/a |
| `pending`, party doesn't fit | amber band + inline **"Reduce party size to fit N seats"** stepper (the reduce-to-fit path); after reducing, the confirmation reads "עדכנו — עדיין ממתין לאישור המארח" | n/a |
| `waitlisted` (open only) | n/a | accent (sky) band "You're on the waitlist" + leave |
| `confirmed` | green "You're in" band + address revealed + **Message host** (008) + cancel | green "You're in" band |
| `declined` | muted band "The host couldn't fit you this time" (no address) + a **"מצאו אירוח אחר בקרבת מקום"** link (kind-filtered discovery) | n/a |
| `pending` + `rsvpState=closed`, event date NOT passed | amber-grey band **"ההרשמה לאורחים חדשים נסגרה — בקשתך עדיין ממתינה לאישור המארח"**; cancel stays (the host may still approve until the date, FR-016) | grey "Closed" (no new joins) |
| event date passed | grey **terminal** "closed" band; actions removed | grey terminal "Closed" |
| event `cancelled` (any kind) | full-width muted band **"המארח ביטל את האירוע"** + CTA **"חפשו אירועים אחרים באזור"** (discovery prefiltered to location/kind); RSVP actions removed; address hidden post-cancel for non-confirmed (confirmed guests keep the notification they got) | same |

Status changes announce via `aria-live="polite"`. Party-size stepper clamps 1..PARTY_SIZE_MAX.
On a hosting event the band never shows other guests' names to a non-confirmed viewer — only the
aggregate confirmed count (see Screen 3's hosting guest-list privacy).

## Screen 5 — Host: requests / approvals panel (`RequestsPanel`)

Visible only to the host of an approval-mode event (generic — any approval-mode gathering), as a
distinct card on the detail page:

- A **pending requests** list: each row = requester avatar + name + public profile link + phone (if
  shared) + party size + requested-at, with green **Approve** and muted **Decline** buttons (44 px).
- A **confirmed guests** list (roster). (Approval mode has no `waitlisted` state — `pending` is the
  ordered queue; a full event simply blocks approvals that don't fit until a seat frees.)
- **Approve** disabled with a tooltip/inline note when it would exceed capacity ("The event is full —
  free a seat first"); the server also guards (`capacity.full`).
- Approve/Decline show optimistic status + `aria-live` confirmation; both offer a "Message" link (008)
  to coordinate. Notifications fire server-side (host↔guest).

## Screen 6 — Discovery filters (generalized)

Above the results: a **kind filter** as a row of `aria-pressed` chips (הכל · מניינים · **אירוח ·
סעודות** · מפגשים — All · Minyanim · **Hosting · Meals** · Gatherings; the hosting chip is always
qualified, never bare אירוח) using each kind's icon+accent; and an **occasion select** (All
occasions / Shabbat / festivals / …). The kind chips map to the API's `types`+`categories` params via
the shared `EVENT_KINDS` map. The results heading is kind-aware: "מתרחש באזור" for All; "מניינים"
when only the minyan chip is active. The
**nusach + Sefer-Torah controls are shown only when Minyanim are in scope** (collapse otherwise), so
the minyan discovery experience is unchanged when it's the active filter.

**Flagship-default (loop decision):** general discovery defaults to **All kinds** (the US2 promise —
"see everything nearby"), but arriving from a **minyan-specific entry point** (Stay `⋮` "search
minyanim") **pre-applies the Minyanim kind filter**, so the flagship search is not diluted for that
user. The active filter is always visible + one tap to widen.

Results list mixes kinds; each `EventRow`/pin carries its kind icon+accent + occasion chip + a
kind-appropriate one-liner (minyan: quorum/time; hosting: "מקומות ליד השולחן: N"; social:
subcategory). A hosting card badge is always qualified with the meal type ("אירוח · סעודת שבת"),
never bare אירוח.
Map pins: minyan = existing clay pin *(retained)*; add distinct hosting + social pin styles
(shape+icon differ, not color alone). Empty state per active filter ("No hosting events near this Stay
yet — host one?").

## Screen 7 — האירועים שלי (My events)

The async re-engagement surface (FR-017): the host's reliable path back to the requests queue and the
guest's path back to their pending/confirmed events. Entry: dashboard/profile. Data:
`GET /api/me/events`.

- Two groups: **מארח** (hosting) / **משתתף** (attending).
- Each row = kind badge + title/date + a status chip (the guest's `myStatus` on attending rows; the
  event status on hosted rows).
- Hosted **approval-mode** rows show a **"N בקשות ממתינות"** badge (from `pendingRequestCount`) that
  deep-links to the event's `RequestsPanel`.
- The **header envelope badge** also counts pending requests for hosts (in addition to unread
  messages/notifications), so a host who never opens this screen still sees the nudge.
- Complements the email channel: seat_requested / request_approved / request_declined go in-app AND by
  email (he/en, deep-linking to the event) — the Screen-4 pending copy sets that expectation
  ("נעדכן אותך כאן ובמייל").

## Accessibility checklist (feature-specific)

- Kind picker = radio group; filter chips = toggle buttons with `aria-pressed`; all keyboard-reachable.
- Seat/quorum meters expose text ("3 of 4 seats left"), not color/width alone; updates via `aria-live`.
- Kind differentiation never relies on color alone (icon + text label always present).
- Approve/Decline/Request buttons have explicit accessible names incorporating the guest/event.
- Address-hidden vs revealed state is announced and visually distinct (lock icon + text).
- All new copy externalized (he + en), parity-tested; RTL verified; motion transform-only under
  `prefers-reduced-motion`.

## i18n namespaces to add (he + en, parity-tested)

`eventKind` (minyan/hosting/social kind names + purposes), `occasion` (the 8 occasions + "none"),
`hosting` (meal types, kashrut levels, dietary options, field labels, seats copy), `social`
(subcategories), `rsvp` (mode labels + the Screen-4 status band strings + waitlist copy), `myEvents`
(Screen-7 groups, status chips, pending-requests badge),
plus additions to `discovery` (kind/occasion filter labels) and `host` (kind-picker + hosting/social
form labels). Reuse existing `minyanDetail`/`commit`/`roles` for the minyan branch unchanged.

## Component reuse map

| New / changed | Basis | Reuse |
|---------------|-------|-------|
| Kind picker | new | card + `mn-fadeup` styling |
| `HostEventForm` | generalize `HostMinyanForm` | LocationPicker, ImageUploader, field classes, minyan branch verbatim |
| `EventDetail` | generalize `MinyanDetail` | hero, OrganizerCard, Gallery, ContactButtons, FlagButton, minyan branch verbatim |
| RSVP band | generalize `CommitSection` | party-size stepper, contact reveal, Message (008) |
| `RequestsPanel` | new | ParticipantRoster row styling, Avatar, Message link |
| Discovery filters | extend `DiscoveryPage` | chip/toggle styling from places layer toggles; `MinyanRow` → `EventRow` |
| Hosting/social map pins | extend `DiscoveryMap` | existing pin machinery |
| Event share | generalize the WhatsApp share (address-free `buildShareText`) to `EventDetail` for all kinds | existing share machinery; + unlisted copy-link confirmation ("האירוע לא מופיע בחיפוש — שתפו את הקישור") |
| `MyEvents` (Screen 7) | new | My-Stays card/list styling, kind badges, status chips, header envelope badge |
