---
name: Heritage Voyage
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d8'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0edec'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e4e2e1'
  on-surface: '#1b1c1b'
  on-surface-variant: '#42493e'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0ef'
  outline: '#72796e'
  outline-variant: '#c2c9bb'
  surface-tint: '#3b6934'
  primary: '#154212'
  on-primary: '#ffffff'
  primary-container: '#2d5a27'
  on-primary-container: '#9dd090'
  inverse-primary: '#a1d494'
  secondary: '#974725'
  on-secondary: '#ffffff'
  secondary-container: '#ff9970'
  on-secondary-container: '#772f0e'
  tertiary: '#423729'
  on-tertiary: '#ffffff'
  tertiary-container: '#5a4e3f'
  on-tertiary-container: '#d0c0ad'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#bcf0ae'
  primary-fixed-dim: '#a1d494'
  on-primary-fixed: '#002201'
  on-primary-fixed-variant: '#23501e'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#793110'
  tertiary-fixed: '#f1e0cc'
  tertiary-fixed-dim: '#d5c4b1'
  on-tertiary-fixed: '#231a0e'
  on-tertiary-fixed-variant: '#504536'
  background: '#fcf9f8'
  on-background: '#1b1c1b'
  surface-variant: '#e4e2e1'
typography:
  headline-xl:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Source Serif 4
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Source Serif 4
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style
The design system is crafted for high-end cultural heritage and historical tourism platforms. It balances the timeless weight of antiquity with the precision of modern technology. The brand personality is dignified, authoritative, yet welcoming—evoking the feeling of a curated gallery or an architectural walk through ancient stone corridors.

The style is **Minimalist with Tactile Accents**, prioritizing extreme clarity, generous whitespace, and a sophisticated "Jerusalem Stone" color story. It avoids decorative clutter, relying instead on structural alignment and refined typography to communicate value and history. The emotional response should be one of quiet reverence and professional reliability.

## Colors
The palette is rooted in organic, earthy tones that reflect natural materials. 
- **Primary (Forest Green):** Used for key actions, brand presence, and success states. It represents life and growth amidst the stone.
- **Accent (Terra-cotta):** Used sparingly for highlights, secondary call-to-actions, and interactive indicators to provide warmth.
- **Surface (Parchment):** The foundational neutral. This off-white provides a softer, more premium reading experience than pure white, reducing eye strain.
- **Tertiary (Stone):** A muted taupe used for borders, secondary iconography, and subtle UI divisions.

## Typography
The typographic strategy utilizes a high-contrast pairing: a modern, technical Sans-Serif for structure and a classic, readable Serif for narrative content.

For Hebrew locales, **Hanken Grotesk** should be substituted with **Heebo** (Heavy weight) to maintain the clean, dignified, and tech-modern aesthetic. The use of a high-weight sans-serif for headings removes the visual "dustiness" of traditional serifs while retaining a sense of architectural strength. **Source Serif 4** provides a scholarly, literary feel for long-form reading, ensuring the "Voyage" aspect of the brand feels educational and immersive.

## Layout & Spacing
This design system utilizes a **Fluid Grid** model with strict RTL (Right-to-Left) mirroring logic. The layout is built on an 8px base unit.

- **Desktop:** 12-column grid with 24px gutters. Content is centered with wide 64px margins to emphasize a premium, "un-crowded" feel.
- **Tablet:** 8-column grid with 24px gutters and 32px margins.
- **Mobile:** 4-column grid with 16px gutters and 16px margins.

**RTL Logic:** All horizontal spacing, padding, and positioning are logically defined (e.g., `padding-inline-start` instead of `padding-right`). Iconography that indicates direction (arrows, progress) must be flipped for Hebrew/Arabic locales, while brand-mark positioning moves to the top-right.

## Elevation & Depth
Depth is communicated through **Tonal Layering** and **Low-Contrast Outlines** rather than aggressive shadows. This keeps the interface feeling like flat stone or parchment.

- **Level 0 (Base):** Parchment (`#fcf9f8`).
- **Level 1 (Cards/Floating Elements):** White background with a 1px solid border in Stone (`#8c7e6d`) at 20% opacity.
- **Level 2 (Active/Hover):** A very soft, diffused ambient shadow (10% opacity Primary color) to indicate interactivity without breaking the minimalist aesthetic.
- **Overlays:** 40% opacity blur on the background layer to maintain focus on the modal/dialog.

## Shapes
Shapes are intentionally conservative. A **Soft (0.25rem)** corner radius is the standard, echoing the slight weathering of ancient hewn stone. 

- **Buttons & Inputs:** 4px (Soft) roundedness.
- **Large Cards & Images:** 8px (rounded-lg) to provide a gentle container for photography.
- **Search Bars:** 24px (rounded-xl) to distinguish search as a primary functional tool.
- **Icons:** Should use a "medium" stroke weight (approx 1.5pt to 2pt) with slightly rounded terminals to match the font characteristics.

## Components
- **Buttons:** Primary buttons are solid Forest Green with white text. Secondary buttons use a Terra-cotta outline with Terra-cotta text. Use `label-md` for button text to ensure readability.
- **Input Fields:** Use a subtle Parchment-darker background (`#f2eeed`) with a 1px Stone bottom-border. On focus, the border transitions to Forest Green.
- **Cards:** Use high-quality historical photography as the primary element. Text is placed on a Parchment surface below the image, separated by a thin, low-opacity divider.
- **Chips/Tags:** Used for "Period" or "Location" categories. Use the Terra-cotta color at 10% opacity for the background and 100% opacity for the text to create a soft, non-intrusive highlight.
- **Lists:** Use generous vertical padding (16px) between list items. Use a 1px Stone divider at 10% opacity to maintain order without visual noise.
- **Navigation:** The top navigation bar should be sticky with a slight backdrop blur to maintain the sense of depth as the user "travels" through the page.