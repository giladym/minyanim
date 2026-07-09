import { useTranslation } from "react-i18next";
import type { ModerationQueueEntryDTO } from "@minyanim/shared";
import { useModerationQueue, useContentAction, useSanctionUser } from "../../lib/moderation";

/** A short recognizer + flag summary for one queue entry. */
function EntrySummary({ e }: { e: ModerationQueueEntryDTO }) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-2">
        <span className="truncate font-bold text-ink">
          {e.content.city}, <span dir="ltr">{e.content.country}</span>
        </span>
        <span className="shrink-0 rounded-md bg-chip px-2 py-0.5 text-xs font-bold text-muted">
          {t(`moderation.contentType.${e.contentType}`)}
        </span>
        {e.hidden && (
          <span className="shrink-0 rounded-md bg-clay-soft px-2 py-0.5 text-xs font-bold text-clay-ink">
            {t("moderation.hiddenBadge")}
          </span>
        )}
      </span>
      <span className="text-xs text-muted">
        {t("moderation.reporterCount", { count: e.reporterCount })}
        {" · "}
        {e.reasons.map((r) => t(`moderation.reason.${r}`)).join(", ")}
      </span>
    </span>
  );
}

/**
 * Moderation queue (006 US3): flagged/hidden content aggregated per item, auto-hidden first. An admin
 * restores (dismiss) or removes content, and warns/suspends/bans the content owner. Content actions
 * and sanctions are independent — hiding content never auto-sanctions the owner (SC-002).
 */
export function ModerationQueue() {
  const { t } = useTranslation();
  const queue = useModerationQueue();
  const contentAction = useContentAction();
  const sanction = useSanctionUser();
  const busy = contentAction.isPending || sanction.isPending;

  if (queue.isLoading) return <p className="text-sm text-muted">{t("discovery.loading")}</p>;
  if (queue.isError) return <p role="alert" className="text-sm font-semibold text-clay-ink">{t("auth.error")}</p>;
  const entries = queue.data?.entries ?? [];
  if (entries.length === 0) return <p className="text-sm text-muted">{t("moderation.empty")}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((e) => (
        <li key={`${e.contentType}:${e.contentId}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <EntrySummary e={e} />

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-xs font-bold uppercase tracking-wide text-faint">{t("moderation.contentActions")}</span>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-primary-ink disabled:opacity-50"
              onClick={() => void contentAction.mutate({ contentType: e.contentType, contentId: e.contentId, action: "dismiss" })}
            >
              {t("moderation.dismiss")}
            </button>
            <button
              type="button"
              disabled={busy || e.hidden}
              className="rounded-lg px-3 py-1.5 text-sm font-bold text-clay-ink disabled:opacity-50"
              onClick={() => void contentAction.mutate({ contentType: e.contentType, contentId: e.contentId, action: "remove" })}
            >
              {t("moderation.remove")}
            </button>
          </div>

          {e.reportedUserId && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-faint">{t("moderation.ownerActions")}</span>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-muted disabled:opacity-50"
                onClick={() => void sanction.mutate({ userId: e.reportedUserId!, action: "warn" })}
              >
                {t("moderation.warn")}
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-muted disabled:opacity-50"
                onClick={() => void sanction.mutate({ userId: e.reportedUserId!, action: "suspend", suspendDays: 7 })}
              >
                {t("moderation.suspend7")}
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-sm font-bold text-clay-ink disabled:opacity-50"
                onClick={() => {
                  if (confirm(t("moderation.confirmBan"))) sanction.mutate({ userId: e.reportedUserId!, action: "ban" });
                }}
              >
                {t("moderation.ban")}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
