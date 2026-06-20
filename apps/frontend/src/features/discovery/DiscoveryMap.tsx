import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PublicMinyanDTO, BeitChabadPinDTO } from "@minyanim/shared";

type MapLib = typeof import("maplibre-gl");
type MapInstance = InstanceType<MapLib["Map"]>;
type MarkerInstance = InstanceType<MapLib["Marker"]>;

const DEFAULT_ZOOM = 10;

/** Escape user/admin-supplied text before injecting into the popup HTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Informational popup for a Beit Chabad pin (name + address + phone; not joinable — D18). */
function beitChabadPopup(c: BeitChabadPinDTO, t: (k: string) => string): string {
  const line = (label: string, val: string, href?: string) =>
    `<div style="margin-top:4px;font-size:13px;color:var(--ink)">${esc(label)}: ${href ? `<a href="${esc(href)}" style="color:var(--clay)">${esc(val)}</a>` : esc(val)}</div>`;
  return (
    `<div dir="rtl" style="font-family:Assistant,system-ui,sans-serif;max-width:230px;color:var(--ink)">` +
    `<div style="font-weight:800">${esc(c.name)}</div>` +
    (c.address ? line(t("minyanDetail.address"), c.address) : "") +
    (c.phone ? line(t("discovery.phone"), c.phone, `tel:${c.phone}`) : "") +
    `<div style="margin-top:6px;font-size:12px;color:var(--muted)">${esc(c.city)}, ${esc(c.country)} · ${esc(t("discovery.beitChabadInfo"))}</div>` +
    `</div>`
  );
}

/**
 * Discovery map (FR-018). Lazy-loaded MapLibre showing **user minyanim** (clay pins, clickable →
 * the minyan) and a distinct **Beit Chabad** static layer (gold pins, informational). Optional: if
 * the tile key is absent it renders nothing and the list view remains the full, keyboard-operable
 * surface (map/list parity). Minyan pins are focusable `<button>`s (keyboard-reachable). The map is
 * created once; markers/centre are updated imperatively as discovery data changes (per poll).
 */
export function DiscoveryMap({
  center,
  minyanim,
  beitChabad,
  onSelectMinyan,
}: {
  center: { lat: number; lng: number };
  minyanim: PublicMinyanDTO[];
  beitChabad: BeitChabadPinDTO[];
  onSelectMinyan: (id: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const libRef = useRef<MapLib | null>(null);
  const markersRef = useRef<MarkerInstance[]>([]);
  const onSelectRef = useRef(onSelectMinyan);
  onSelectRef.current = onSelectMinyan;
  // Flips true once the (async) map is created, so the markers effect — which may run before the
  // map finishes loading — re-runs and actually places the pins on first load.
  const [ready, setReady] = useState(false);
  const tileKey = import.meta.env.VITE_MAPTILER_TILE_KEY as string | undefined;

  // Create the map once (lazy import keeps MapLibre out of the initial bundle).
  useEffect(() => {
    if (!tileKey || !ref.current) return;
    let cancelled = false;
    void Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
      .then(([mod]) => {
        if (cancelled || !ref.current) return;
        libRef.current = mod;
        const map = new mod.Map({
          container: ref.current,
          style: `https://api.maptiler.com/maps/streets/style.json?key=${tileKey}`,
          center: [center.lng, center.lat],
          zoom: DEFAULT_ZOOM,
          attributionControl: false,
        });
        mapRef.current = map;
        map.on("load", () => !cancelled && setReady(true));
      })
      .catch(() => {
        // Tile/library failure is non-fatal — the list view is the source of truth.
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
    // Created once (keyed on tileKey); centre + markers are synced by the effects below.
  }, [tileKey]);

  // Recenter when the search centre moves.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.flyTo({ center: [center.lng, center.lat], zoom: Math.max(map.getZoom(), DEFAULT_ZOOM) });
  }, [center.lat, center.lng]);

  // Rebuild markers whenever the discovery results change.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib) return;
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = [];

    const addMarker = (
      label: string,
      color: string,
      lng: number,
      lat: number,
      opts: { onClick?: () => void; popupHtml?: string } = {},
    ) => {
      const el = document.createElement(opts.onClick ? "button" : "div");
      el.setAttribute("aria-label", label);
      el.title = label;
      el.style.cssText = `width:18px;height:18px;border-radius:50%;border:2px solid var(--surface);background:${color};box-shadow:0 1px 3px rgba(0,0,0,.3);${opts.onClick ? "cursor:pointer;padding:0;" : "cursor:pointer;"}`;
      if (opts.onClick) {
        (el as HTMLButtonElement).type = "button";
        el.addEventListener("click", opts.onClick);
      }
      const marker = new lib.Marker({ element: el }).setLngLat([lng, lat]);
      if (opts.popupHtml) marker.setPopup(new lib.Popup({ offset: 16, closeButton: true }).setHTML(opts.popupHtml));
      markersRef.current.push(marker.addTo(map));
    };

    for (const m of minyanim) {
      addMarker(`${m.city} · ${t(`minyanStatus.${m.status}`)} · ${m.committedMen}/10`, "var(--clay)", m.lng, m.lat, {
        onClick: () => onSelectRef.current(m.id),
      });
    }
    for (const c of beitChabad) {
      addMarker(`${t("discovery.beitChabad")}: ${c.name}`, "var(--gold)", c.lng, c.lat, { popupHtml: beitChabadPopup(c, t) });
    }
  }, [ready, minyanim, beitChabad, t]);

  if (!tileKey) return null;
  return <div ref={ref} role="application" aria-label={t("discovery.mapAlt")} className="h-72 w-full overflow-hidden rounded-2xl border border-line" />;
}
