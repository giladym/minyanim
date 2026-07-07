/**
 * Post-login "add a phone" nudge coordination. The auth screens *arm* the nudge on a real UI
 * sign-in/register (email or Google SSO); AppShell *consumes* it once on the next authed page load
 * and redirects a phone-less user to /profile. Keyed on an explicit login intent — never on every
 * page load — so it doesn't hijack deep-links/reloads, and API-only sessions (e2e) never trigger it.
 */
export const PHONE_NUDGE_KEY = "mn_check_phone_onboarding";

/** Arm the nudge for the next authed page load (no-op if sessionStorage is unavailable). */
export function armPhoneNudge(): void {
  try {
    sessionStorage.setItem(PHONE_NUDGE_KEY, "1");
  } catch {
    /* storage unavailable — skip the nudge silently */
  }
}
