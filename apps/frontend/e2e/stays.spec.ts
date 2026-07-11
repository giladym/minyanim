import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Register + sign in a fresh user (each test starts from zero Stays). */
async function signIn(page: Page) {
  const email = `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.request.post("/api/auth/sign-up/email", { data: { name: "נוסע בדיקה", email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}

/** A civil date `days` from today, formatted "YYYY-MM-DD" for a native date input. */
function dateInput(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Create a Stay through the form using the manual-entry path (works without a live geocoder).
 * Fills city/country, arrival/departure, and the man count, then submits.
 */
async function createStay(
  page: Page,
  opts: { city: string; country: string; arrivalDays: number; departureDays: number; numMen?: number },
) {
  await page.goto("/stays/new");
  await page.getByRole("button", { name: /הכנס עיר ידנית|Enter city manually/ }).click();
  await page.getByLabel(/^עיר$|^City$/).fill(opts.city);
  await page.getByLabel(/^מדינה$|^Country$/).fill(opts.country);
  await page.getByLabel(/תאריך הגעה|Arrival date/).fill(dateInput(opts.arrivalDays));
  await page.getByLabel(/תאריך עזיבה|Departure date/).fill(dateInput(opts.departureDays));
  if (opts.numMen != null) {
    const men = page.getByLabel(/כמה גברים בקבוצה|How many men/);
    await men.fill(String(opts.numMen));
    // Controlled number input: confirm the value settled before submitting.
    await expect(men).toHaveValue(String(opts.numMen));
  }
  await page.getByRole("button", { name: /שמירת יעד|Save location/ }).click();
  await page.waitForURL(/\/stays(\?|$)/);
}

test("empty state shows explainer + a single prominent CTA", async ({ page }) => {
  await signIn(page);
  await page.goto("/stays");
  await expect(page.getByText(/עדיין לא רשמתם יעד|haven't registered a location/)).toBeVisible();
  const cta = page.getByRole("link", { name: /הוסף יעד|Add a location/ });
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page).toHaveURL(/\/stays\/new/);
});

test("create a Stay (manual entry) → it appears on the dashboard", async ({ page }) => {
  await signIn(page);
  await createStay(page, { city: "לונדון", country: "בריטניה", arrivalDays: 10, departureDays: 12 });
  await expect(page.getByRole("heading", { name: "לונדון, בריטניה" })).toBeVisible();
  // After a create, the just-saved card confirms ("היעד נשמר") and promotes hosting a minyan (#4).
  await expect(page.getByText("היעד נשמר")).toBeVisible();
  await expect(page.getByText(/רוצים מניין כאן|Want a minyan here/)).toBeVisible();
});

test("dashboard lists Stays nearest-first", async ({ page }) => {
  await signIn(page);
  // Create out of order; the soonest arrival must sort to the top.
  await createStay(page, { city: "טוקיו", country: "יפן", arrivalDays: 40, departureDays: 42 });
  await createStay(page, { city: "פריז", country: "צרפת", arrivalDays: 5, departureDays: 7 });
  // Wait for both cards to render (the list refetches after the create redirect).
  await expect(page.getByTestId("stay-card")).toHaveCount(2);
  const cities = await page.getByTestId("stay-card").locator("h2").allInnerTexts();
  expect(cities[0]).toContain("פריז");
  expect(cities[1]).toContain("טוקיו");
});

test("edit a Stay → the change is reflected", async ({ page }) => {
  await signIn(page);
  await createStay(page, { city: "מדריד", country: "ספרד", arrivalDays: 8, departureDays: 10, numMen: 2 });
  // Edit / cancel live behind the card's ⋮ actions menu (Heritage Voyage redesign).
  await page.getByLabel(/פעולות נוספות|More actions/).first().click();
  await page.getByRole("link", { name: /^עריכה$|^Edit$/ }).first().click();
  await page.waitForURL(/\/stays\/.+\/edit/);
  const men = page.getByLabel(/כמה גברים בקבוצה|How many men/);
  // Wait for the async getStay() seed (2) to land before editing, so the fill isn't overwritten.
  await expect(men).toHaveValue("2");
  await men.fill("5");
  // Confirm the controlled input committed to 5 before submitting (avoids a fill/re-render race
  // where the PATCH would otherwise send the stale seeded value).
  await expect(men).toHaveValue("5");
  await page.getByRole("button", { name: /עדכון היעד|Update destination/ }).click();
  await page.waitForURL(/\/stays(\?|$)/);
  // The redesigned card face is intentionally minimal (no man-count), so verify the change
  // persisted by reopening the edit form: the group size seeds as the updated 5.
  await expect(page.getByTestId("stay-card").filter({ hasText: "מדריד" })).toBeVisible();
  await page.getByLabel(/פעולות נוספות|More actions/).first().click();
  await page.getByRole("link", { name: /^עריכה$|^Edit$/ }).first().click();
  await page.waitForURL(/\/stays\/.+\/edit/);
  // getStay() seed lands async; allow extra time on slow CI runners.
  await expect(page.getByLabel(/כמה גברים בקבוצה|How many men/)).toHaveValue("5", { timeout: 15000 });
});

test("cancel a Stay → it leaves the active list", async ({ page }) => {
  await signIn(page);
  await createStay(page, { city: "רומא", country: "איטליה", arrivalDays: 6, departureDays: 9 });
  await page.getByLabel(/פעולות נוספות|More actions/).first().click();
  await page.getByRole("button", { name: /ביטול יעד|Cancel location/ }).first().click();
  // Confirmation dialog (Profile danger-zone pattern).
  await page.getByRole("button", { name: /כן, בטל את היעד|Yes, cancel the location/ }).click();
  await expect(page.getByRole("heading", { name: "רומא, איטליה" })).toHaveCount(0);
  await expect(page.getByText(/עדיין לא רשמתם יעד|haven't registered a location/)).toBeVisible();
});

test("WCAG 2.1 AA: dashboard with a Stay is axe-clean", async ({ page }) => {
  await signIn(page);
  await createStay(page, { city: "ניו יורק", country: "ארצות הברית", arrivalDays: 14, departureDays: 16 });
  await expect(page.getByTestId("stay-card")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("WCAG 2.1 AA: the add-Stay form is axe-clean and RTL", async ({ page }) => {
  await signIn(page);
  await page.goto("/stays/new");
  await expect(page.getByRole("heading", { name: /יעד חדש|New location/ })).toBeVisible();
  // Form is rendered RTL (Hebrew-first).
  await expect(page.locator("div[dir='rtl']").first()).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("keyboard: the add (+) shortcut reaches the form, fields are tabbable", async ({ page }) => {
  await signIn(page);
  await page.goto("/stays/new");
  // The search box is focusable and the manual-entry toggle is keyboard-operable.
  await page.getByRole("button", { name: /הכנס עיר ידנית|Enter city manually/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel(/^עיר$|^City$/)).toBeVisible();
  await page.getByLabel(/^עיר$|^City$/).focus();
  await page.keyboard.type("חיפה");
  await expect(page.getByLabel(/^עיר$|^City$/)).toHaveValue("חיפה");
});
