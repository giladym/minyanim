import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "../../lib/auth-client";

/** Only allow relative same-origin redirect targets (open-redirect guard, client side). */
function safeRedirect(): string {
  const p = new URLSearchParams(window.location.search).get("redirect");
  if (!p || !p.startsWith("/") || p.startsWith("//")) return "/stays";
  return p;
}

const input = "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-ink";
const primary = "w-full rounded-xl bg-clay px-4 py-3 font-extrabold text-on-clay disabled:opacity-60";
const ghost = "w-full rounded-xl border border-line bg-surface px-4 py-3 font-extrabold text-ink";

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6 font-sans text-ink">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-extrabold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

function GoogleButton() {
  const { t } = useTranslation();
  return (
    <button
      className={ghost}
      onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: safeRedirect() })}
    >
      {t("auth.google")}
    </button>
  );
}

export function SignIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shared, setShared] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await authClient.signIn.email({ email, password, rememberMe: !shared });
    setBusy(false);
    if (error) setErr(t("auth.invalid"));
    else void navigate({ to: safeRedirect() });
  }

  return (
    <AuthCard title={t("auth.signInTitle")}>
      <GoogleButton />
      <div className="my-4 text-center text-sm text-faint">{t("auth.or")}</div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className={input} type="email" aria-label={t("auth.email")} placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" aria-label={t("auth.password")} placeholder={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {t("auth.sharedDevice")}
        </label>
        {err && <p className="text-sm font-bold text-clay-ink">{err}</p>}
        <button className={primary} disabled={busy} type="submit">{t("auth.signInSubmit")}</button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <a href="/forgot-password" className="font-bold text-clay">{t("auth.forgot")}</a>
        <a href="/register" className="font-bold text-clay">{t("auth.toRegister")}</a>
      </div>
    </AuthCard>
  );
}

export function Register() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await authClient.signUp.email({ name, email, password });
    setBusy(false);
    if (error) setErr(t("auth.error"));
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title={t("auth.registerTitle")}>
        <p className="text-center leading-relaxed text-muted">{t("auth.verifySent")}</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("auth.registerTitle")}>
      <GoogleButton />
      <div className="my-4 text-center text-sm text-faint">{t("auth.or")}</div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className={input} aria-label={t("auth.name")} placeholder={t("auth.name")} value={name} onChange={(e) => setName(e.target.value)} required />
        <input className={input} type="email" aria-label={t("auth.email")} placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" aria-label={t("auth.password")} placeholder={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        {err && <p className="text-sm font-bold text-clay-ink">{err}</p>}
        <button className={primary} disabled={busy} type="submit">{t("auth.registerSubmit")}</button>
      </form>
      <div className="mt-4 text-center text-sm">
        <span className="text-muted">{t("auth.haveAccount")} </span>
        <a href="/sign-in" className="font-bold text-clay">{t("auth.toSignIn")}</a>
      </div>
    </AuthCard>
  );
}

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Always show the same message regardless of whether the account exists (no enumeration).
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setSent(true);
  }

  return (
    <AuthCard title={t("auth.forgotTitle")}>
      {sent ? (
        <p className="text-center leading-relaxed text-muted">{t("auth.forgotSent")}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className={input} type="email" aria-label={t("auth.email")} placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className={primary} type="submit">{t("auth.forgotSubmit")}</button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPassword() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) setErr(t("auth.error"));
    else setDone(true);
  }

  return (
    <AuthCard title={t("auth.resetTitle")}>
      {done ? (
        <p className="text-center leading-relaxed text-muted">
          {t("auth.resetDone")} <a href="/sign-in" className="font-bold text-clay">{t("auth.toSignIn")}</a>
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className={input} type="password" aria-label={t("auth.password")} placeholder={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          {err && <p className="text-sm font-bold text-clay-ink">{err}</p>}
          <button className={primary} type="submit">{t("auth.resetSubmit")}</button>
        </form>
      )}
    </AuthCard>
  );
}

/** Protected placeholder (real My Stays is feature 002). */
export function StaysPlaceholder() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center font-sans text-ink">
      <h1 className="text-3xl font-extrabold">{t("stays.title")}</h1>
      <p className="text-muted">{t("stays.placeholder")}</p>
      <button className="rounded-lg border border-line px-4 py-2 text-sm font-bold" onClick={() => void authClient.signOut().then(() => (window.location.href = "/"))}>
        {t("auth.signInTitle")} ⏏
      </button>
    </main>
  );
}
