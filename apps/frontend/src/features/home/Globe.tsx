import { useEffect, useRef } from "react";

// Illustrative globe of travelers converging. Dot/arc colors come from the design tokens
// (--clay/--gold); the sphere shading uses illustration-specific stone shades.
// Decorative → aria-hidden; honors prefers-reduced-motion (renders one static frame).

const CITIES: [number, number, boolean][] = [
  [31.78, 35.22, true], [50.06, 19.94, true], [40.71, -74.0, true], [48.21, 16.37, true],
  [51.51, -0.12, true], [48.86, 2.35, true], [43.65, -79.38, true], [-34.61, -58.38, true],
  [-26.2, 28.04, true], [35.68, 139.69, true], [55.75, 37.62, true], [34.05, -118.24, true],
  [-33.87, 151.21, true], [41.88, -87.63, true], [31.63, -7.99, true], [24.47, 54.37, true],
];
const ARCS: [[number, number], [number, number]][] = [
  [[31.78, 35.22], [50.06, 19.94]], [[31.78, 35.22], [40.71, -74.0]], [[31.78, 35.22], [48.21, 16.37]],
  [[40.71, -74.0], [51.51, -0.12]], [[-34.61, -58.38], [40.71, -74.0]], [[35.68, 139.69], [31.78, 35.22]],
  [[34.05, -118.24], [40.71, -74.0]], [[-26.2, 28.04], [48.86, 2.35]], [[24.47, 54.37], [51.51, -0.12]],
];

function ll3(lat: number, lng: number, rot: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const th = ((lng + rot) * Math.PI) / 180;
  return [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
}
function slerp(a: number[], b: number[], t: number): number[] {
  const dot = Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!));
  const om = Math.acos(dot);
  if (om < 1e-4) return a.map((v, i) => v + (b[i]! - v) * t);
  const s = Math.sin(om);
  const p = Math.sin((1 - t) * om) / s;
  const q = Math.sin(t * om) / s;
  return [p * a[0]! + q * b[0]!, p * a[1]! + q * b[1]!, p * a[2]! + q * b[2]!];
}

export function Globe() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    let raf = 0;

    function draw(ms: number) {
      const W = cv!.width, H = cv!.height, cx = W / 2, cy = H / 2, R = W * 0.41;
      const dark = document.documentElement.dataset.theme === "dark";
      const rot = ms * 0.004 - 20;
      ctx!.clearRect(0, 0, W, H);

      const sg = ctx!.createRadialGradient(cx - R * 0.25, cy - R * 0.3, 0, cx, cy, R);
      if (dark) { sg.addColorStop(0, "#2e2619"); sg.addColorStop(1, "#100d09"); }
      else { sg.addColorStop(0, "#ede5d3"); sg.addColorStop(1, "#c9b89b"); }
      ctx!.save();
      ctx!.beginPath(); ctx!.arc(cx, cy, R, 0, Math.PI * 2); ctx!.fillStyle = sg; ctx!.fill();
      ctx!.clip();
      ctx!.strokeStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"; ctx!.lineWidth = 0.9;
      [-60, -30, 0, 30, 60].forEach((lat) => {
        const phi = ((90 - lat) * Math.PI) / 180;
        const ry = cy - Math.cos(phi) * R, hw = Math.sin(phi) * R;
        ctx!.beginPath(); ctx!.moveTo(cx - hw, ry); ctx!.lineTo(cx + hw, ry); ctx!.stroke();
      });
      for (let lg = 0; lg < 180; lg += 30) {
        const sx = Math.abs(Math.cos(((lg + rot) * Math.PI) / 180)) * R;
        if (sx < 3) continue;
        ctx!.beginPath(); ctx!.ellipse(cx, cy, sx, R, 0, 0, Math.PI * 2); ctx!.stroke();
      }
      ctx!.restore();

      const clay = css("--clay") || "#a4512e";
      const gold = css("--gold") || "#825916";
      const accent = dark ? gold : clay;
      const toRGBA = (hex: string, a: number) => {
        const h = hex.replace("#", "");
        const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
      };

      ARCS.forEach(([f, t], i) => {
        const phase = (ms * 0.00038 + i * 0.17) % 1;
        const prog = Math.min(phase * 2, 1);
        const fade = phase > 0.5 ? Math.max(0, 1 - (phase - 0.5) * 2.4) : 1;
        if (prog < 0.02 || fade < 0.01) return;
        const a = ll3(f[0], f[1], rot), b = ll3(t[0], t[1], rot);
        const N = 48;
        let prev: { x: number; y: number; z: number } | null = null;
        for (let j = 0; j <= Math.floor(N * prog); j++) {
          const v = slerp(a, b, j / N);
          const pt = { x: cx + v[0]! * R, y: cy - v[1]! * R, z: v[2]! };
          if (prev && prev.z > -0.08 && pt.z > -0.08) {
            ctx!.beginPath(); ctx!.moveTo(prev.x, prev.y); ctx!.lineTo(pt.x, pt.y);
            ctx!.strokeStyle = toRGBA(accent, (j / N) * 0.7 * fade); ctx!.lineWidth = 1.8; ctx!.stroke();
          }
          prev = pt;
        }
      });

      CITIES.forEach(([lat, lng]) => {
        const v = ll3(lat, lng, rot);
        if (v[2] < -0.05) return;
        const px = cx + v[0] * R, py = cy - v[1] * R;
        const al = Math.max(0.15, (v[2] + 0.05) / 1.05);
        if (!reduce) {
          const ph = (ms * 0.0006) % 1;
          ctx!.beginPath(); ctx!.arc(px, py, 6 * (1 + ph * 3), 0, Math.PI * 2);
          ctx!.strokeStyle = toRGBA(accent, (1 - ph) * 0.3 * al); ctx!.lineWidth = 0.9; ctx!.stroke();
        }
        ctx!.beginPath(); ctx!.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx!.fillStyle = toRGBA(accent, al * 0.9); ctx!.fill();
      });
    }

    if (reduce) {
      draw(0);
    } else {
      const tick = (ts: number) => { draw(ts); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      width={880}
      height={880}
      aria-hidden="true"
      role="presentation"
      className="block h-auto w-full max-w-[440px]"
    />
  );
}
