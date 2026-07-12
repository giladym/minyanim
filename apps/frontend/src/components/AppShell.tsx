import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "../theme/ThemeProvider";
import { getProfile, patchProfile } from "../lib/profile";
import { authClient } from "../lib/auth-client";
import { RouteAnnouncer } from "./RouteAnnouncer";
import { Icon } from "./Icon";
import { HeaderCalendar } from "../features/header-calendar/HeaderCalendar";
import { useNotifications } from "../lib/notifications";
import { useConversations } from "../lib/messages";
import { useMyEvents } from "../lib/events";
import { useAdminMe } from "../lib/places";
import { PHONE_NUDGE_KEY } from "../lib/onboarding";

// Finding a minyan is the app's primary action — it's the center FAB, not a side tab. The four
// side tabs flank it: locations · history | FAB | notifications · profile. Adding a location is a
// secondary action that lives on the My-Locations dashboard CTA.
const NAV = [
  { href: "/stays", key: "nav.stays" },
  { href: "/stays/history", key: "nav.history" },
  { href: "/notifications", key: "nav.notifications" },
  { href: "/profile", key: "nav.profile" },
];

/** Authenticated app shell: RTL header (logo, calendar slot, theme/lang, avatar) + bottom nav. */
export function AppShell() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const unread = useNotifications().data?.unread ?? 0;
  const msgUnread = useConversations().data?.unread ?? 0;
  // Host re-engagement (014, FR-017): fold pending seat-requests into the header envelope so a host
  // is nudged even if they never open "My events".
  const pendingReqs = (useMyEvents().data?.hosting ?? []).reduce((n, r) => n + (r.pendingRequestCount ?? 0), 0);
  const envelopeCount = msgUnread + pendingReqs;
  const isAdmin = useAdminMe().data?.isAdmin ?? false;
  const initial = (session?.user?.name || session?.user?.email || "").trim().charAt(0).toUpperCase() || "•";

  // A manual theme/lang change must win over a late-arriving profile sync, otherwise the
  // async hydration below can clobber a choice the user just made (race).
  const touched = useRef(false);

  // Cross-device sync: hydrate language + theme from the saved profile (US3 / FR-004/FR-009).
  // Skip if the user has already interacted this session.
  useEffect(() => {
    getProfile()
      .then((p) => {
        if (!touched.current) {
          setTheme(p.theme as Theme);
          if (p.language !== i18n.resolvedLanguage) void i18n.changeLanguage(p.language);
        }
        // Soft onboarding: after a real sign-in/register (flag set by the auth screens), a user with
        // no phone can't be reached by hosts/travelers — nudge them to /profile once. Consume the
        // flag whether or not we redirect, so it's strictly one-shot and never a hard gate.
        if (sessionStorage.getItem(PHONE_NUDGE_KEY)) {
          sessionStorage.removeItem(PHONE_NUDGE_KEY);
          if (p.phones.length === 0 && window.location.pathname !== "/profile") {
            void navigate({ to: "/profile", search: { onboarding: "phone" } });
          }
        }
      })
      .catch(() => {});
  }, []);

  function toggleTheme() {
    touched.current = true;
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    void patchProfile({ theme: next }).catch(() => {});
  }
  function toggleLang() {
    touched.current = true;
    const next = i18n.resolvedLanguage === "he" ? "en" : "he";
    void i18n.changeLanguage(next);
    void patchProfile({ language: next }).catch(() => {});
  }

  const pill = "rounded-full border border-line px-3 py-1.5 text-xs font-bold text-muted";
  const isDark =
    theme === "dark" ||
    (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="min-h-screen bg-bg font-sans text-ink">
      <a href="#main" className="sr-only rounded-lg bg-clay px-4 py-2 font-bold text-on-clay focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-50">
        {t("a11y.skipToContent")}
      </a>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line2 bg-header px-4 py-3 md:px-8">
        <a href="/stays" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-clay text-lg font-extrabold text-on-clay">J</span>
          <span className="text-xl font-extrabold">{t("app.name")}</span>
        </a>
        <HeaderCalendar />
        <div className="flex items-center gap-2">
          {isAdmin && <a href="/admin" className={pill}>{t("admin.nav")}</a>}
          <button className={pill} onClick={toggleTheme} aria-label={t("theme.toggle")}>
            <Icon name={isDark ? "sun" : "moon"} size={18} aria-hidden />
          </button>
          <button className={pill} onClick={toggleLang}>{i18n.resolvedLanguage === "he" ? "EN" : "עב"}</button>
          <a href="/messages" aria-label={t("messages.title")} className="relative flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {envelopeCount > 0 && (
              <span className="absolute -top-1 -end-1 min-w-[16px] rounded-full bg-primary px-1 text-center text-[10px] font-bold text-on-primary" aria-hidden>
                {envelopeCount > 9 ? "9+" : envelopeCount}
              </span>
            )}
          </a>
          <a href="/profile" aria-label={t("a11y.myProfile")} className="flex h-8 w-8 items-center justify-center rounded-full bg-teal font-bold text-on-teal">
            {initial}
          </a>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 pb-24 pt-4 md:px-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line bg-surface px-2 pb-5 pt-2">
        {NAV.slice(0, 2).map((n) => (
          <NavItem key={n.href} href={n.href} label={t(n.key)} active={path === n.href} />
        ))}
        <a href="/discovery" aria-label={t("nav.searchMinyan")} className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-clay text-on-clay shadow-lg">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
        </a>
        {NAV.slice(2).map((n) => (
          <NavItem key={n.href} href={n.href} label={t(n.key)} active={path === n.href} badge={n.href === "/notifications" ? unread : 0} />
        ))}
      </nav>

      <RouteAnnouncer />
    </div>
  );
}

function NavItem({ href, label, active, badge = 0 }: { href: string; label: string; active: boolean; badge?: number }) {
  return (
    <a href={href} className={"relative flex w-16 flex-col items-center gap-1 text-[11px] font-bold " + (active ? "text-clay" : "text-faint")}>
      <span className={"h-4 w-4 rounded-full border-2 " + (active ? "border-clay" : "border-faint")} />
      {badge > 0 && (
        <span className="absolute -top-1 end-3 min-w-[16px] rounded-full bg-clay px-1 text-center text-[10px] font-bold text-on-clay" aria-hidden>
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      {label}
    </a>
  );
}
