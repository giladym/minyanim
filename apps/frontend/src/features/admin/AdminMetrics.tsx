import { useTranslation } from "react-i18next";
import type { AdminMetricsDTO } from "@minyanim/shared";
import { useAdminMetrics } from "../../lib/metrics";

/** One labelled number. `accent` renders the north-star (quorum) with primary emphasis. */
function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={"flex flex-col gap-1 rounded-xl p-3.5 " + (accent ? "bg-primary text-on-primary" : "border border-line bg-surface")}>
      <span className={"font-display text-2xl font-extrabold " + (accent ? "text-on-primary" : "text-ink")}>{value}</span>
      <span className={"text-sm " + (accent ? "text-on-primary" : "text-muted")}>{label}</span>
    </div>
  );
}

/** A titled group of stats. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-faint">{title}</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{children}</div>
    </section>
  );
}

/**
 * Admin metrics dashboard (006 US5): current counts + the product funnel (potential travelers →
 * hosted minyanim → reached quorum, the SC-001 north-star) + busiest locations. Read-only view.
 */
export function AdminMetrics() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAdminMetrics();

  if (isLoading) return <p className="text-sm text-muted">{t("discovery.loading")}</p>;
  if (isError || !data) return <p role="alert" className="text-sm font-semibold text-clay-ink">{t("auth.error")}</p>;
  const m: AdminMetricsDTO = data;

  return (
    <div className="flex flex-col gap-6">
      <Group title={t("metrics.funnel")}>
        <Stat label={t("metrics.potential")} value={m.funnel.potential} />
        <Stat label={t("metrics.hosted")} value={m.funnel.hosted} />
        <Stat label={t("metrics.quorum")} value={m.funnel.quorum} accent />
      </Group>

      <Group title={t("metrics.users")}>
        <Stat label={t("metrics.total")} value={m.users.total} />
        <Stat label={t("metrics.admins")} value={m.users.admins} />
        <Stat label={t("metrics.suspended")} value={m.users.suspended} />
        <Stat label={t("metrics.banned")} value={m.users.banned} />
      </Group>

      <Group title={t("metrics.stays")}>
        <Stat label={t("metrics.total")} value={m.stays.total} />
        <Stat label={t("metrics.active")} value={m.stays.active} />
        <Stat label={t("metrics.hidden")} value={m.stays.hidden} />
      </Group>

      <Group title={t("metrics.minyanim")}>
        <Stat label={t("metrics.total")} value={m.minyanim.total} />
        <Stat label={t("metrics.forming")} value={m.minyanim.forming} />
        <Stat label={t("metrics.ready")} value={m.minyanim.ready} />
        <Stat label={t("metrics.cancelled")} value={m.minyanim.cancelled} />
        <Stat label={t("metrics.hidden")} value={m.minyanim.hidden} />
      </Group>

      <Group title={t("metrics.moderation")}>
        <Stat label={t("metrics.openFlags")} value={m.moderation.openFlags} />
        <Stat label={t("metrics.autoHidden")} value={m.moderation.autoHidden} />
      </Group>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-faint">{t("metrics.topLocations")}</h2>
        {m.topLocations.length === 0 ? (
          <p className="text-sm text-muted">{t("metrics.noLocations")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {m.topLocations.map((l) => (
              <li key={`${l.city}:${l.country}`} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3.5">
                <span className="font-bold text-ink">{l.city}, <span dir="ltr">{l.country}</span></span>
                <span className="rounded-md bg-chip px-2 py-0.5 text-sm font-bold text-muted">{l.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
