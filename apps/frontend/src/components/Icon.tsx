import type { SVGProps } from "react";

/**
 * Inline-SVG icon set (Heritage Voyage). Deliberately NOT the Material Symbols webfont Stitch used —
 * inline SVG is tree-shakeable, needs no external/render-blocking font (keeps our GDPR/self-hosted
 * stance), and inherits color via `currentColor` so it stays tokens-only. Medium 1.75 stroke with
 * round terminals to match the type. Add glyphs here as screens need them.
 */
export type IconName =
  | "calendar"
  | "search"
  | "handshake"
  | "groups"
  | "mosque"
  | "map-pin"
  | "add"
  | "share"
  | "more"
  | "check"
  | "chevron-start";

const PATHS: Record<IconName, string> = {
  // calendar with a "+" — register a stay
  calendar: "M7 3v3M17 3v3M3.5 9.5h17M5 5.5h14a1.5 1.5 0 011.5 1.5v12A1.5 1.5 0 0119 20.5H5A1.5 1.5 0 013.5 19V7A1.5 1.5 0 015 5.5zM12 13v4M10 15h4",
  // magnifier with a check — discover partners
  search: "M10.5 4a6.5 6.5 0 104.2 11.46l4.42 4.42M8.5 10.2l1.6 1.6 3-3.2",
  handshake: "M8 11l2.5-2.5a2 2 0 012.8 0l3.2 3.2M4 8l3.5 3.5a2 2 0 002.8 0M20 8l-3.5 3.5M4 8h3M17 11.5l2.5 2.5M6.5 13.5l2 2M9 16l1.5 1.5a1.8 1.8 0 002.6 0",
  groups: "M9 11a3 3 0 100-6 3 3 0 000 6zM3.5 19a5.5 5.5 0 0111 0M16 11a3 3 0 10-1-5.8M17 13.5a5.5 5.5 0 013.5 5.1",
  mosque: "M12 3s4 3 4 6.5H8C8 6 12 3 12 3zM6 9.5h12v3H6zM5 20V13a1 1 0 011-1h12a1 1 0 011 1v7M9 20v-3.5a1 1 0 011-1h4a1 1 0 011 1V20M3 20h18",
  "map-pin": "M12 21s6.5-5.5 6.5-10.5A6.5 6.5 0 005.5 10.5C5.5 15.5 12 21 12 21zM12 13a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  add: "M12 5v14M5 12h14",
  share: "M8.5 13.5l7-4M8.5 10.5l7 4M6 12a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM23 6a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM23 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z",
  more: "M12 6.5a.75.75 0 100-1.5.75.75 0 000 1.5zM12 12.75a.75.75 0 100-1.5.75.75 0 000 1.5zM12 19a.75.75 0 100-1.5.75.75 0 000 1.5z",
  check: "M4.5 12.5l5 5 10-11",
  // chevron pointing to the inline-start (flips with RTL because the whole SVG is in the flow)
  "chevron-start": "M15 6l-6 6 6 6",
};

/** Icons that read better filled than stroked (the "more" dots). */
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
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
