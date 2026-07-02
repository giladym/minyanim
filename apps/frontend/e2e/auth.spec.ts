import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("sign-in page renders Google + email/password", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  await expect(page.getByRole("textbox").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /התחברות|Sign in/ }).last()).toBeVisible();
});

test("sign-in page has no WCAG 2.1 AA violations", async ({ page }) => {
  await page.goto("/sign-in");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("protected /stays redirects to sign-in when unauthenticated", async ({ page }) => {
  await page.goto("/stays");
  await expect(page).toHaveURL(/\/sign-in/);
});
