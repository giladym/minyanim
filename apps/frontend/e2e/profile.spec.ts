import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: import("@playwright/test").Page) {
  const email = `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.request.post("/api/auth/sign-up/email", { data: { name: "Test", email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}

test("profile page: renders, adds a phone, axe AA clean", async ({ page }) => {
  await signIn(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: /הפרופיל שלי|My profile/ })).toBeVisible();
  // 012: the avatar upload control is present + accessible (its section is axe-scanned below).
  await expect(page.getByRole("button", { name: /הוספת תמונה|Add photo/ })).toBeVisible();

  // Add a phone: pick a country (defaults to Israel/+972) + a local number → normalized to E.164.
  await page.getByLabel(/מספר טלפון|Phone number/).fill("0501234999");
  await page.getByRole("button", { name: /הוספת מספר|Add number/ }).click();
  await expect(page.getByText("+972501234999")).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("delete account: confirm → signed out, access removed", async ({ page }) => {
  await signIn(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: /מחיקת החשבון שלי|Delete my account/ }).click();
  await page.getByRole("button", { name: /כן, מחקו|Yes, delete/ }).click();
  await page.waitForURL(/\/$/);
  // Session gone → protected route bounces to sign-in.
  await page.goto("/stays");
  await expect(page).toHaveURL(/\/sign-in/);
});
