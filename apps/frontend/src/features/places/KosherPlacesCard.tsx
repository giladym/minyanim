import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Icon } from "../../components/Icon";
import { usePlaces } from "../../lib/places";
import { layerLabel } from "../../lib/layerLabel";

/**
 * Compact "kosher places nearby" entry point (010 follow-up). Shows — as a plain, non-interactive
 * summary — which kinds of Jewish/kosher places ACTUALLY exist near a location (with counts), then a
 * button that opens the full {@link PlacesView} map prefilled there. Reused from Discovery, a Stay,
 * and a Minyan. Renders nothing when there is no location to anchor to.
 *
 * Only layers with ≥1 nearby place are listed (not every active layer). When only a city name is
 * known (no coordinates) the nearby lookup can't run, so just the title + button show — the map then
 * geocodes the city on open.
 *
 * @param lat/lng Anchor coordinates (fuzzed city-level is fine); null when only a city is known.
 * @param city/country Human label + the fallback the places view geocodes when coords are absent.
 */
export function KosherPlacesCard({
  lat,
  lng,
  city,
  country,
}: {
  lat: number | null;
  lng: number | null;
  city?: string;
  country?: string;
}) {
  const { t } = useTranslation();
  const { data } = usePlaces(lat, lng); // disabled (no fetch) when lat/lng are null

  // The layers that genuinely have places nearby, each with its count — not the full active set.
  const present = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data?.places ?? []) counts.set(p.layerId, (counts.get(p.layerId) ?? 0) + 1);
    return (data?.layers ?? [])
      .filter((l) => counts.has(l.id))
      .map((l) => ({ ...l, count: counts.get(l.id)! }));
  }, [data]);

  // Nothing to anchor to → don't render.
  if (lat == null && lng == null && !city) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-display text-lg font-extrabold text-ink">
        <Icon name="map-pin" size={18} className="text-primary" aria-hidden />
        {t("places.nearbyTitle")}
        {city && <span className="text-sm font-semibold text-muted">· {city}</span>}
      </h2>

      {present.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {present.map((l) => (
            <li key={l.id} className="inline-flex items-center gap-1.5 text-sm text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary/70" aria-hidden />
              {layerLabel(l, t)}
              <span className="text-xs font-bold text-faint">{l.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("places.nearbyHint")}</p>
      )}

      <Link
        to="/places"
        search={{ lat: lat ?? undefined, lng: lng ?? undefined, city, country }}
        className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-on-primary"
      >
        {t("places.openMap")}
        <Icon name="chevron-start" size={16} aria-hidden />
      </Link>
    </section>
  );
}
