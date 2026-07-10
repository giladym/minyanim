import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Register + sign in a user with a specific email (admin-e2e@example.com is the allowlisted admin). */
async function signIn(page: Page, email: string) {
  await page.request.post("/api/auth/sign-up/email", { data: { name: "אדמין", email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}

test("admin surface is WCAG-clean and an admin can manage layers", async ({ page }) => {
  await signIn(page, "admin-e2e@example.com"); // in the ADMIN_EMAILS allowlist (playwright.config)
  await page.goto("/admin");

  // The layers manager (default tab) renders for an admin.
  await expect(page.getByRole("heading", { name: /ניהול|Management/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^הוספה$|^Add$/ })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);

  // Places tab is reachable and also axe-clean.
  await page.getByRole("link", { name: /^מקומות$|^Places$/ }).click();
  await expect(page.getByLabel(/שם המקום|Place name/)).toBeVisible();
  const placesAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(placesAxe.violations).toEqual([]);

  // Moderation queue tab (006 US3) — empty state, axe-clean.
  await page.getByRole("link", { name: /^פיקוח$|^Moderation$/ }).click();
  await expect(page.getByText(/אין פריטים הממתינים לטיפול|Nothing awaiting review/)).toBeVisible();
  const modAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(modAxe.violations).toEqual([]);

  // Metrics tab (006 US5) — the funnel + counts render and are axe-clean.
  await page.getByRole("link", { name: /^מדדים$|^Metrics$/ }).click();
  await expect(page.getByText(/הגיעו למניין|Reached quorum/)).toBeVisible();
  const metricsAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(metricsAxe.violations).toEqual([]);
});

test("a non-admin is redirected away from /admin", async ({ page }) => {
  await signIn(page, `u-${Date.now()}@example.com`); // not in the allowlist
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/stays(\?|$)/);
});
