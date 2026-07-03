import type { ReactNode, SVGProps } from "react";

/**
 * Inline-SVG icon set (Heritage Voyage). Deliberately NOT the Material Symbols webfont Stitch used —
 * inline SVG is tree-shakeable, needs no external/render-blocking font (keeps our GDPR/self-hosted
 * stance), and inherits color via `currentColor` so it stays tokens-only. Clean 24×24 geometry
 * (Lucide-style: 2px stroke, round joins). Add glyphs here as screens need them.
 */
export type IconName =
  | "map-pin"
  | "search"
  | "users"
  | "calendar"
  | "add"
  | "share"
  | "more"
  | "check"
  | "chevron-start";

const GLYPHS: Record<IconName, ReactNode> = {
  "map-pin": (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 2v4M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  add: <path d="M12 5v14M5 12h14" />,
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  "chevron-start": <path d="m15 18-6-6 6-6" />,
};

/** Icons drawn as filled shapes rather than stroked outlines (the "more" dots). */
const FILLED: Partial<Record<IconName, true>> = { more: true };

export function Icon({ name, size = 24, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = FILLED[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {GLYPHS[name]}
    </svg>
  );
}
