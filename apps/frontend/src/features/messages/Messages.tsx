import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ApiError } from "../../lib/api";
import { useConversations, useThread, useSendMessage } from "../../lib/messages";
import { Avatar } from "../media/Avatar";

/** Locale-aware short timestamp: time for today, otherwise a short date. */
function useShortTime() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-GB" : "he-IL";
  return (epoch: number) => {
    const d = new Date(epoch);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return new Intl.DateTimeFormat(locale, sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(d);
  };
}

/** Conversations inbox (008): one row per correspondent, newest activity first, unread badged. */
export function MessagesPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useConversations();
  const fmt = useShortTime();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6" dir="rtl">
      <h1 className="font-display text-2xl font-extrabold text-ink">{t("messages.title")}</h1>

      {isLoading && <p className="text-sm text-muted">{t("discovery.loading")}</p>}
      {data && data.conversations.length === 0 && <p className="text-sm text-muted">{t("messages.empty")}</p>}

      <ul className="flex flex-col gap-2">
        {data?.conversations.map((c) => (
          <li key={c.userId}>
            <Link
              to="/messages/$userId"
              params={{ userId: c.userId }}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4"
            >
              <Avatar src={c.image} name={c.name || t("messages.unknownUser")} size={40} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold text-ink">{c.name || t("messages.unknownUser")}</span>
                  <span className="shrink-0 text-xs text-faint">{fmt(c.lastAt)}</span>
                </span>
                <span className="truncate text-sm text-muted">{c.lastBody}</span>
              </span>
              {c.unread > 0 && (
                <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-on-primary">
                  {c.unread > 9 ? "9+" : c.unread}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A single conversation thread + composer. Opening it marks received messages read (server-side). */
export function MessageThreadPage() {
  const { t } = useTranslation();
  const { userId } = useParams({ from: "/authed/messages/$userId" });
  const { data, isLoading } = useThread(userId);
  const send = useSendMessage(userId);
  const fmt = useShortTime();
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as the thread grows / on send.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setErr("");
    try {
      await send.mutateAsync(text);
      setBody("");
    } catch (e2) {
      setErr(
        e2 instanceof ApiError && e2.body.errors[0]?.code ? t(`errors.${e2.body.errors[0].code}`) : t("auth.error"),
      );
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-xl flex-col p-4 md:p-6" dir="rtl">
      <div className="mb-3 flex items-center gap-2">
        <Link to="/messages" className="text-sm font-bold text-clay-ink">{t("messages.back")}</Link>
        {data && <Avatar src={data.image} name={data.name} size={32} />}
        <h1 className="font-display text-lg font-extrabold text-ink">{data?.name || t("messages.title")}</h1>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-line bg-surface p-4">
        {isLoading && <p className="text-sm text-muted">{t("discovery.loading")}</p>}
        {data && data.messages.length === 0 && <p className="m-auto text-sm text-muted">{t("messages.threadEmpty")}</p>}
        {data?.messages.map((m) => (
          <div key={m.id} className={"flex flex-col " + (m.mine ? "items-start" : "items-end")}>
            <span
              className={
                "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm " +
                (m.mine ? "bg-primary text-on-primary" : "bg-chip text-ink")
              }
            >
              {m.body}
            </span>
            <span className="mt-0.5 text-[11px] text-faint">{fmt(m.createdAt)}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-line2 bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-primary"
          rows={1}
          value={body}
          aria-label={t("messages.composePlaceholder")}
          placeholder={t("messages.composePlaceholder")}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="submit"
          disabled={send.isPending || !body.trim()}
          className="rounded-xl bg-primary px-5 py-2.5 font-extrabold text-on-primary disabled:opacity-50"
        >
          {t("messages.send")}
        </button>
      </form>
      {err && <p role="alert" className="mt-1 text-sm font-semibold text-clay-ink">{err}</p>}
    </div>
  );
}
