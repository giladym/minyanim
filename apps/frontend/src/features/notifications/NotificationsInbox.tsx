import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useNotifications, useMarkAllRead, useMarkRead } from "../../lib/notifications";

/** In-app notifications inbox (US5). Lists quorum/cancellation events newest-first, each linking to
 * the Minyan; supports mark-one and mark-all read. Email is sent server-side (not shown here). */
export function NotificationsInbox() {
  const { t } = useTranslation();
  const { data, isLoading } = useNotifications();
  const markAll = useMarkAllRead();
  const markOne = useMarkRead();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">{t("notifications.title")}</h1>
        {data && data.unread > 0 && (
          <button type="button" className="text-sm font-bold text-clay" onClick={() => markAll.mutate()}>
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted">{t("discovery.loading")}</p>}
      {data && data.notifications.length === 0 && <p className="text-sm text-muted">{t("notifications.empty")}</p>}

      <ul className="flex flex-col gap-2">
        {data?.notifications.map((n) => (
          <li key={n.id}>
            <Link
              to="/minyan/$id"
              params={{ id: n.eventId }}
              onClick={() => !n.read && markOne.mutate(n.id)}
              className={
                "block rounded-xl border border-line p-4 " + (n.read ? "bg-surface" : "bg-chip")
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">{t(`notifications.kind.${n.kind}`)}</span>
                {!n.read && <span className="h-2 w-2 rounded-full bg-clay" aria-label={t("notifications.unread")} />}
              </div>
              <span className="text-sm text-muted">{n.city}, {n.country}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
