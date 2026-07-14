# Design Decision — A location holds events

Date: 2026-07-13 · Design system: [`design/DESIGN-SYSTEM.md`](../../../design/DESIGN-SYSTEM.md)
(Heritage Voyage / Jerusalem Stone). This is a short design record for feature 015, documenting the
choice made **as built**. The visual brainstorm that produced it was delivered as an **artifact** (a
mockup of the three options); this doc captures the decision and its rationale.

## The problem

The location (Stay / יעד) form had grown to conflate **two concerns**:

1. **Where the traveler is + who is with them** — city/country, dates, private address, contact, folder,
   photos, group size. This is a *location*: a reusable anchor.
2. **What Jewish life they want there** — a `prayer_needs` block (which weekday/Shabbat tefillot) and a
   "brings a Sefer Torah" toggle. This is *event intent*, and its shape implied exactly **one** minyan
   per location.

That conflation blocked the natural extension unlocked by **014** (multi-type events): a single location
should be able to carry a **minyan**, a **Shabbat meal** (014 hosting), **and** a **social gathering** at
once. The minyan-shaped fields on the location contradicted that — a location is not a minyan.

## Options considered

The brainstorm weighed three ways to attach event intent to a location:

- **Option A — inline event editors on the location form.** Keep event creation *inside* the location
  form: expand the prayer/Sefer-Torah block into inline mini-editors for each event kind.
  *Rejected*: rebuilds the 014 create flow a second time inside the Stay form, couples the two forms,
  and does not scale past one of each kind. Highest complexity, worst reuse.
- **Option B — a list on the location + events keep their own pages (CHOSEN).** The location becomes a
  clean anchor; it shows an **"האירועים שלי כאן"** list of attached events and a **"＋ הוסף אירוע"**
  button that routes into the *existing* 014 kind-picker flow (`/event/new?fromStay=…`); each event lives
  on its own page (`/minyan/$id` or `/event/$id`). Events attach via `event.stay_id`.
- **Option C — a bottom-sheet event composer.** Like B, but "＋ הוסף אירוע" opens an in-place
  bottom-sheet composer rather than routing to the kind-picker screen.
  *Rejected for v1*: a second create surface to build + a11y-test, duplicating the shipped picker; the
  route-based flow (B) reuses 014 verbatim with zero new create UI.

## The choice: Option B, and why

Option B was chosen because it is the **maximum-reuse, minimum-surface** path:

- **Reuses 014 whole.** "＋ הוסף אירוע" routes into the already-shipped, already-a11y-tested kind picker
  and forms; 015 adds **no** new event-create UI. It only threads `fromStay` (which 013 already plumbed
  for the participant edge) down to a new `event.stay_id` stamp.
- **A location becomes a hub, not a form.** One anchor carries 0…N events of any kind — the whole point
  of the 014 generalization.
- **Clean separation.** The location stops pretending to be a minyan; event intent lives on real events
  with their own lifecycle, RSVP, and discovery.
- **Small, safe data change.** One nullable additive FK (`event.stay_id`, `ON DELETE SET NULL`) + one
  index + two dropped columns. Deleting a location never loses its events.

The location's edit page renders the "האירועים שלי כאן" section only for a **saved** location (an event
needs an id to attach to), and the dashboard card gains a compact **"N אירועים"** chip so the hub nature
is glanceable. Event-kind badges reuse 014's visual language (minyan = `--primary`, hosting = `--clay`,
social = `--sky` soft tokens; never color-only).

## Terminology decision — יעד + מקומות kept

No new user-facing noun was introduced:

- A user's location stays **יעד** (destination) in the Hebrew UI — the term was settled in an earlier
  commit and is unchanged here.
- The kosher-places view at `/places` stays **"מקומות"** (010) — a distinct concept (curated kosher/
  Jewish places) that must not be confused with a user's own יעד.
- The events attached to a location reuse the 014 event vocabulary: **kind** = מניין / אירוח / מפגש. The
  new strings are the small `stays.events.*` namespace ("האירועים שלי כאן", "＋ הוסף אירוע", the empty
  state, and the "N אירועים" count) — no new nouns beyond "אירוע/אירועים".

## numMen-as-group-size decision

The other two minyan-shaped fields (`brings_sefer_torah`, `prayer_needs`) were dropped, but **`num_men`
was deliberately kept and relabeled** as a generic **group size**: "מי מגיע — כמה אנשים בקבוצה (כולל
אותך)" (was "כמה גברים בקבוצה"). Rationale:

- `num_men` still feeds discovery **potential-matchmaking** (per-Shabbat men-overlap); dropping it would
  have regressed matchmaking, whereas the Sefer-Torah count (also potential-derived) was an acceptable
  loss.
- Relabeling — rather than renaming the column — was the minimal correct change (no data migration
  concern, dev-no-real-data). The column stays `num_men`; only the label/semantics generalize.

## References

- Builds on the generic multi-type event model — [../../014-multi-type-events/](../../014-multi-type-events/)
  (the kind picker, `MyEventRow`, and the event/gathering/attendance tables 015 links into).
- Coexists with the 013 stay↔minyan linkage — [../../013-stay-location-linked-minyanim/spec.md](../../013-stay-location-linked-minyanim/spec.md)
  (the `attendance.stay_id` edge; 015 adds the complementary `event.stay_id` edge).
- The visual brainstorm of Options A/B/C was delivered as an **artifact** (mockup), not checked into the
  repo; this record supersedes it as the source of truth for the shipped decision.
