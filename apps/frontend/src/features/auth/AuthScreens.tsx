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
const queryParam = (k: string) => new URLSearchParams(window.location.search).get(k) ?? "";

// ── Reusable primitives (match the design system) ──────────────────────────
function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12 font-sans text-ink"
      style={{ background: "linear-gradient(180deg,var(--auth-grad-top),var(--bg) 30%)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-clay text-[34px] font-extrabold text-on-clay shadow-xl">
          מ
        </div>
        <h1 className="mb-6 text-center text-[28px] font-extrabold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

function TextField(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const { label, type = "text", value, onChange, error, autoComplete, minLength } = props;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-invalid={!!error}
        autoComplete={autoComplete}
        minLength={minLength}
        required
        className={
          "w-full rounded-xl border bg-surface px-3.5 py-3 text-ink outline-none transition focus:border-clay " +
          (error ? "border-clay-ink" : "border-line2")
        }
      />
      {error && <span className="mt-1 block text-sm font-semibold text-clay-ink">{error}</span>}
    </label>
  );
}

function PrimaryButton({ children, loading, ...rest }: { children: ReactNode; loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { t } = useTranslation();
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className="w-full rounded-[14px] bg-clay px-4 py-[15px] font-extrabold text-on-clay transition disabled:opacity-60"
    >
      {loading ? t("auth.submitting") : children}
    </button>
  );
}

function GoogleButton() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    setErr("");
    setBusy(true);
    // On success the browser is redirected to Google, so control only returns here on failure.
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: safeRedirect() });
    if (error) {
      setBusy(false);
      setErr(t("auth.error"));
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2.5 rounded-[14px] border border-line2 bg-surface px-4 py-[15px] font-extrabold text-ink transition disabled:opacity-60"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-clay text-sm font-extrabold text-on-clay">G</span>
        {busy ? t("auth.submitting") : t("auth.google")}
      </button>
      <ErrorText msg={err} />
    </div>
  );
}

function ErrorText({ msg }: { msg: string }) {
  return msg ? <p role="alert" className="text-sm font-bold text-clay-ink">{msg}</p> : null;
}

// ── Screens ─────────────────────────────────────────────────────────────────
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
      <div className="my-4 text-center text-sm text-faint">— {t("auth.or")} —</div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label={t("auth.email")} type="email" value={email} onChange={setEmail} autoComplete="email" />
        <TextField label={t("auth.password")} type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {t("auth.sharedDevice")}
        </label>
        <ErrorText msg={err} />
        <PrimaryButton loading={busy} type="submit">{t("auth.signInSubmit")}</PrimaryButton>
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
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setFieldErr("");
    if (password !== confirm) {
      setFieldErr(t("auth.passwordMismatch"));
      return;
    }
    setBusy(true);
    const { error } = await authClient.signUp.email({ name, email, password });
    setBusy(false);
    if (error) setErr(t("auth.error"));
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title={t("auth.checkInbox")}>
        <p className="text-center leading-relaxed text-muted">{t("auth.verifySent")}</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("auth.registerTitle")}>
      <GoogleButton />
      <div className="my-4 text-center text-sm text-faint">— {t("auth.or")} —</div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label={t("auth.name")} value={name} onChange={setName} autoComplete="name" />
        <TextField label={t("auth.email")} type="email" value={email} onChange={setEmail} autoComplete="email" />
        <TextField label={t("auth.password")} type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
        <TextField label={t("auth.confirmPassword")} type="password" value={confirm} onChange={setConfirm} error={fieldErr} autoComplete="new-password" minLength={8} />
        <ErrorText msg={err} />
        <PrimaryButton loading={busy} type="submit">{t("auth.registerSubmit")}</PrimaryButton>
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
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Always show the same message regardless of whether the account exists (no enumeration).
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthCard title={t("auth.forgotTitle")}>
      {sent ? (
        <p className="text-center leading-relaxed text-muted">{t("auth.forgotSent")}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField label={t("auth.email")} type="email" value={email} onChange={setEmail} autoComplete="email" />
          <PrimaryButton loading={busy} type="submit">{t("auth.forgotSubmit")}</PrimaryButton>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPassword() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState("");
  const [busy, setBusy] = useState(false);
  const token = queryParam("token");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setFieldErr("");
    if (password !== confirm) {
      setFieldErr(t("auth.passwordMismatch"));
      return;
    }
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
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
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField label={t("auth.password")} type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
          <TextField label={t("auth.confirmPassword")} type="password" value={confirm} onChange={setConfirm} error={fieldErr} autoComplete="new-password" minLength={8} />
          <ErrorText msg={err} />
          <PrimaryButton loading={busy} type="submit">{t("auth.resetSubmit")}</PrimaryButton>
        </form>
      )}
    </AuthCard>
  );
}

/** Verification landing: success (after the email link verifies) or "check your inbox". */
export function VerifyEmail() {
  const { t } = useTranslation();
  const success = queryParam("status") === "success";
  return (
    <AuthCard title={success ? t("auth.verifySuccessTitle") : t("auth.checkInbox")}>
      <p className="text-center leading-relaxed text-muted">
        {success ? (
          <>
            {t("auth.verifySuccess")} <a href="/sign-in" className="font-bold text-clay">{t("auth.toSignIn")}</a>
          </>
        ) : (
          t("auth.verifySent")
        )}
      </p>
    </AuthCard>
  );
}

/** Protected placeholder, rendered inside the app shell (real My Stays is feature 002). */
export function StaysPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <h1 className="text-3xl font-extrabold">{t("stays.title")}</h1>
      <p className="text-muted">{t("stays.placeholder")}</p>
    </div>
  );
}
