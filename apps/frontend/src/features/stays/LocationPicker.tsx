import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GeoResult } from "@minyanim/shared";
import { reverseGeocode, searchPlaces, searchPlacesPrecise } from "../../lib/geo";
import { ApiError } from "../../lib/api";
import { useMaptilerTileKey } from "../../lib/config";
import { maptilerLogoControl } from "../../lib/maptilerLogo";

/** The location subset of a Stay the picker resolves. lat/lng are null in manual mode. */
export interface LocationValue {
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
}

const fieldCls =
  "w-full rounded-xl border border-line2 bg-surface px-3.5 py-3 text-ink outline-none transition focus:border-primary";
const labelCls = "mb-1.5 block text-sm font-bold text-ink";
/** Subtle bordered secondary button — the search ↔ manual-entry mode toggle (a real affordance,
 * not a bare text link). */
const toggleCls = "self-start rounded-lg border border-line2 px-3 py-1.5 text-sm font-bold text-primary-ink";

/** World-ish default view when nothing is selected yet — lets the user pan anywhere to pick. */
const DEFAULT_CENTER: [number, number] = [20, 30];
const DEFAULT_ZOOM = 1.3;

/**
 * Search-first location picker (FR-008). Type a place → choose from results → city/country/
 * coordinates resolve. A lazy-loaded MapLibre map both confirms the pick AND lets the user
 * click anywhere to set the location by reverse-geocoding the point. The map is optional — if
 * the tile key is missing or tiles fail, search + an always-visible manual fallback still work.
 * RTL, keyboard-operable, ≥44px targets.
 *
 * @param value Current location selection.
 * @param onChange Called with the updated location whenever it changes.
 */
