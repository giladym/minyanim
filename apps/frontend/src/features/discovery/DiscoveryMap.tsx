import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PublicMinyanDTO, BeitChabadPinDTO } from "@minyanim/shared";

type MapLib = typeof import("maplibre-gl");
type MapInstance = InstanceType<MapLib["Map"]>;
type MarkerInstance = InstanceType<MapLib["Marker"]>;

const DEFAULT_ZOOM = 10;

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
  const tileKey = import.meta.env.VITE_MAPTILER_TILE_KEY as string | undefined;

  // Create the map once (lazy import keeps MapLibre out of the initial bundle).
  useEffect(() => {
    if (!tileKey || !ref.current) return;
    let cancelled = false;
    void Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
      .then(([mod]) => {
        if (cancelled || !ref.current) return;
        libRef.current = mod;
        mapRef.current = new mod.Map({
          container: ref.current,
          style: `https://api.maptiler.com/maps/streets/style.json?key=${tileKey}`,
          center: [center.lng, center.lat],
          zoom: DEFAULT_ZOOM,
          attributionControl: false,
        });
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

    const addMarker = (label: string, color: string, lng: number, lat: number, onClick?: () => void) => {
      const el = document.createElement(onClick ? "button" : "div");
      el.setAttribute("aria-label", label);
      el.title = label;
      el.style.cssText = `width:18px;height:18px;border-radius:50%;border:2px solid var(--surface);background:${color};box-shadow:0 1px 3px rgba(0,0,0,.3);${onClick ? "cursor:pointer;padding:0;" : ""}`;
      if (onClick) {
        (el as HTMLButtonElement).type = "button";
        el.addEventListener("click", onClick);
      }
      markersRef.current.push(new lib.Marker({ element: el }).setLngLat([lng, lat]).addTo(map));
    };

    for (const m of minyanim) {
      addMarker(`${m.city} · ${t(`minyanStatus.${m.status}`)} · ${m.committedMen}/10`, "var(--clay)", m.lng, m.lat, () => onSelectRef.current(m.id));
    }
    for (const c of beitChabad) {
      addMarker(`${t("discovery.beitChabad")}: ${c.name}`, "var(--gold)", c.lng, c.lat);
    }
  }, [minyanim, beitChabad, t]);

  if (!tileKey) return null;
  return <div ref={ref} role="application" aria-label={t("discovery.mapAlt")} className="h-72 w-full overflow-hidden rounded-2xl border border-line" />;
}
