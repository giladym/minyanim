import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LayerDTO, PlaceDTO } from "@minyanim/shared";
import { usePlaces, usePlacesInBbox, type PlacesBbox } from "../../lib/places";
import { layerLabel, defaultHiddenLayerIds } from "../../lib/layerLabel";
import { searchPlaces } from "../../lib/geo";
import { LocationPicker, type LocationValue } from "../stays/LocationPicker";
import { PlacesMap } from "./PlacesMap";
import { googleMapsUrl, wazeUrl } from "./navLinks";
import { Icon } from "../../components/Icon";

/** Read the location prefill from the URL (entry from a Stay / Minyan / Discovery) without needing
 * router context (keeps this testable). Coordinates anchor directly; a city-only entry is geocoded. */
function prefillFromUrl(): { lat: number; lng: number } | null {
  const q = new URLSearchParams(window.location.search);
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  return q.get("lat") && q.get("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
function cityFromUrl(): { city: string; country: string } {
  const q = new URLSearchParams(window.location.search);
  return { city: q.get("city") ?? "", country: q.get("country") ?? "" };
}

/** Kosher/Jewish places near a location (010 US1): layer toggles + clustered map + an accessible list
 * (the source of truth) with one-tap Google Maps / Waze navigation per place. */
export function PlacesView() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === "en" ? "en" : "he";
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(prefillFromUrl);
  // Seed the fallback picker with any city passed in the URL so a coordless entry still shows where
  // it means — and lets the geocode effect (below) resolve coordinates without the user re-typing.
  const [picker, setPicker] = useState<LocationValue>(() => ({ ...cityFromUrl(), lat: null, lng: null }));
  // The change-location card is collapsed to a summary by default (mirrors the Stay edit page):
  // reviewing the current spot is the common case, changing it the edge case.
  const [locationOpen, setLocationOpen] = useState(false);

  // City-only entry (a Stay with no stored coordinates): geocode the city name to a centre once, so
  // reaching places from a Stay/Minyan prefills the map instead of dropping the user on "pick a place".
  useEffect(() => {
    if (coords || !picker.city) return;
    let cancelled = false;
    searchPlaces(picker.city, lang)
      .then((r) => {
        const hit = r.results[0];
        if (!cancelled && hit) setCoords({ lat: hit.lat, lng: hit.lng });
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Run once for the initial city prefill; later manual picks set coords directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The map emits a viewport bbox on every pan/zoom; once we have one, places reload from the bbox
  // (keeping the previous set visible during the fetch). Before the first `moveend`, the initial
  // point+radius query around `coords` seeds the view.
  const [viewport, setViewport] = useState<PlacesBbox | null>(null);
  const point = usePlaces(coords?.lat ?? null, coords?.lng ?? null);
  const box = usePlacesInBbox(viewport);
  const data = viewport ? box.data : point.data;
  const isFetching = viewport ? box.isFetching : point.isLoading;
  const [off, setOff] = useState<Set<string>>(new Set()); // retired-from-view layer ids (toggles)

  const layers = data?.layers ?? [];

  // Seed the toggles once layers first load: only kosher restaurants + shops start ON; everything
  // else (synagogues, Chabad houses, mikvehs…) starts OFF. Applied once so later user toggles stick.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || layers.length === 0) return;
    defaultsApplied.current = true;
    setOff(defaultHiddenLayerIds(layers));
  }, [layers]);

  const visible = useMemo(
    () => (data?.places ?? []).filter((p) => !off.has(p.layerId)),
    [data?.places, off],
  );

  /** Adopt a location chosen in the picker: keep the summary card in sync, and once real
   * coordinates resolve re-centre the map (via `coords`), drop the stale pan bbox so places
   * refetch around the new point, collapse the editor, and rewrite the URL search params so the
   * view stays shareable/reloadable (mirrors how this view reads lat/lng/city/country). */
  function applyLocation(v: LocationValue) {
    setPicker(v);
    if (v.lat == null || v.lng == null) return;
    setCoords({ lat: v.lat, lng: v.lng });
    setViewport(null);
    setLocationOpen(false);
    const q = new URLSearchParams(window.location.search);
    q.set("lat", String(v.lat));
    q.set("lng", String(v.lng));
    if (v.city) q.set("city", v.city); else q.delete("city");
    if (v.country) q.set("country", v.country); else q.delete("country");
    window.history.replaceState({}, "", `${window.location.pathname}?${q.toString()}`);
  }

  // No location yet → let the user pick one (also the coordless-Stay fallback).
  if (!coords) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6" dir="rtl">
        <h1 className="font-display text-2xl font-extrabold text-ink">{t("places.title")}</h1>
        <p className="text-sm text-muted">{t("places.pickLocation")}</p>
        <LocationPicker value={picker} onChange={applyLocation} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6" dir="rtl">
      <h1 className="font-display text-2xl font-extrabold text-ink">{t("places.title")}</h1>

      <div className="rounded-xl border border-line bg-surface p-4">
        {locationOpen ? (
          <>
            <LocationPicker value={picker} onChange={applyLocation} />
            <button
              type="button"
              className="mt-3 flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-sm font-bold text-primary-ink"
              aria-label={t("stays.location.close")}
              aria-expanded={true}
              onClick={() => setLocationOpen(false)}
            >
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-chip text-lg leading-none text-primary-ink">−</span>
              {t("stays.location.close")}
            </button>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-bold text-ink">{t("stays.location.title")}</span>
              <span className="flex items-center gap-2 text-ink">
                <Icon name="map-pin" size={16} className="text-faint" aria-hidden />
                <span className="truncate font-bold">
                  {picker.city
                    ? picker.city + (picker.country ? `, ${picker.country}` : "")
                    : `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`}
                </span>
              </span>
            </span>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold text-primary-ink"
              aria-label={t("stays.location.change")}
              aria-expanded={false}
              onClick={() => setLocationOpen(true)}
            >
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-chip text-lg leading-none text-primary-ink">+</span>
              <span className="hidden sm:inline">{t("stays.location.change")}</span>
            </button>
          </div>
        )}
      </div>

      {layers.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("places.layers")}>
          {layers.map((l) => {
            const on = !off.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                className={"rounded-full px-3 py-1.5 text-sm font-bold " + (on ? "bg-primary text-on-primary" : "border border-line text-muted")}
                onClick={() => setOff((s) => { const n = new Set(s); if (on) n.add(l.id); else n.delete(l.id); return n; })}
              >
                {layerLabel(l, t)}
              </button>
            );
          })}
        </div>
      )}

      <PlacesMap places={visible} center={coords} onViewportChange={setViewport} />

      {isFetching && <p className="text-sm text-muted">{t("discovery.loading")}</p>}
      {data && visible.length === 0 && <p className="text-sm text-muted">{t("places.empty")}</p>}

      <ul className="flex flex-col gap-2">
        {visible.map((p) => (
          <PlaceRow key={p.id} place={p} layer={layers.find((l) => l.id === p.layerId)} />
        ))}
      </ul>
    </div>
  );
}

const DIETARY_KEY: Record<string, string> = { meat: "admin.dietaryMeat", dairy: "admin.dietaryDairy", parve: "admin.dietaryParve" };

function PlaceRow({ place: p, layer }: { place: PlaceDTO; layer?: LayerDTO }) {
  const { t } = useTranslation();
  const nav = "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold";
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="font-bold text-ink">{p.name}</span>
          {p.address && <span className="text-sm text-muted">{p.address}</span>}
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {layer && <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted">{layerLabel(layer, t)}</span>}
          {p.kosherMeta?.dietary && <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary-ink">{t(DIETARY_KEY[p.kosherMeta.dietary] ?? "")}</span>}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={`${nav} bg-primary text-on-primary`} href={googleMapsUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">
          {t("places.googleMaps")}
        </a>
        <a className={`${nav} border border-line text-ink`} href={wazeUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">
          {t("places.waze")}
        </a>
      </div>
      {p.attribution && <span className="text-[11px] text-faint" dir="ltr">{p.attribution}</span>}
    </li>
  );
}
