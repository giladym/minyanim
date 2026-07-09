import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: Page, email: string) {
  await page.request.post("/api/auth/sign-up/email", { data: { name: "T", email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}

// GEO_MODE=mock resolves to London; seed a place there via the admin API, then view it as a user.
const LON = { lat: 51.5074, lng: -0.1278 };

test("kosher-places view is WCAG-clean and lists nearby places with navigation", async ({ page }) => {
  await signIn(page, "admin-e2e@example.com"); // allowlisted admin (also a normal signed-in user)
  // Unique name per run — desktop + mobile projects share the dev D1, so a fixed name would collide.
  const placeName = `בית כנסת ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const layer = await (await page.request.post("/api/admin/layers", { data: { name: `worship-${Date.now()}-${Math.floor(Math.random() * 1e6)}` } })).json();
  await page.request.post("/api/admin/places", { data: { layerId: layer.id, name: placeName, lat: LON.lat, lng: LON.lng, address: "1 Test Rd" } });

  await page.goto(`/places?lat=${LON.lat}&lng=${LON.lng}`);
  await expect(page.getByText(placeName)).toBeVisible();
  // One-tap navigation link is present.
  await expect(page.getByRole("link", { name: "Google Maps" }).first()).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});
