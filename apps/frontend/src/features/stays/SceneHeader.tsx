/**
 * A deterministic, on-brand card header "scene" — a Heritage-Voyage gradient with a topographic /
 * map-like line motif. Used as the location-card header when there's no real map thumbnail (the
 * key lacks Static Maps, or the Stay has no coordinates). No external service, no photos → no
 * licensing risk; picked by a stable hash of the Stay so a location always gets the same scene.
 * Colors are token-based gradient utilities; the motif is a low-opacity white overlay.
 */

/** Small stable string hash (djb2) → non-negative int, for deterministic scene selection. */
function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Gradient palettes (token colors) — the "sky/terrain" wash behind the motif. */
const GRADIENTS = [
  "from-primary-container via-teal to-gold",
  "from-teal via-primary-container to-gold",
  "from-gold via-clay to-primary-container",
  "from-primary via-teal to-gold",
  "from-clay via-gold to-teal",
  "from-teal to-primary-container",
];

/** Topographic-contour motifs (viewBox 0 0 400 112), varied per scene. */
const MOTIFS = [
  "M0 34H400M0 64H400M0 94H400M90 0V112M190 0V112M300 0V112 M0 78C90 44 150 100 250 62S360 44 400 70",
  "M0 30H400M0 66H400M0 96H400M70 0V112M170 0V112M280 0V112 M0 66C90 98 160 44 250 76S360 96 400 60",
  "M0 40H400M0 72H400M60 0V112M160 0V112M260 0V112M340 0V112 M0 84C80 54 150 92 250 66S360 88 400 64",
  "M0 28H400M0 58H400M0 90H400M100 0V112M210 0V112M320 0V112 M0 72C110 40 170 96 260 60S370 46 400 74",
];

export function SceneHeader({ seed }: { seed: string }) {
  const h = hash(seed);
  const gradient = GRADIENTS[h % GRADIENTS.length];
  const motif = MOTIFS[(h >> 3) % MOTIFS.length];
  return (
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} aria-hidden>
      <svg viewBox="0 0 400 112" preserveAspectRatio="none" className="h-full w-full opacity-20">
        <g stroke="#fff" strokeWidth="1" fill="none">
          <path d={motif} />
        </g>
      </svg>
    </div>
  );
}
