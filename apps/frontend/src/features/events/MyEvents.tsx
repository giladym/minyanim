import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import type { MyEventRow } from "@minyanim/shared";
import { useMyEvents } from "../../lib/events";
import { Icon, type IconName } from "../../components/Icon";

// Contract types (MyEventsDTO/MyEventRow) are exported by @minyanim/shared; this screen reads them
// directly. GET /api/me/events may 404 until the backend ships it — the query fails silently and the
// screen renders its empty state (no crash).

/** The user-facing kind for a row (minyan / hosting / social) + its badge chrome. */
function kindOf(row: MyEventRow): { kind: "minyan" | "hosting" | "social"; label: string; icon: IconName; chip: string } {
  if (row.type === "minyan") return { kind: "minyan", label: "eventKind.minyan", icon: "star-of-david", chip: "bg-primary-soft text-primary-ink" };
  if (row.category === "hosting") return { kind: "hosting", label: "eventKind.hostingChip", icon: "utensils", chip: "bg-clay-soft text-clay-ink" };
  return { kind: "social", label: "eventKind.social", icon: "sparkles", chip: "bg-sky-soft text-sky-ink" };
}

function Row({ row }: { row: MyEventRow }) {
  const { t, i18n } = useTranslation();
  const k = kindOf(row);
  const to = k.kind === "minyan" ? "/minyan/$id" : "/event/$id";
  const dateLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en-GB" : "he-IL", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(row.eventDate));
  const statusKey = row.myStatus ? `attendanceStatus.${row.myStatus}` : row.type === "minyan" ? `minyanStatus.${row.status}` : `gatheringStatus.${row.status}`;
  const title = row.title ?? `${row.city}, ${row.country}`;

  return (
    <li>
      <Link to={to} params={{ id: row.id }} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
        <span className="flex min-w-0 items-center gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${k.chip}`}>
            <Icon name={k.icon} size={18} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-bold text-ink">{title}</span>
            <span className="text-xs text-muted">{t(k.label)} · {dateLabel}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-chip px-2.5 py-0.5 text-xs font-bold text-muted">{t(statusKey)}</span>
          {row.pendingRequestCount != null && row.pendingRequestCount > 0 && (
            <span className="rounded-full bg-clay-soft px-2.5 py-0.5 text-xs font-bold text-clay-ink">
              {t("myEvents.pendingBadge", { count: row.pendingRequestCount })}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/** האירועים שלי / My events (014, T031a — Screen 7). The host's path back to the requests queue and
 * the guest's path to their pending/confirmed events. Data: GET /api/me/events. */
export function MyEvents() {
  const { t } = useTranslation();
  const { data, isLoading } = useMyEvents();

  if (isLoading) return <p className="py-20 text-center text-muted" dir="rtl">{t("myEvents.loading")}</p>;

  const hosting = data?.hosting ?? [];
  const attending = data?.attending ?? [];
  const empty = hosting.length === 0 && attending.length === 0;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6" dir="rtl">
      <h1 className="text-2xl font-extrabold text-ink">{t("myEvents.title")}</h1>
      {empty ? (
        <p className="py-12 text-center text-muted">{t("myEvents.empty")}</p>
      ) : (
        <>
          {hosting.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-faint">{t("myEvents.hosting")}</h2>
              <ul className="flex flex-col gap-3">{hosting.map((r) => <Row key={r.id} row={r} />)}</ul>
            </section>
          )}
          {attending.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-faint">{t("myEvents.attending")}</h2>
              <ul className="flex flex-col gap-3">{attending.map((r) => <Row key={r.id} row={r} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
