import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeProvider";

/** Bootstrap placeholder exercising i18n + theme + router. The real marketing homepage is US1 (T028). */
export function Home() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const btn = "rounded-lg border border-line px-3 py-1 text-sm font-bold";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center font-sans text-ink">
      <div className="text-sm font-bold tracking-widest text-clay">{t("app.name")} · MINYANIM</div>
      <h1 className="text-3xl font-extrabold">{t("home.ready")}</h1>
      <p className="text-muted">{t("home.subtitle")}</p>
      <div className="mt-4 flex gap-2">
        <button className={btn} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {t("theme.toggle")}
        </button>
        <button
          className={btn}
          onClick={() => void i18n.changeLanguage(i18n.resolvedLanguage === "he" ? "en" : "he")}
        >
          {t("lang.toggle")}: {i18n.resolvedLanguage}
        </button>
      </div>
    </main>
  );
}
