import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Profile, Language } from "@minyanim/shared";
import { getProfile, patchProfile, addPhone, deletePhone, deleteAccount } from "../../lib/profile";
import { useTheme, type Theme } from "../../theme/ThemeProvider";
import { authClient } from "../../lib/auth-client";

const E164 = /^\+[1-9]\d{1,14}$/;
const field = "w-full rounded-lg border border-line2 bg-surface px-3 py-2.5 text-ink";
const card = "rounded-2xl border border-line bg-surface p-5";

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { setTheme } = useTheme();
  const [p, setP] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [phoneErr, setPhoneErr] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function load() {
    getProfile().then((pr) => { setP(pr); setName(pr.name); }).catch(() => {});
  }
  useEffect(load, []);

  if (!p) return null;

  async function saveName() {
    setP(await patchProfile({ name }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  async function changeLanguage(language: Language) {
    setP(await patchProfile({ language }));
    void i18n.changeLanguage(language);
  }
  async function changeTheme(theme: Theme) {
    setTheme(theme);
    setP(await patchProfile({ theme }));
  }
  async function add() {
    setPhoneErr("");
    if (!E164.test(phone)) { setPhoneErr(t("profile.invalidPhone")); return; }
    await addPhone({ e164: phone, label: label || null });
    setPhone(""); setLabel(""); load();
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="text-2xl font-extrabold">{t("profile.title")}</h1>

      <section className={card}>
        <label className="mb-1.5 block text-sm font-bold">{t("profile.name")}</label>
        <div className="flex gap-2">
          <input className={field} value={name} aria-label={t("profile.name")} onChange={(e) => setName(e.target.value)} />
          <button className="rounded-lg bg-clay px-4 font-extrabold text-on-clay" onClick={() => void saveName()}>
            {saved ? t("profile.saved") : t("profile.save")}
          </button>
        </div>
      </section>

      <section className={card + " grid grid-cols-2 gap-4"}>
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
      </section>

      <section className={card}>
        <h2 className="mb-3 text-sm font-bold">{t("profile.phones")}</h2>
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
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={field} dir="ltr" value={phone} aria-label={t("profile.phones")} placeholder={t("profile.phonePlaceholder")} onChange={(e) => setPhone(e.target.value)} />
          <input className={field} value={label} aria-label={t("profile.phoneLabel")} placeholder={t("profile.phoneLabel")} onChange={(e) => setLabel(e.target.value)} />
          <button className="rounded-lg bg-clay px-4 py-2.5 font-extrabold text-on-clay" onClick={() => void add()}>
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

      <section className={card + " border-clay-soft"}>
        <h2 className="mb-2 text-sm font-bold text-clay-ink">{t("profile.deleteTitle")}</h2>
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
