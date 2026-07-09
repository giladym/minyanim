import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import type { OwnerStayDTO } from "@minyanim/shared";
import { useStaysInfinite, usePermanentDeleteStay } from "../../lib/stays";

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
  const permaDelete = usePermanentDeleteStay();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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
                    <HistoryStayCard stay={s} locale={locale} onDelete={() => setConfirmingId(s.id)} />
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

      {confirmingId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("history.deleteTitle")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-2 text-lg font-extrabold text-clay-ink">{t("history.deleteTitle")}</h2>
            <p className="mb-4 text-sm text-muted">{t("history.deleteWarn")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-clay-ink px-4 py-2 text-sm font-extrabold text-on-clay"
                onClick={() => {
                  permaDelete.mutate(confirmingId);
                  setConfirmingId(null);
                }}
              >
                {t("history.deleteConfirm")}
              </button>
              <button
                type="button"
                className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink"
                onClick={() => setConfirmingId(null)}
              >
                {t("folders.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A single History Stay row: location, dates, an attended/cancelled tag, and actions (duplicate;
 * permanent-delete for cancelled stays only — D8/D9). */
function HistoryStayCard({
  stay,
  locale,
  onDelete,
}: {
  stay: OwnerStayDTO;
  locale: string;
  onDelete: () => void;
}) {
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
            (cancelled ? "bg-chip text-muted" : "bg-teal-soft text-teal-ink")
          }
        >
          {cancelled ? t("history.cancelled") : t("history.attended")}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          to="/stays/new"
          search={{ from: stay.id }}
          className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink"
        >
          {t("history.duplicate")}
        </Link>
        {cancelled && (
          <button
            type="button"
            className="rounded-lg border border-clay-ink px-4 py-2 text-sm font-bold text-clay-ink"
            onClick={onDelete}
          >
            {t("history.deletePermanently")}
          </button>
        )}
      </div>
    </article>
  );
}
