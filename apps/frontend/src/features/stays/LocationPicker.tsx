import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GeoResult } from "@minyanim/shared";
import { searchPlaces } from "../../lib/geo";
import { ApiError } from "../../lib/api";

/** The location subset of a Stay the picker resolves. lat/lng are null in manual mode. */
export interface LocationValue {
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
}

const fieldCls =
  "w-full rounded-xl border border-line2 bg-surface px-3.5 py-3 text-ink outline-none transition focus:border-clay";
const labelCls = "mb-1.5 block text-sm font-bold text-ink";

/**
 * Search-first location picker (FR-008). Type a place → choose from results → city/country/
 * coordinates resolve. A lazy-loaded MapLibre map confirms the pick (optional — never blocks
 * the flow if the tile key is missing or tiles fail). An always-visible manual fallback lets
 * the user type city/country directly (lat/lng null). RTL, keyboard-operable, ≥44px targets.
 *
 * @param value Current location selection.
 * @param onChange Called with the updated location whenever it changes.
 */
export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
}) {
  const { t, i18n } = useTranslation();
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [attribution, setAttribution] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
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
      searchPlaces(query.trim(), lang)
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
  }, [query, lang, manual, t]);

  function pick(r: GeoResult) {
    onChange({ city: r.city, country: r.country, lat: r.lat, lng: r.lng });
    setResults([]);
    setQuery(r.label);
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
            className="self-start text-sm font-bold text-clay"
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
            <>
              <p className="text-sm font-semibold text-teal-ink">
                {t("stays.location.selected")}: {value.city}, {value.country}
              </p>
              <ConfirmationMap lat={value.lat} lng={value.lng} />
            </>
          )}

          {attribution && <p className="text-xs text-faint" dir="ltr">{attribution}</p>}

          <button
            type="button"
            className="self-start text-sm font-bold text-clay"
            onClick={() => setManual(true)}
          >
            {t("stays.location.manualToggle")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Lazy-loaded MapLibre confirmation map. The map is purely confirmation: if the tile key is
 * absent or tiles fail to load, the component renders nothing and never breaks the flow (D2).
 */
function ConfirmationMap({ lat, lng }: { lat: number; lng: number | null }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const tileKey = import.meta.env.VITE_MAPTILER_TILE_KEY as string | undefined;

  useEffect(() => {
    if (!tileKey || !ref.current || lng == null) return;
    let cancelled = false;
    let map: { remove: () => void } | undefined;
    // Dynamic import keeps MapLibre out of the dashboard/initial bundle (KISS, lean bundle).
    void Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
      .then(([mod]) => {
        if (cancelled || !ref.current) return;
        const maplibregl = mod.default;
        map = new maplibregl.Map({
          container: ref.current,
          style: `https://api.maptiler.com/maps/streets/style.json?key=${tileKey}`,
          center: [lng, lat],
          zoom: 9,
          attributionControl: false,
        });
        new maplibregl.Marker().setLngLat([lng, lat]).addTo(map as never);
      })
      .catch(() => {
        // Tile/library failure is non-fatal — the map is optional confirmation only.
      });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, tileKey]);

  if (!tileKey || lng == null) return null;
  return (
    <div
      ref={ref}
      role="img"
      aria-label={t("stays.location.mapAlt")}
      className="h-48 w-full overflow-hidden rounded-xl border border-line"
    />
  );
}
