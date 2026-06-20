import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Register + sign in a fresh user. */
async function signIn(page: Page) {
  const email = `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.request.post("/api/auth/sign-up/email", { data: { name: "נוסע בדיקה", email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}

/** A civil date `days` from today, "YYYY-MM-DD". */
function dateInput(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pick the canned location (GEO_MODE=mock returns "London, United Kingdom" with coordinates). */
async function pickMockCity(page: Page, label: RegExp) {
  await page.getByLabel(label).fill("London");
  await page.getByRole("button", { name: /London, United Kingdom/ }).click();
}

test("discovery page is WCAG-clean (axe) and searchable", async ({ page }) => {
  await signIn(page);
  await page.goto("/discovery");
  await pickMockCity(page, /חיפוש עיר|Search a city/);
  await page.getByLabel(/מתאריך|^From$/).fill(dateInput(7));
  await page.getByLabel(/עד תאריך|^To$/).fill(dateInput(40));
  await expect(page.getByRole("heading", { name: /פוטנציאל|Potential/ })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("host a minyan → detail page is WCAG-clean and reveals address to the host", async ({ page }) => {
  await signIn(page);
  await page.goto("/minyan/new");
  await pickMockCity(page, /חיפוש עיר|Search a city/);
  await page.getByLabel(/כתובת מדויקת|Specific address/).fill("12 Test St");
  await page.getByLabel(/^תאריך$|^Date$/).fill(dateInput(14));
  await page.getByRole("button", { name: /אירוח המניין|Host the minyan/ }).click();

  await page.waitForURL(/\/minyan\/[^/]+$/);
  await expect(page.getByText("12 Test St", { exact: false })).toBeVisible(); // host sees the exact address

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
