import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Profile, Language, HavdalahOpinion } from "@minyanim/shared";
import { getProfile, patchProfile, addPhone, deletePhone, deleteAccount } from "../../lib/profile";
import { ApiError } from "../../lib/api";
import { PhoneInput } from "./PhoneInput";
import { useTheme, type Theme } from "../../theme/ThemeProvider";
import { authClient } from "../../lib/auth-client";

const E164 = /^\+[1-9]\d{1,14}$/;
const field = "w-full rounded-lg border border-line2 bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-primary";
const card = "rounded-2xl border border-line bg-surface p-5";
const secHead = "mb-3 block text-xs font-bold uppercase tracking-wide text-faint";

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { setTheme } = useTheme();
  const [p, setP] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [phoneErr, setPhoneErr] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function load() {
    getProfile().then((pr) => { setP(pr); setName(pr.name); }).catch(() => {});
  }
  useEffect(load, []);

  if (!p) return null;

  // Post-login nudge (AppShell sends users with no phone here via ?onboarding=phone). Show the
  // banner + autofocus the phone field only while they still have no phone. Read straight from the
  // URL (no router context needed — keeps the component testable in isolation).
  const onboardingPhone =
    new URLSearchParams(window.location.search).get("onboarding") === "phone" && p.phones.length === 0;

  /** Persist a profile patch, surfacing any failure instead of swallowing it (was silent). */
  async function patch(input: Parameters<typeof patchProfile>[0]): Promise<boolean> {
    setSaveErr("");
    try {
      setP(await patchProfile(input));
      return true;
    } catch (err) {
      setSaveErr(
        err instanceof ApiError && err.body.errors[0]?.code
          ? t(`errors.${err.body.errors[0].code}`)
          : t("auth.error"),
      );
      return false;
    }
  }
  async function saveName() {
    if (!name.trim()) { setSaveErr(t("errors.name.required")); return; }
    if (await patch({ name })) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }
  async function changeLanguage(language: Language) {
    if (await patch({ language })) void i18n.changeLanguage(language);
  }
  async function changeTheme(theme: Theme) {
    const prev = p!.theme as Theme;
    setTheme(theme);
    if (!(await patch({ theme }))) setTheme(prev); // revert the optimistic theme on failure
  }
  async function changeHavdalahOpinion(havdalahOpinion: HavdalahOpinion) {
    await patch({ havdalahOpinion });
  }
  async function add() {
    setPhoneErr("");
    if (!E164.test(phone)) { setPhoneErr(t("profile.invalidPhone")); return; }
    try {
      await addPhone({ e164: phone, label: label || null });
      setPhone(""); setLabel(""); load();
    } catch (err) {
      // Surface server-side failures instead of swallowing them (was a silent no-op before).
      setPhoneErr(
        err instanceof ApiError && err.body.errors[0]?.code
          ? t(`errors.${err.body.errors[0].code}`)
          : t("profile.invalidPhone"),
      );
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="font-display text-2xl font-extrabold">{t("profile.title")}</h1>

      {onboardingPhone && (
        <div className="mn-fadeup rounded-2xl border-[1.5px] border-primary-container bg-primary-soft p-4">
          <p className="font-extrabold text-primary">{t("profile.phonePrompt.title")}</p>
          <p className="mt-1 text-sm text-muted">{t("profile.phonePrompt.body")}</p>
        </div>
      )}

      {saveErr && <p role="alert" className="rounded-lg bg-clay-soft px-4 py-2.5 text-sm font-bold text-clay-ink">{saveErr}</p>}

      <section className={card}>
        <span className={secHead}>{t("profile.name")}</span>
        <div className="flex gap-2">
          <input className={field} value={name} aria-label={t("profile.name")} onChange={(e) => setName(e.target.value)} />
          <button className="shrink-0 rounded-lg bg-primary px-4 font-extrabold text-on-primary transition" onClick={() => void saveName()}>
            {saved ? t("profile.saved") : t("profile.save")}
          </button>
        </div>
      </section>

      <section className={card}>
        <span className={secHead}>{t("profile.preferences")}</span>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">{t("profile.language")}</span>
          <select className={field} value={i18n.resolvedLanguage} onChange={(e) => void changeLanguage(e.target.value as Language)}>
            <option value="he">{t("profile.langHe")}</option>
            <option value="en">{t("profile.langEn")}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">{t("profile.theme")}</span>
          <select className={field} value={p.theme} onChange={(e) => void changeTheme(e.target.value as Theme)}>
            <option value="light">{t("profile.themeLight")}</option>
            <option value="dark">{t("profile.themeDark")}</option>
            <option value="system">{t("profile.themeSystem")}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">{t("profile.havdalah.label")}</span>
          <select
            className={field}
            value={p.havdalahOpinion}
            onChange={(e) => void changeHavdalahOpinion(e.target.value as HavdalahOpinion)}
          >
            <option value="geonim">{t("profile.havdalah.geonim")}</option>
            <option value="rabbeinu_tam">{t("profile.havdalah.rabbeinuTam")}</option>
            <option value="both">{t("profile.havdalah.both")}</option>
          </select>
        </label>
        </div>
      </section>

      <section className={card}>
        <span className={secHead}>{t("profile.phones")}</span>
        <label className="mb-3 flex min-h-[44px] items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0"
            checked={p.sharePhone}
            aria-label={t("profile.sharePhone")}
            onChange={(e) => void patch({ sharePhone: e.target.checked })}
          />
          <span>
            <span className="font-bold">{t("profile.sharePhone")}</span>
            <span className="mt-0.5 block text-xs text-muted">{t("profile.sharePhoneHint")}</span>
          </span>
        </label>
        <ul className="mb-3 flex flex-col gap-2">
          {p.phones.map((ph) => (
            <li key={ph.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <span dir="ltr" className="font-medium">{ph.e164}{ph.label ? ` · ${ph.label}` : ""}</span>
              <button className="text-sm font-bold text-clay-ink" onClick={() => void deletePhone(ph.id).then(load)}>
                {t("profile.remove")}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <PhoneInput onChange={setPhone} autoFocus={onboardingPhone} />
            <input className={field + " sm:max-w-[10rem]"} value={label} aria-label={t("profile.phoneLabel")} placeholder={t("profile.phoneLabel")} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <button
            className="self-start rounded-lg bg-primary px-4 py-2.5 font-extrabold text-on-primary disabled:opacity-50"
            disabled={!E164.test(phone)}
            onClick={() => void add()}
          >
            {t("profile.addPhone")}
          </button>
        </div>
        {phoneErr && <p role="alert" className="mt-2 text-sm font-bold text-clay-ink">{phoneErr}</p>}
      </section>

      <button
        className="self-start rounded-lg border border-line px-4 py-2 text-sm font-bold text-muted"
        onClick={() => void authClient.signOut().then(() => (window.location.href = "/"))}
      >
        {t("profile.signOut")}
      </button>

      <section className="rounded-2xl border-[1.5px] border-clay-soft bg-clay-soft/40 p-5">
        <span className="mb-3 block text-xs font-bold uppercase tracking-wide text-clay-ink">{t("profile.deleteTitle")}</span>
        <p className="mb-3 text-sm text-muted">{t("profile.deleteWarn")}</p>
        {confirmingDelete ? (
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-clay-ink px-4 py-2 text-sm font-extrabold text-on-clay"
              onClick={() => void deleteAccount().then(() => (window.location.href = "/"))}
            >
              {t("profile.deleteConfirm")}
            </button>
            <button className="rounded-lg border border-line px-4 py-2 text-sm font-bold" onClick={() => setConfirmingDelete(false)}>
              {t("profile.cancel")}
            </button>
          </div>
        ) : (
          <button className="rounded-lg border border-clay-ink px-4 py-2 text-sm font-bold text-clay-ink" onClick={() => setConfirmingDelete(true)}>
            {t("profile.deleteButton")}
          </button>
        )}
      </section>
    </div>
  );
}
