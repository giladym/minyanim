import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import type { FolderDTO, OwnerStayDTO } from "@minyanim/shared";

/** Format a stored UTC-midnight epoch as a localized civil date (no time-of-day). */
function formatDate(epoch: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(epoch));
}

/**
 * A single Stay summary card: city/country, date range, men count, Sefer Torah badge. Past
 * stays (derived isPast) are visually de-emphasized. Highlighted briefly after create/edit.
 *
 * @param stay The owner Stay to render.
 * @param highlighted Whether to draw the just-saved highlight ring.
 * @param onCancel Invoked when the user confirms cancellation.
 */
export function StayCard({
  stay,
  highlighted,
  onCancel,
  onMove,
  folders,
  nearbyMinyanim,
}: {
  stay: OwnerStayDTO;
  highlighted: boolean;
  onCancel: (id: string) => void;
  /** Reassign this Stay to a folder, or to Unfiled when null (D6). */
  onMove?: (folderId: string | null) => void;
  /** The caller's folders, for the move-to-folder control. */
  folders?: FolderDTO[];
  /** Count of hosted minyanim near this stay (FR-019); undefined while loading. */
  nearbyMinyanim?: number;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "he";

  return (
    <article
      data-testid="stay-card"
      data-stay-id={stay.id}
      className={
        "rounded-2xl border bg-surface p-5 transition " +
        (highlighted ? "border-clay ring-2 ring-clay " : "border-line ") +
        (stay.isPast ? "opacity-60" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink">
            {stay.city}, {stay.country}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {formatDate(stay.arrivalDate, locale)} – {formatDate(stay.departureDate, locale)}
          </p>
        </div>
        {stay.isPast && (
          <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-faint">
            {t("stays.past")}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-teal-soft px-2.5 py-1 text-xs font-bold text-teal-ink">
          {t("stays.men", { count: stay.numMen })}
        </span>
        {stay.bringsSeferTorah && (
          <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-bold text-gold">
            {t("stays.seferTorah")}
          </span>
        )}
      </div>

      {!stay.isPast && (
        <Link
          to="/discovery"
          search={{ lat: stay.lat ?? undefined, lng: stay.lng ?? undefined, city: stay.city, country: stay.country, from: stay.arrivalDate, to: stay.departureDate }}
          className="mt-3 block text-sm font-bold text-clay"
        >
          {nearbyMinyanim && nearbyMinyanim > 0
            ? t("stays.nearbyMinyanim", { count: nearbyMinyanim })
            : t("stays.findMinyanim")}
        </Link>
      )}

      {!stay.isPast && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            to="/stays/$id/edit"
            params={{ id: stay.id }}
            className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink"
          >
            {t("stays.edit")}
          </Link>
          <button
            type="button"
            className="rounded-lg border border-clay-ink px-4 py-2 text-sm font-bold text-clay-ink"
            onClick={() => onCancel(stay.id)}
          >
            {t("stays.cancelStay")}
          </button>
          {onMove && folders && folders.length > 0 && (
            <label className="ms-auto flex items-center gap-2 text-sm text-muted">
              <span>{t("folders.moveTo")}</span>
              <select
                className="rounded-lg border border-line bg-surface px-2.5 py-2 text-sm font-bold text-ink"
                aria-label={t("folders.moveTo")}
                value={stay.folderId ?? ""}
                onChange={(e) => onMove(e.target.value || null)}
              >
                <option value="">{t("folders.unfiled")}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </article>
  );
}
