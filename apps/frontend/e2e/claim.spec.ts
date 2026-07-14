import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Feature 009 — seed-import CLAIM flow. A seed user (kind='seed', no login) owns a location; a real
 * user whose profile phone matches sees the dashboard ClaimBanner and merges it in (POST /api/me/claims).
 *
 * A seed has no better-auth account, so it can't be made via signup. We build its data as a throwaway
 * real user through the API, then flip it to kind='seed' with `wrangler d1 execute --local` — the same
 * mechanism as tools/dev-seed/seed-claim.mjs, run against the SAME local D1 the e2e backend uses.
 */

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "backend");
const uniqEmail = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const dateInput = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const epoch = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);

/** Run SQL against the local Miniflare D1 the e2e backend runs on (cwd = apps/backend for wrangler.jsonc). */
function d1(command: string) {
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "minyanim", "--local", "--command", command], {
    cwd: backendDir,
    stdio: ["ignore", "ignore", "inherit"],
  });
}

test("claim: a phone-matched seed's location merges into the account via the dashboard banner", async ({ page, playwright, baseURL }) => {
  test.setTimeout(90_000); // the wrangler d1 shell-out adds a few seconds
  const phone = `+97250${Math.floor(1e6 + Math.random() * 8e6)}`; // unique E.164 per run — no cross-test match

  // 1) Build the seed's data as a throwaway real user (API), capture its id, give it the shared phone + a stay.
  const src = await playwright.request.newContext({ baseURL });
  await src.post("/api/auth/sign-up/email", { data: { name: "מיובא", email: uniqEmail("seed"), password: "password123" } });
  const seedId = (await (await src.get("/api/me")).json()).id as string;
  expect(seedId).toBeTruthy();
  expect((await src.post("/api/me/phones", { data: { e164: phone, label: null } })).ok()).toBeTruthy();
  const stayRes = await src.post("/api/stays", {
    data: { city: "פריז", country: "צרפת", lat: 48.8566, lng: 2.3522, arrivalDate: epoch(dateInput(20)), departureDate: epoch(dateInput(26)), numMen: 2 },
  });
  expect(stayRes.ok()).toBeTruthy();

  // 2) Flip it into a real seed (kind='seed', no login) — one wrangler call, three statements.
  d1(`UPDATE "user" SET kind='seed' WHERE id='${seedId}'; DELETE FROM account WHERE user_id='${seedId}'; DELETE FROM session WHERE user_id='${seedId}';`);

  // 3) Claimer: a fresh real user carrying the SAME phone → the seed becomes claimable.
  await page.request.post("/api/auth/sign-up/email", { data: { name: "טוען", email: uniqEmail("claimer"), password: "password123" } });
  await page.request.post("/api/me/phones", { data: { e164: phone, label: null } });
  const offered = (await (await page.request.get("/api/me/claims")).json()) as { seeds: { seedUserId: string }[] };
  expect(offered.seeds.some((s) => s.seedUserId === seedId)).toBeTruthy();

  // 4) The dashboard banner offers it; confirming merges the Paris location in and dismisses the banner.
  await page.goto("/stays");
  const banner = page.getByText(/מצאנו נסיעות שקשורות אליכם|We found trips linked to you/);
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: /כן, צרפו אותם|Yes, add them/ }).click();

  await expect(banner).toBeHidden();
  await expect(page.getByText(/פריז/).first()).toBeVisible(); // the claimed stay now belongs to the claimer
  const after = (await (await page.request.get("/api/me/claims")).json()) as { seeds: unknown[] };
  expect(after.seeds).toEqual([]);
});
