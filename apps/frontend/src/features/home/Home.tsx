import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "./Globe";
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
      <a href="/stays" className={base + " bg-clay text-on-clay"}>
        {t("cta.myStays")}
      </a>
    );
  }
  return (
    <button
      className={base + " bg-clay text-on-clay"}
      onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-on-clay text-sm font-extrabold text-clay">
        G
      </span>
      {t("cta.google")}
    </button>
  );
}

function Nav() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const pill = "rounded-full border border-line px-3 py-1.5 text-xs font-bold text-muted";
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-line bg-bg/90 px-5 py-3.5 backdrop-blur md:px-12">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-clay text-lg font-extrabold text-on-clay">
          מ
        </div>
        <span className="text-xl font-extrabold">{t("app.name")}</span>
      </div>
      <div className="flex items-center gap-3 md:gap-6">
        <a href="#how" className="hidden text-sm font-bold text-muted sm:block">{t("nav.how")}</a>
        <a href="#testi" className="hidden text-sm font-bold text-muted sm:block">{t("nav.testimonials")}</a>
        <button className={pill} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {t("theme.toggle")}
        </button>
        <button
          className={pill}
          onClick={() => void i18n.changeLanguage(i18n.resolvedLanguage === "he" ? "en" : "he")}
        >
          {i18n.resolvedLanguage === "he" ? "EN" : "עב"}
        </button>
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

  const steps = [
    { n: "1", title: t("home.how.s1Title"), body: t("home.how.s1Body"), bg: "bg-clay-soft", fg: "text-clay" },
    { n: "2", title: t("home.how.s2Title"), body: t("home.how.s2Body"), bg: "bg-teal-soft", fg: "text-teal-ink" },
    { n: "3", title: t("home.how.s3Title"), body: t("home.how.s3Body"), bg: "bg-gold-soft", fg: "text-gold" },
  ];
  const testis = [
    { q: t("home.testimonials.t1"), loc: t("home.testimonials.t1Loc"), bg: "bg-clay-soft", fg: "text-clay-ink" },
    { q: t("home.testimonials.t2"), loc: t("home.testimonials.t2Loc"), bg: "bg-teal-soft", fg: "text-teal-ink" },
    { q: t("home.testimonials.t3"), loc: t("home.testimonials.t3Loc"), bg: "bg-gold-soft", fg: "text-gold" },
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
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.03] tracking-tight md:text-7xl">
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
            <Globe />
            <div className="rounded-xl border border-line bg-surface px-4 py-2.5 text-center text-sm font-bold text-faint">
              {t("home.globe.caption")}
            </div>
          </div>
        </div>
      </Section>

      {/* Early access */}
      <Section className="bg-surface">
        <div className="mx-auto max-w-2xl text-center">
          <p className={eyebrow}>{t("home.early.eyebrow")}</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight md:text-5xl">{t("home.early.title")}</h2>
          <p className="mx-auto mt-5 max-w-[52ch] leading-relaxed text-muted">{t("home.early.body")}</p>
          <div className="mt-8">
            <PrimaryCta />
          </div>
        </div>
      </Section>

      {/* How it works */}
      <Section id="how" className="bg-surface">
        <p className={eyebrow}>{t("home.how.eyebrow")}</p>
        <h2 className="mt-3 max-w-[22ch] text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
          {t("home.how.title")}
        </h2>
        <div className="mt-14 grid gap-7 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-3xl border border-line bg-bg p-8">
              <div className={"flex h-12 w-12 items-center justify-center rounded-xl " + s.bg}>
                <span className={"text-xl font-extrabold " + s.fg}>{s.n}</span>
              </div>
              <h3 className="mt-5 text-xl font-extrabold">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Mission */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <p className={eyebrow}>{t("home.mission.eyebrow")}</p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {t("home.mission.title")}
            </h2>
            <p className="mt-6 leading-relaxed text-muted">{t("home.mission.p1")}</p>
            <p className="mt-5 leading-relaxed text-muted">{t("home.mission.p2")}</p>
          </div>
          <div className="h-72 rounded-3xl border border-line bg-surface" />
        </div>
      </Section>

      {/* Testimonials */}
      <Section id="testi" className="bg-surface">
        <p className={eyebrow}>{t("home.testimonials.eyebrow")}</p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">{t("home.testimonials.title")}</h2>
        <p className="mt-3 text-sm font-semibold text-faint">{t("home.testimonials.disclaimer")}</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {testis.map((c, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-3xl border border-line bg-bg p-7">
              <p className="flex-1 leading-relaxed">{`״${c.q}״`}</p>
              <div className="flex items-center gap-3">
                <div className={"flex h-10 w-10 items-center justify-center rounded-full font-extrabold " + c.bg + " " + c.fg}>
                  {t("home.testimonials.traveler").charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-extrabold">{t("home.testimonials.traveler")}</div>
                  <div className="text-xs text-muted">{c.loc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Footer CTA */}
      <Section className="bg-clay text-on-clay">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em]">{t("home.footerCta.eyebrow")}</p>
          <h2 className="mt-4 text-4xl font-extrabold leading-tight md:text-6xl">
            {t("home.footerCta.title1")}
            <br />
            {t("home.footerCta.title2")}
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] leading-relaxed">{t("home.footerCta.sub")}</p>
          <div className="mt-8 flex justify-center">
            <PrimaryCta className="!bg-on-clay !text-clay" />
          </div>
          <p className="mt-3 text-sm">{t("home.footerCta.micro")}</p>
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
