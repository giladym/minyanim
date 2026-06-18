import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

export const SUPPORTED = ["he", "en"] as const;
export type Lang = (typeof SUPPORTED)[number];

// Minimal bootstrap resources; feature strings are added per story (no hard-coded UI strings).
const resources = {
  he: {
    translation: {
      app: { name: "מניין" },
      home: { ready: "בסיס הפלטפורמה מוכן", subtitle: "בונים את התכונות הבאות." },
      theme: { toggle: "מצב תצוגה" },
      lang: { toggle: "שפה" },
    },
  },
  en: {
    translation: {
      app: { name: "Minyanim" },
      home: { ready: "Foundation ready", subtitle: "Building features next." },
      theme: { toggle: "Theme" },
      lang: { toggle: "Language" },
    },
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "he",
    supportedLngs: SUPPORTED,
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], lookupLocalStorage: "minyanim_lang", caches: ["localStorage"] },
  });

/** Keep <html lang/dir> in sync with the active language (he → rtl, en → ltr). */
function applyDir(lng: string) {
  document.documentElement.setAttribute("lang", lng);
  document.documentElement.setAttribute("dir", lng === "he" ? "rtl" : "ltr");
}
applyDir(i18n.resolvedLanguage ?? "he");
i18n.on("languageChanged", applyDir);

export default i18n;