export function LocationPicker({
  value,
  onChange,
  invalid = false,
  precise = false,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  /** When the parent's submit validation flagged the location, mark the active input invalid so
   * focus-first-error can land on it and screen readers announce the problem. */
  invalid?: boolean;
  /** Precise mode (minyan host): address/POI-level search + a map click drops the EXACT point
   * (not the city centre). Default false = city-level (Stays). */
  precise?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [attribution, setAttribution] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [picking, setPicking] = useState(false);
  const [pickMessage, setPickMessage] = useState("");
  const lang = i18n.resolvedLanguage === "en" ? "en" : "he";

  // Debounced geocoding search (~300ms). Only the city box is sent (never the address, D1).
  useEffect(() => {
    if (manual || query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setSearchError("");
      return;
    }
    setSearching(true);
    setSearchError("");
    const handle = setTimeout(() => {
      (precise ? searchPlacesPrecise : searchPlaces)(query.trim(), lang)
        .then((r) => {
          setResults(r.results);
          setAttribution(r.attribution);
        })
        .catch((err: unknown) => {
          setResults([]);
          // Surface a provider outage explicitly; other errors fall back to the no-results hint.
          if (err instanceof ApiError && err.body.errors.some((e) => e.code === "geo.unavailable")) {
            setSearchError(t("errors.geo.unavailable"));
          }
        })
        .finally(() => {
          setSearching(false);
          setSearched(true);
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [query, lang, manual, t, precise]);

  function pick(r: GeoResult) {
    onChange({ city: r.city, country: r.country, lat: r.lat, lng: r.lng });
    setResults([]);
    setPickMessage("");
    setQuery(r.label);
  }

  // Click-to-pick: reverse-geocode the clicked point and adopt the nearest locality.
  function handleMapPick(lat: number, lng: number) {
    setPicking(true);
    setPickMessage("");
    reverseGeocode(lat, lng, lang)
      .then((r) => {
        const hit = r.results[0];
        if (hit) {
          setAttribution(r.attribution);
          // Precise (minyan): keep the EXACT clicked point; use the reverse hit only for the
          // city/country labels. City-level (Stays): adopt the locality's own coordinates.
          if (precise) {
            onChange({ city: hit.city, country: hit.country, lat, lng });
            setResults([]);
            setPickMessage("");
            setQuery(hit.label);
          } else {
            pick(hit);
          }
        } else {
          setPickMessage(t("stays.location.reverseNoResults"));
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.body.errors.some((e) => e.code === "geo.unavailable")) {
          setPickMessage(t("errors.geo.unavailable"));
        } else {
          setPickMessage(t("stays.location.reverseNoResults"));
        }
      })
      .finally(() => setPicking(false));
  }

  return (
    <div className="flex flex-col gap-3">
      <span className={labelCls}>{t("stays.location.title")}</span>

      {manual ? (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className={labelCls}>{t("stays.location.city")}</span>
            <input
              className={fieldCls}
              value={value.city}
              aria-label={t("stays.location.city")}
              aria-invalid={invalid || undefined}
              onChange={(e) => onChange({ ...value, city: e.target.value, lat: null, lng: null })}
            />
          </label>
          <label className="block">
            <span className={labelCls}>{t("stays.location.country")}</span>
            <input
              className={fieldCls}
              value={value.country}
              aria-label={t("stays.location.country")}
              onChange={(e) => onChange({ ...value, country: e.target.value, lat: null, lng: null })}
            />
          </label>
          <button
            type="button"
            className={toggleCls}
            onClick={() => setManual(false)}
          >
            {t("stays.location.searchToggle")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className={labelCls}>{t("stays.location.searchLabel")}</span>
            <input
              type="search"
              className={fieldCls}
              value={query}
              aria-label={t("stays.location.searchLabel")}
              aria-invalid={invalid || undefined}
              placeholder={t("stays.location.searchPlaceholder")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          {searching && <p className="text-sm text-muted">{t("stays.location.searching")}</p>}

          {results.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-1.5">
              {results.map((r) => (
                <li key={r.label}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="block w-full rounded-lg px-3 py-3 text-start text-ink hover:bg-chip"
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {searchError && (
            <p role="alert" className="text-sm font-semibold text-clay-ink">{searchError}</p>
          )}

          {!searching && searched && !searchError && results.length === 0 && (
            <p className="text-sm text-muted">{t("stays.location.noResults")}</p>
          )}

          {value.city && value.lat != null && (
            <p className="text-sm font-semibold text-teal-ink">
              {t("stays.location.selected")}: {value.city}, {value.country}
            </p>
          )}

          <PickableMap
            lat={value.lat}
            lng={value.lng}
            picking={picking}
            onPick={handleMapPick}
          />

          {pickMessage && (
            <p role="alert" className="text-sm font-semibold text-clay-ink">{pickMessage}</p>
          )}

          {attribution && <p className="text-xs text-faint" dir="ltr">{attribution}</p>}

          <button
            type="button"
            className={toggleCls}
            onClick={() => setManual(true)}
          >
            {t("stays.location.manualToggle")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Aliases for the lazily-imported MapLibre module + its instances (avoids a hard import). */
type MapLib = typeof import("maplibre-gl");
type MapInstance = InstanceType<MapLib["Map"]>;
type MarkerInstance = InstanceType<MapLib["Marker"]>;

/**
 * Lazy-loaded MapLibre map that both confirms the current pick and accepts clicks to set a new
 * one (the click is reverse-geocoded by the parent via {@link onPick}). Purely optional: if the
 * tile key is absent or tiles fail to load, it renders nothing and never breaks the flow (D2).
 * The map is created once; the marker/center are updated imperatively as `value` changes so a
 * click doesn't tear down and rebuild the whole map.
 */
function PickableMap({
  lat,
  lng,
  picking,
  onPick,
}: {
  lat: number | null;
  lng: number | null;
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);
  const libRef = useRef<MapLib | null>(null);
  // Keep the latest onPick without re-initializing the map when the callback identity changes.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const tileKey = useMaptilerTileKey();

  // Initialize the map exactly once (mount). Dynamic import keeps MapLibre out of the initial bundle.
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
          center: lng != null && lat != null ? [lng, lat] : DEFAULT_CENTER,
          zoom: lng != null && lat != null ? 9 : DEFAULT_ZOOM,
          attributionControl: { compact: true }, // © MapTiler / © OpenStreetMap (required attribution)
        });
        map.addControl(maptilerLogoControl(), "bottom-left"); // MapTiler logo (free-tier requirement)
        map.on("click", (e: { lngLat: { lat: number; lng: number } }) =>
          onPickRef.current(e.lngLat.lat, e.lngLat.lng),
        );
        if (lat != null && lng != null) {
          markerRef.current = new mod.Marker().setLngLat([lng, lat]).addTo(map);
        }
        mapRef.current = map;
      })
      .catch(() => {
        // Tile/library failure is non-fatal — the map is optional confirmation/picking only.
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Init once (keyed only on tileKey): the marker/center are kept in sync by the effect below.
  }, [tileKey]);

  // Sync the marker + recenter when the selected location changes (search pick or map click).
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || lat == null || lng == null) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      markerRef.current = new lib.Marker().setLngLat([lng, lat]).addTo(map);
    }
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 9) });
  }, [lat, lng]);

  if (!tileKey) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted">{t("stays.location.mapHint")}</p>
      <div
        ref={ref}
        role="application"
        aria-label={t("stays.location.mapPickAlt")}
        className="h-44 w-full overflow-hidden rounded-xl border border-line sm:h-56"
      />
      {picking && <p className="text-sm text-muted">{t("stays.location.reverseSearching")}</p>}
    </div>
  );
}
