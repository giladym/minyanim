import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Icon } from "../../components/Icon";
import { useLayers } from "../../lib/places";

/**
 * Compact "kosher places nearby" entry point (010 follow-up). Shows the active place-layer chips and
 * a button that opens the full {@link PlacesView} map PREFILLED to a location — so from Discovery, a
 * Stay, or a Minyan the user reaches kosher food / synagogues / cemeteries near that spot in one tap,
 * without re-picking where they are. Renders nothing when there is no location to anchor to.
 *
 * @param lat/lng Anchor coordinates (fuzzed city-level is fine); null when only a city name is known.
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
  const { data } = useLayers();
  const layers = data?.layers ?? [];

  // Nothing to anchor to → don't render (a coordless, city-less stay can't seed the places view).
  if (lat == null && lng == null && !city) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-ink">
        <Icon name="map-pin" size={18} className="text-primary" aria-hidden />
        {t("places.nearbyTitle")}
        {city && <span className="text-sm font-semibold text-muted">· {city}</span>}
      </h2>

      {layers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {layers.map((l) => (
            <span key={l.id} className="rounded-full bg-chip px-3 py-1.5 text-sm font-bold text-muted">
              {l.name}
            </span>
          ))}
        </div>
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
