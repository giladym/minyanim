# Minyanim Design System — Jerusalem Stone (אבן ירושלים)

Implementation-ready tokens and patterns extracted from the Claude design prototype
(see [README](./README.md)). Direction: warm, reverent, grounded — sand & clay. The
preference is stored as an **extensible theme identifier** (`minyanim_theme`), so additional
named themes (e.g. Voyage, Maariv) can be added later without a data-model change — matching
Feature 001 FR-009.

## Typography

- **Font**: `Assistant` (Google Fonts), Hebrew-first sans-serif. Weights 400/500/600/700/800.
- Headings are heavy (700–800), with slight negative letter-spacing (−0.01 to −0.02em) on
  large display text.
- Alternative fonts explored (not chosen): Heebo, Rubik.

## Color tokens (CSS custom properties)

The prototype themes via CSS variables on a container; dark mode swaps the same names.

### Light

| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#f6f1e7` | app background |
| `--header` | `#f1e8d6` | header background |
| `--surface` | `#fffdf8` | cards / surfaces |
| `--ink` | `#2b2620` | primary text |
| `--muted` | `#6f695d` | secondary text (AA-corrected from `#7d7669`) |
| `--faint` | `#776c57` | tertiary / inactive (AA-corrected from `#a89a7e`) |
| `--line` | `#ece2cf` | hairline borders |
| `--line2` | `#e7dcc6` | stronger borders |
| `--clay` | `#a4512e` | **primary / brand / CTA** (AA-corrected from `#b5613b`) |
| `--clay-soft` | `#f7e7df` | clay tint (badges) |
| `--clay-ink` | `#a44b2a` | clay text-on-tint |
| `--on-clay` | `#ffffff` | text on clay |
| `--teal` | `#3f8073` | **success / "ready" / quorum reached** |
| `--teal-soft` | `#e6efe9` | teal tint |
| `--teal-ink` | `#2f6b5d` | teal text-on-tint |
| `--on-teal` | `#ffffff` | text on teal |
| `--gold` | `#825916` | **accent / holiday / zmanim** (AA-corrected from `#9a6a1f`) |
| `--gold-soft` | `#f4e3c6` | gold tint (holiday chip) |
| `--chip` | `#efe6d3` | neutral chip |
| `--shadow` | `rgba(120,90,40,0.13)` | warm shadow |
| `--track` | `#ece2cf` | progress-bar track |

### Dark

| Token | Value |
|-------|-------|
| `--bg` | `#1b1815` |
| `--header` | `#241f19` |
| `--surface` | `#262019` |
| `--ink` | `#f1ead9` |
| `--muted` | `#a99e8a` |
| `--faint` | `#928775` (AA-corrected from `#7d7264`) |
| `--line` | `#332c23` |
| `--line2` | `#3a3127` |
| `--clay` | `#d98a5f` |
| `--clay-soft` | `#3a2820` |
| `--clay-ink` | `#eaa57f` |
| `--on-clay` | `#241812` |
| `--teal` | `#5fa595` |
| `--teal-soft` | `#22302c` |
| `--teal-ink` | `#86c5b6` |
| `--on-teal` | `#10201b` |
| `--gold` | `#dcad57` |
| `--gold-soft` | `#342a17` |
| `--chip` | `#2c2519` |
| `--shadow` | `rgba(0,0,0,0.45)` |
| `--track` | `#332c23` |

## Layout & shape

- **Mobile-first**, RTL (`dir="rtl"`). Reference frame ~388 px wide.
- **App chrome**: top header (logo `מ` + "מניין", Hebrew date + holiday chip, theme toggle
  `◐`, language pill `עב/EN`, profile avatar) + bottom tab nav.
- **Bottom nav** (5): גילוי (Discovery), השהיות (Stays), **＋ FAB** (Add Stay), התראות
  (Notifications), פרופיל (Profile). Active = `--clay`, inactive = `--faint`.
- **Radii**: cards `18px`, buttons `12–14px`, pills/badges `999px`, FAB circle, sheet/modal
  large. **Shadows** soft and warm.

## Component patterns

- **Primary button**: `--clay` bg, `--on-clay` text, weight 800, radius 12–14, padding ~12–16.
- **Secondary/Google button**: `--surface` bg, `--line2` border, ink text.
- **Card**: `--surface` bg, 1px `--line2` border, radius 18, soft shadow, padding 16.
- **Badge / pill**: radius 999, soft-tint bg + matching ink (e.g. `ס״ת ✓` → teal-soft/teal-ink;
  `בעל קורא · דרוש` → clay-soft/clay-ink; holiday → gold-soft/gold).
- **Progress bar (quorum)**: `--track` bg, fill `--clay` while *forming*, `--teal` when *ready*;
  height 8, radius 999. Caption: `8 / 10 גברים` + `עוד 2 דרושים`.
- **Status**: `מוכן ✓` (teal pill) when ready; `קוורום הושג` at ≥10.
- **Theme toggle**: circular `◐` button; persists to `localStorage['minyanim_theme']` and
  (for signed-in users) the profile.

## Accessibility (WCAG 2.1 AA — audited 2026-06-18)

All text/background pairs were checked against the 4.5:1 normal-text threshold. The token
values above are the **AA-corrected** set. Original prototype values that failed and their
fixes:

| Theme | Token | Original | Ratio | Corrected | Ratio |
|-------|-------|----------|-------|-----------|-------|
| Light | `--muted` | `#7d7669` | 4.00 | `#6f695d` | 4.84 |
| Light | `--faint` | `#a89a7e` | 2.46 | `#776c57` | 4.59 |
| Light | `--clay` | `#b5613b` | 3.94 / 4.43 | `#a4512e` | 4.92 / 5.53 |
| Light | `--gold` | `#9a6a1f` | 3.74 | `#825916` | 4.91 |
| Dark | `--faint` | `#7d7264` | 3.42 | `#928775` | 4.56 |

`--clay` was darkened once to fix both clay-as-text on light backgrounds and white text on
clay fills. `--ink`, `--clay-ink`, `--teal-ink`, and the teal button already passed. Any new
theme added later MUST re-run this check before shipping (constitution Principle II).

## Spec validation (what the design confirms)

- **Two-layer discovery (003)**: header shows *potential* "23 גברים באזור" alongside
  committed Minyan cards — exactly the potential-vs-committed model.
- **Readiness (003)**: cards show 10-men progress + `ס״ת ✓` + `בעל קורא · דרוש`, and a
  `מוכן ✓` ready state — confirms quorum = 10 men, ready = + Sefer Torah + Ba'al Korei.
- **Nusach (003)**: cards label `נוסח אשכנז` / `נוסח חב״ד`.
- **Header (001)**: Hebrew date `כ״ח בסיון תשפ״ו` + holiday chip `ראש חודש תמוז · עוד 3 ימים`.
- **Shared-device session (001)**: sign-in shows `זהו מכשיר משותף` with the 30-day default note.
- **Beit Chabad (003/006)**: a card references `בית חב״ד קרקוב`.
