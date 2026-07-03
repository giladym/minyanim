import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "./Globe";
import { Icon, type IconName } from "../../components/Icon";
import { useTheme } from "../../theme/ThemeProvider";
import { authClient } from "../../lib/auth-client";

/** Primary CTA: Google sign-in, or "My Stays" when already authenticated (T031). */
function PrimaryCta({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const { data } = authClient.useSession();
  const base =
    "inline-flex items-center justify-center gap-3 rounded-2xl px-7 py-4 text-base font-extrabold " + className;
  if (data?.user) {
    return (
      <a href="/stays" className={base + " bg-primary text-on-primary"}>
        {t("cta.myStays")}
      </a>
    );
  }
  return (
    <button
      className={base + " bg-primary text-on-primary"}
      onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-on-primary text-sm font-extrabold text-primary">
        G
      </span>
      {t("cta.google")}
    </button>
  );
}

/** First letter of the user's name/email for the avatar, uppercased; "•" as a safe fallback. */
function userInitial(user?: { name?: string | null; email?: string | null }): string {
  return (user?.name || user?.email || "").trim().charAt(0).toUpperCase() || "•";
}

function Nav() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const pill = "rounded-full border border-line px-3 py-1.5 text-xs font-bold text-muted";
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-line bg-bg/90 px-5 py-3.5 backdrop-blur md:px-12">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary text-lg font-extrabold text-on-primary">
          מ
        </div>
        <span className="font-display text-xl font-extrabold">{t("app.name")}</span>
      </div>
      <div className="flex items-center gap-3 md:gap-6">
        <a href="#how" className="hidden text-sm font-bold text-muted sm:block">{t("nav.how")}</a>
        <button className={pill} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {t("theme.toggle")}
        </button>
        <button
          className={pill}
          onClick={() => void i18n.changeLanguage(i18n.resolvedLanguage === "he" ? "en" : "he")}
        >
          {i18n.resolvedLanguage === "he" ? "EN" : "עב"}
        </button>
        {session?.user ? (
          <a
            href="/profile"
            aria-label={t("a11y.myProfile")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-teal font-bold text-on-teal"
          >
            {userInitial(session.user)}
          </a>
        ) : (
          <a href="/sign-in" className={pill}>
            {t("nav.signIn")}
          </a>
        )}
      </div>
    </nav>
  );
}

function Section({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={"px-5 py-20 md:px-12 md:py-28 " + className}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

const eyebrow = "text-xs font-extrabold uppercase tracking-[0.14em] text-clay";

export function Home() {
  const { t } = useTranslation();

  const steps: { icon: IconName; title: string; body: string }[] = [
    { icon: "map-pin", title: t("home.how.s1Title"), body: t("home.how.s1Body") },
    { icon: "search", title: t("home.how.s2Title"), body: t("home.how.s2Body") },
    { icon: "users", title: t("home.how.s3Title"), body: t("home.how.s3Body") },
  ];
  return (
    <div className="min-h-screen bg-bg font-sans text-ink">
      <Nav />

      <main>
      {/* Hero */}
      <Section>
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-20">
          <div>
            <p className={eyebrow}>{t("home.hero.eyebrow")}</p>
            <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.03] tracking-tight md:text-7xl">
              {t("home.hero.title1")}
              <br />
              {t("home.hero.title2")}
              <br />
              {t("home.hero.title3")}
            </h1>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted">{t("home.hero.subhead")}</p>
            <div className="mt-8">
              <PrimaryCta />
            </div>
            <p className="mt-3 text-sm text-faint">{t("home.hero.trust")}</p>
          </div>
          <div className="order-first flex flex-col items-center gap-5 md:order-last">
            <div className="relative flex items-center justify-center">
              {/* Soft brand halo behind the existing globe animation (globe itself unchanged). */}
              <div className="absolute inset-0 -z-10 rounded-full bg-primary/5 blur-3xl" aria-hidden />
              <Globe />
            </div>
            <div className="rounded-xl border border-line bg-surface px-4 py-2.5 text-center text-sm font-bold text-faint">
              {t("home.globe.caption")}
            </div>
          </div>
        </div>
      </Section>

      {/* Mission — replaces the old early-access block: the pitch card + a live stat card. */}
      <Section className="bg-chip border-y border-line">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-8 md:col-span-2 md:p-10">
            <p className={eyebrow}>{t("home.mission.eyebrow")}</p>
            <p className="mt-5 text-lg leading-relaxed text-muted md:text-xl">{t("home.mission.body")}</p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <span className="rounded-full bg-clay-soft px-4 py-1 text-sm font-bold text-clay-ink">{t("home.mission.tagCommunity")}</span>
              <span className="rounded-full bg-primary-soft px-4 py-1 text-sm font-bold text-primary-ink">{t("home.mission.tagTradition")}</span>
              <span className="rounded-full bg-chip px-4 py-1 text-sm font-bold text-muted">{t("home.mission.tagTech")}</span>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-8 rounded-2xl bg-primary p-8 text-on-primary md:p-10">
            <div>
              <div className="font-display text-5xl font-extrabold">{t("home.mission.statNumber")}</div>
              <div className="mt-2 text-sm font-bold opacity-80">{t("home.mission.statLabel")}</div>
            </div>
            <p className="leading-relaxed opacity-90">{t("home.mission.statBody")}</p>
          </div>
        </div>
      </Section>

      {/* How it works — centered, round icon medallions that fill on hover. */}
      <Section id="how" className="bg-surface border-y border-line">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{t("home.how.title")}</h2>
          <p className="mt-3 leading-relaxed text-muted">{t("home.how.subtitle")}</p>
        </div>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.icon} className="group flex flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-chip text-primary-ink transition-colors duration-500 group-hover:bg-primary group-hover:text-on-primary">
                <Icon name={s.icon} size={30} />
              </div>
              <h3 className="mt-6 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-3 max-w-[34ch] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Footer CTA — inset green card ("ready for your next journey"). */}
      <Section>
        <div className="mx-auto max-w-5xl rounded-2xl bg-primary px-6 py-14 text-center text-on-primary shadow-card md:px-12">
          <h2 className="font-display text-4xl font-extrabold leading-tight md:text-5xl">{t("home.footerCta.title")}</h2>
          <p className="mx-auto mt-5 max-w-[52ch] leading-relaxed opacity-90">{t("home.footerCta.sub")}</p>
          <div className="mt-8 flex justify-center">
            <PrimaryCta className="!bg-on-primary !text-primary" />
          </div>
        </div>
      </Section>
      </main>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-surface px-5 py-8 text-muted md:px-12">
        <span className="text-sm font-bold">{t("home.footer.rights")}</span>
        <div className="flex gap-5 text-sm">
          <span>{t("home.footer.privacy")}</span>
          <span>{t("home.footer.terms")}</span>
          <span>{t("home.footer.contact")}</span>
        </div>
      </footer>
    </div>
  );
}
