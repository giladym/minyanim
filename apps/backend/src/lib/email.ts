import { Resend } from "resend";
import type { Env } from "../env";

const FROM = "Minyanim <no-reply@minyanim.app>"; // TODO: set to your verified sending domain

/**
 * Send a transactional email via Resend (swappable provider — see ADR/D16).
 * Templates are localized he/en by the caller. No-ops with a warning if no key is set
 * (e.g. local dev before email is configured).
 */
export async function sendEmail(
  env: Env,
  opts: { to: string; subject: string; html: string },
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(JSON.stringify({ level: "warn", message: "RESEND_API_KEY unset — email skipped", to: opts.to }));
    return;
  }
  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html });
}
