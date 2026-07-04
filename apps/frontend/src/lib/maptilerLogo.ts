/**
 * A MapLibre custom control that shows the MapTiler logo linking to maptiler.com — REQUIRED by the
 * MapTiler free-tier terms for any published map. Paired with MapLibre's AttributionControl (the
 * "© MapTiler © OpenStreetMap" links), this makes our interactive maps compliant. The logo is
 * self-hosted (public/maptiler-logo.svg), no external dependency.
 */
export interface MaplibreControl {
  onAdd(): HTMLElement;
  onRemove(): void;
}

export function maptilerLogoControl(): MaplibreControl {
  return {
    onAdd() {
      const el = document.createElement("div");
      el.className = "maplibregl-ctrl";
      const a = document.createElement("a");
      a.href = "https://www.maptiler.com/";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("aria-label", "MapTiler");
      a.innerHTML = '<img src="/maptiler-logo.svg" alt="MapTiler" style="display:block;height:18px;margin:2px 4px" />';
      el.appendChild(a);
      return el;
    },
    onRemove() {},
  };
}
