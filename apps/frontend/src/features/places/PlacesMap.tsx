import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PlaceDTO } from "@minyanim/shared";
import { useMaptilerTileKey } from "../../lib/config";
import { maptilerLogoControl } from "../../lib/maptilerLogo";

type MapLib = typeof import("maplibre-gl");
type MapInstance = InstanceType<MapLib["Map"]>;

/**
 * Lazy-loaded MapLibre map showing the (already layer-filtered) places as a CLUSTERED GeoJSON source
 * so dense areas stay performant (FR-007/SC-004). Purely an enhancement — the list is the a11y
 * source of truth; if the tile key is missing or tiles fail, this renders nothing and the list
 * still works. Mirrors the PickableMap seam (tile key via GET /api/config; MapTiler logo control).
 */
type Bbox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export function PlacesMap({
  places,
  center,
  onViewportChange,
}: {
  places: PlaceDTO[];
  center: { lat: number; lng: number };
  /** Called (debounced) after each pan/zoom with the map's current bounds, to reload places. */
  onViewportChange?: (bbox: Bbox) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const libRef = useRef<MapLib | null>(null);
  const tileKey = useMaptilerTileKey();
  // Hold the latest callback so the once-only init effect always calls the current one.
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const featureCollection = {
    type: "FeatureCollection" as const,
    features: places.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: { name: p.name },
    })),
  };

  // Initialize the map once (mount) with a clustered source + cluster/point layers.
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
          zoom: 12,
          attributionControl: { compact: true },
        });
        map.addControl(maptilerLogoControl(), "bottom-left");
        map.on("load", () => {
          map.addSource("places", { type: "geojson", data: featureCollection, cluster: true, clusterRadius: 50 });
          map.addLayer({ id: "clusters", type: "circle", source: "places", filter: ["has", "point_count"],
            paint: { "circle-color": "#154212", "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28] } });
          map.addLayer({ id: "cluster-count", type: "symbol", source: "places", filter: ["has", "point_count"],
            layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#ffffff" } });
          map.addLayer({ id: "point", type: "circle", source: "places", filter: ["!", ["has", "point_count"]],
            paint: { "circle-color": "#974725", "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
          map.on("click", "point", (e) => {
            const f = e.features?.[0];
            const name = (f?.properties as { name?: string } | undefined)?.name ?? "";
            const geo = f?.geometry as { coordinates: [number, number] } | undefined;
            if (geo) new mod.Popup().setLngLat(geo.coordinates).setText(name).addTo(map);
          });
        });
        // Reload places as the user pans/zooms — debounced so a drag emits one request on settle.
        let moveTimer: ReturnType<typeof setTimeout> | undefined;
        map.on("moveend", () => {
          if (moveTimer) clearTimeout(moveTimer);
          moveTimer = setTimeout(() => {
            const b = map.getBounds();
            onViewportChangeRef.current?.({
              minLat: b.getSouth(),
              maxLat: b.getNorth(),
              minLng: b.getWest(),
              maxLng: b.getEast(),
            });
          }, 350);
        });
        mapRef.current = map;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Init once (keyed on tileKey); data + center updates are handled by the effect below.
  }, [tileKey]);

  // Update the source data + recenter when the filtered places / center change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("places") as { setData?: (d: unknown) => void } | undefined;
      src?.setData?.(featureCollection);
      // Only recenter on a genuine `center` change (a Stay/pick). A pan/zoom keeps `center` fixed,
      // so this must NOT snap the map back and fight the user's viewport.
      const cur = map.getCenter();
      if (Math.abs(cur.lng - center.lng) > 1e-4 || Math.abs(cur.lat - center.lat) > 1e-4) {
        map.setCenter([center.lng, center.lat]);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [places, center.lat, center.lng]);

  if (!tileKey) return null;
  return (
    <div
      ref={ref}
      role="application"
      aria-label={t("places.mapAlt")}
      className="h-56 w-full overflow-hidden rounded-2xl border border-line sm:h-72"
    />
  );
}
