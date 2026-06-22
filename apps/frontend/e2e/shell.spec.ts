import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Authenticate via the API (test-auth path: verification disabled on the e2e backend),
// then exercise the authenticated app shell.
async function signIn(page: import("@playwright/test").Page) {
  const email = `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.request.post("/api/auth/sign-up/email", { data: { name: "Test", email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}

test("authenticated shell renders with header + nav, no WCAG AA violations", async ({ page }) => {
  await signIn(page);
  await page.goto("/stays");
  await expect(page.getByRole("heading", { name: /המיקומים|My Locations/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /חיפוש|Search/ })).toBeVisible();
  await expect(page.getByTestId("hebrew-date")).toBeAttached(); // Hebrew calendar widget (US4)
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("theme toggle persists across reload", async ({ page }) => {
  await signIn(page);
  await page.goto("/stays");
  const html = page.locator("html");
  await page.getByRole("button", { name: /מצב תצוגה|Theme/ }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
});
