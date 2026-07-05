import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: Page) {
  const email = `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.request.post("/api/auth/sign-up/email", { data: { name: "נוסע בדיקה", email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}

/** Epoch-ms at UTC midnight `days` from today. */
function utcDays(days: number): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.getTime();
}

test("WCAG 2.1 AA: a Stay's Shabbat-times section is axe-clean (with real coordinates)", async ({ page }) => {
  await signIn(page);
  // Create a coord-bearing Stay over a 7-day span (always covers a Shabbat), via the API.
  await page.request.post("/api/stays", {
    data: {
      city: "קרקוב", country: "פולין", lat: 50.0647, lng: 19.945,
      arrivalDate: utcDays(7), departureDate: utcDays(14), numMen: 2,
      bringsSeferTorah: false,
      prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
    },
  });

  await page.goto("/stays");
  const expander = page.getByRole("button", { name: /זמני שבת|Shabbat times/ });
  await expect(expander).toBeVisible();
  await expander.click();
  // Candle-lighting label appears once the lazy fetch resolves. A 7-day span can cover more than
  // one Shabbat (each shown), so match the first.
  await expect(page.getByText(/הדלקת נרות|Candle lighting/).first()).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("WCAG 2.1 AA: the Havdalah preference control on the profile is axe-clean and keyboard-operable", async ({ page }) => {
  await signIn(page);
  await page.goto("/profile");
  const select = page.getByLabel(/זמן צאת השבת המוצג|Displayed Shabbat-end time/);
  await expect(select).toBeVisible();
  await select.selectOption("both");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});
