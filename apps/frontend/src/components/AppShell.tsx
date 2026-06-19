import { useEffect, useRef } from "react";
import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "../theme/ThemeProvider";
import { getProfile, patchProfile } from "../lib/profile";
import { authClient } from "../lib/auth-client";
import { RouteAnnouncer } from "./RouteAnnouncer";
import { HeaderCalendar } from "../features/header-calendar/HeaderCalendar";

const NAV = [
  { href: "/discovery", key: "nav.discovery" },
  { href: "/stays", key: "nav.stays" },
  { href: "/notifications", key: "nav.notifications" },
  { href: "/profile", key: "nav.profile" },
];

/** Authenticated app shell: RTL header (logo, calendar slot, theme/lang, avatar) + bottom nav. */
export function AppShell() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const initial = (session?.user?.name || session?.user?.email || "").trim().charAt(0).toUpperCase() || "•";

  // A manual theme/lang change must win over a late-arriving profile sync, otherwise the
  // async hydration below can clobber a choice the user just made (race).
  const touched = useRef(false);

  // Cross-device sync: hydrate language + theme from the saved profile (US3 / FR-004/FR-009).
  // Skip if the user has already interacted this session.
  useEffect(() => {
    getProfile()
      .then((p) => {
        if (touched.current) return;
        setTheme(p.theme as Theme);
        if (p.language !== i18n.resolvedLanguage) void i18n.changeLanguage(p.language);
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

  return (
    <div className="min-h-screen bg-bg font-sans text-ink">
      <a href="#main" className="sr-only rounded-lg bg-clay px-4 py-2 font-bold text-on-clay focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-50">
        {t("a11y.skipToContent")}
      </a>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line2 bg-header px-4 py-3 md:px-8">
        <a href="/stays" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-clay text-lg font-extrabold text-on-clay">מ</span>
          <span className="text-xl font-extrabold">{t("app.name")}</span>
        </a>
        <HeaderCalendar />
        <div className="flex items-center gap-2">
          <button className={pill} onClick={toggleTheme}>{t("theme.toggle")}</button>
          <button className={pill} onClick={toggleLang}>{i18n.resolvedLanguage === "he" ? "EN" : "עב"}</button>
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
        <a href="/add" aria-label={t("nav.add")} className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-clay text-2xl font-light text-on-clay shadow-lg">
          +
        </a>
        {NAV.slice(2).map((n) => (
          <NavItem key={n.href} href={n.href} label={t(n.key)} active={path === n.href} />
        ))}
      </nav>

      <RouteAnnouncer />
    </div>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a href={href} className={"flex w-16 flex-col items-center gap-1 text-[11px] font-bold " + (active ? "text-clay" : "text-faint")}>
      <span className={"h-4 w-4 rounded-full border-2 " + (active ? "border-clay" : "border-faint")} />
      {label}
    </a>
  );
}
