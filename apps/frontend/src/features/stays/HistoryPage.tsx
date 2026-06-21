import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import type { OwnerStayDTO } from "@minyanim/shared";
import { useStaysInfinite } from "../../lib/stays";

/** Format a stored UTC-midnight epoch as a localized civil date (no time-of-day). */
function formatDate(epoch: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(epoch));
}

/** Group consecutive Stays (already newest-first) by departure-year, preserving order. */
function groupByYear(stays: OwnerStayDTO[]): Array<{ year: number; stays: OwnerStayDTO[] }> {
  const groups: Array<{ year: number; stays: OwnerStayDTO[] }> = [];
  for (const s of stays) {
    const year = new Date(s.departureDate).getUTCFullYear();
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.stays.push(s);
    else groups.push({ year, stays: [s] });
  }
  return groups;
}

/**
 * History view (004 US2, FR-005/SC-005/SC-007): past (attended) + cancelled Stays, newest-first,
 * grouped by year, with cursor-paginated infinite scroll (a keyboard-operable "load more" button).
 * Owner-only; RTL, i18n strings, tokens-only colors, `aria-live` on the growing list.
 */
export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "he";
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useStaysInfinite();

  const stays = useMemo(() => data?.pages.flatMap((p) => p.stays) ?? [], [data]);
  const groups = useMemo(() => groupByYear(stays), [stays]);

  if (isLoading) return <p className="py-20 text-center text-muted">{t("history.loading")}</p>;
  if (isError)
    return <p role="alert" className="py-20 text-center text-clay-ink">{t("history.loadError")}</p>;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">{t("history.title")}</h1>
        <Link to="/stays" className="text-sm font-bold text-clay">
          {t("history.backToActive")}
        </Link>
      </div>

      {stays.length === 0 ? (
        <p className="py-16 text-center text-muted">{t("history.empty")}</p>
      ) : (
        <div className="flex flex-col gap-6" aria-live="polite">
          {groups.map((g) => (
            <section key={g.year} className="flex flex-col gap-3">
              <h2 className="text-sm font-extrabold text-muted">{g.year}</h2>
              <ul className="flex flex-col gap-3">
                {g.stays.map((s) => (
                  <li key={s.id}>
                    <HistoryStayCard stay={s} locale={locale} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {hasNextPage && (
        <button
          type="button"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
          className="mx-auto rounded-[14px] border border-line px-6 py-3 font-bold text-clay disabled:opacity-60"
        >
          {isFetchingNextPage ? t("history.loading") : t("history.loadMore")}
        </button>
      )}
    </div>
  );
}

/** A single History Stay row: location, dates, and an attended/cancelled tag. */
function HistoryStayCard({ stay, locale }: { stay: OwnerStayDTO; locale: string }) {
  const { t } = useTranslation();
  const cancelled = stay.historyTag === "cancelled";
  return (
    <article data-testid="history-card" data-stay-id={stay.id} className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-ink">
            {stay.city}, {stay.country}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {formatDate(stay.arrivalDate, locale)} – {formatDate(stay.departureDate, locale)}
          </p>
        </div>
        <span
          className={
            "rounded-full px-2.5 py-1 text-xs font-bold " +
            (cancelled ? "bg-chip text-faint" : "bg-teal-soft text-teal-ink")
          }
        >
          {cancelled ? t("history.cancelled") : t("history.attended")}
        </span>
      </div>
    </article>
  );
}
