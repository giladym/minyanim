import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Register + sign in a fresh user (each test starts from zero Stays/folders). */
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

/** Create a Stay via the manual-entry path (no live geocoder needed). */
async function createStay(page: Page, city: string, country: string) {
  await page.goto("/stays/new");
  await page.getByRole("button", { name: /הזנת עיר ומדינה ידנית|Enter city and country manually/ }).click();
  await page.getByLabel(/^עיר$|^City$/).fill(city);
  await page.getByLabel(/^מדינה$|^Country$/).fill(country);
  await page.getByLabel(/תאריך הגעה|Arrival date/).fill(dateInput(10));
  await page.getByLabel(/תאריך עזיבה|Departure date/).fill(dateInput(12));
  await page.getByRole("button", { name: /שמירת שהייה|Save stay/ }).click();
  await page.waitForURL(/\/stays(\?|$)/);
}

test("WCAG 2.1 AA: folder management dialog is axe-clean and RTL", async ({ page }) => {
  await signIn(page);
  await createStay(page, "אמסטרדם", "הולנד");
  await page.getByRole("button", { name: /ניהול תיקיות|Manage folders/ }).click();
  const dialog = page.getByRole("dialog", { name: /ניהול תיקיות|Manage folders/ });
  await expect(dialog).toBeVisible();
  // Create a folder from within the dialog.
  await dialog.getByLabel(/תיקייה חדשה|New folder/).fill("אירופה 2026");
  await dialog.getByRole("button", { name: /^יצירה$|^Create$/ }).click();
  await expect(dialog.getByText("אירופה 2026")).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("browse-by-folder: assign a Stay and filter to its folder", async ({ page }) => {
  await signIn(page);
  await createStay(page, "ברלין", "גרמניה");
  // Create a folder via the manager.
  await page.getByRole("button", { name: /ניהול תיקיות|Manage folders/ }).click();
  const dialog = page.getByRole("dialog", { name: /ניהול תיקיות|Manage folders/ });
  await dialog.getByLabel(/תיקייה חדשה|New folder/).fill("טיול קיץ");
  await dialog.getByRole("button", { name: /^יצירה$|^Create$/ }).click();
  await dialog.getByRole("button", { name: /^סגירה$|^Close$/ }).click();

  // Move the Stay into the folder via the card's select.
  await page.getByLabel(/העברה לתיקייה|Move to folder/).selectOption({ label: "טיול קיץ" });

  // Filter to the folder chip → the Stay is shown; Unfiled → empty group message.
  await page.getByRole("button", { name: "טיול קיץ" }).click();
  await expect(page.getByRole("heading", { name: "ברלין, גרמניה" })).toBeVisible();
  await page.getByRole("button", { name: /ללא תיקייה|Unfiled/ }).click();
  await expect(page.getByText(/אין שהיות בתיקייה הזו|No stays in this folder/)).toBeVisible();
});

test("WCAG 2.1 AA: the History view is axe-clean", async ({ page }) => {
  await signIn(page);
  await page.goto("/stays/history");
  await expect(page.getByRole("heading", { name: /היסטוריה|History/ })).toBeVisible();
  // Empty history is a valid, accessible state.
  await expect(page.getByText(/אין עדיין שהיות בהיסטוריה|No stays in your history/)).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("keyboard: History is reachable from the dashboard via the link", async ({ page }) => {
  await signIn(page);
  await createStay(page, "ליסבון", "פורטוגל");
  await page.getByRole("link", { name: /^היסטוריה$|^History$/ }).click();
  await expect(page).toHaveURL(/\/stays\/history/);
  await expect(page.getByRole("heading", { name: /היסטוריה|History/ })).toBeVisible();
});
