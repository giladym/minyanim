import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LayerDTO, PlaceDTO } from "@minyanim/shared";
import { usePlaces } from "../../lib/places";
import { LocationPicker, type LocationValue } from "../stays/LocationPicker";
import { PlacesMap } from "./PlacesMap";
import { googleMapsUrl, wazeUrl } from "./navLinks";

/** Read optional lat/lng from the URL (entry from a Stay) without needing router context (testable). */
function coordsFromUrl(): { lat: number; lng: number } | null {
  const q = new URLSearchParams(window.location.search);
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  return q.get("lat") && q.get("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Kosher/Jewish places near a location (010 US1): layer toggles + clustered map + an accessible list
 * (the source of truth) with one-tap Google Maps / Waze navigation per place. */
export function PlacesView() {
  const { t } = useTranslation();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(coordsFromUrl);
  const [picker, setPicker] = useState<LocationValue>({ city: "", country: "", lat: null, lng: null });
  const { data, isLoading } = usePlaces(coords?.lat ?? null, coords?.lng ?? null);
  const [off, setOff] = useState<Set<string>>(new Set()); // retired-from-view layer ids (toggles)

  const layers = data?.layers ?? [];
  const visible = useMemo(
    () => (data?.places ?? []).filter((p) => !off.has(p.layerId)),
    [data?.places, off],
  );

  // No location yet → let the user pick one (also the coordless-Stay fallback).
  if (!coords) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6" dir="rtl">
        <h1 className="font-display text-2xl font-extrabold text-ink">{t("places.title")}</h1>
        <p className="text-sm text-muted">{t("places.pickLocation")}</p>
        <LocationPicker
          value={picker}
          onChange={(v) => {
            setPicker(v);
            if (v.lat != null && v.lng != null) setCoords({ lat: v.lat, lng: v.lng });
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6" dir="rtl">
      <h1 className="font-display text-2xl font-extrabold text-ink">{t("places.title")}</h1>

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
                {l.name}
              </button>
            );
          })}
        </div>
      )}

      <PlacesMap places={visible} center={coords} />

      {isLoading && <p className="text-sm text-muted">{t("discovery.loading")}</p>}
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
          {layer && <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-faint">{layer.name}</span>}
          {p.kosherMeta?.dietary && <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary-ink">{t(DIETARY_KEY[p.kosherMeta.dietary] ?? "")}</span>}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={`${nav} bg-primary text-on-primary`} href={googleMapsUrl(p.lat, p.lng, p.name)} target="_blank" rel="noopener noreferrer">
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
