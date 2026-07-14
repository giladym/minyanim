import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import type { MyEventRow } from "@minyanim/shared";
import { useStayEvents } from "../../lib/stays";
import { Icon, type IconName } from "../../components/Icon";

/** The user-facing kind for an event row (minyan / hosting / social) + its badge chrome. Mirrors
 * `MyEvents` so a location's events read the same as the global "my events" list. */
function kindOf(row: MyEventRow): { kind: "minyan" | "hosting" | "social"; label: string; icon: IconName; chip: string } {
  if (row.type === "minyan") return { kind: "minyan", label: "eventKind.minyan", icon: "star-of-david", chip: "bg-primary-soft text-primary-ink" };
  if (row.category === "hosting") return { kind: "hosting", label: "eventKind.hostingChip", icon: "utensils", chip: "bg-clay-soft text-clay-ink" };
  return { kind: "social", label: "eventKind.social", icon: "sparkles", chip: "bg-sky-soft text-sky-ink" };
}

/** One event row on the location edit page — tapping it opens the event's own page
 * (`/minyan/$id` for a minyan, `/event/$id` for a gathering). */
function EventRow({ row }: { row: MyEventRow }) {
  const { t, i18n } = useTranslation();
  const k = kindOf(row);
  const to = k.kind === "minyan" ? "/minyan/$id" : "/event/$id";
  const dateLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en-GB" : "he-IL", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(row.eventDate));
  const statusKey = row.myStatus ? `attendanceStatus.${row.myStatus}` : row.type === "minyan" ? `minyanStatus.${row.status}` : `gatheringStatus.${row.status}`;
  const title = row.title ?? `${row.city}, ${row.country}`;

  return (
    <li>
      <Link to={to} params={{ id: row.id }} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${k.chip}`}>
            <Icon name={k.icon} size={18} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-bold text-ink">{title}</span>
            <span className="text-xs text-muted">{t(k.label)} · {dateLabel}</span>
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-chip px-2.5 py-0.5 text-xs font-bold text-muted">{t(statusKey)}</span>
      </Link>
    </li>
  );
}

/**
 * "האירועים שלי כאן" — the events attached to a saved location (015, Option B). Lists the location's
 * events via `useStayEvents`; a "＋ הוסף אירוע" button routes into the SHIPPED event flow (the kind
 * picker, prefilled with `fromStay` so the created event attaches back to this location). Empty until
 * the first event is added — or until the backend endpoint lands (fails gracefully to empty).
 */
export function StayEventsSection({ stayId }: { stayId: string }) {
  const { t } = useTranslation();
  const { data: events } = useStayEvents(stayId);
  const rows = events ?? [];

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-faint">{t("stays.events.title")}</h2>
        <Link
          to="/event/new"
          search={{ fromStay: stayId }}
          className="shrink-0 rounded-xl border border-primary-container px-3.5 py-2 text-sm font-bold text-primary"
        >
          {t("stays.events.add")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted">{t("stays.events.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">{rows.map((r) => <EventRow key={r.id} row={r} />)}</ul>
      )}
    </section>
  );
}

/** A compact "N אירועים" indicator for the Stay card (015) — lets a location's events "leak" to the
 * dashboard. Renders nothing when the location has no events (or the endpoint isn't live yet). */
export function StayEventsChip({ stayId }: { stayId: string }) {
  const { t } = useTranslation();
  const { data: events } = useStayEvents(stayId);
  const count = events?.length ?? 0;
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary-ink">
      <Icon name="calendar" size={13} />
      {t("stays.events.count", { count })}
    </span>
  );
}
