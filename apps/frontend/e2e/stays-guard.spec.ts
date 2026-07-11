import { test, expect, type Page } from "@playwright/test";

/** Register + sign in a fresh user, returning helpers bound to their session (page.request keeps cookies). */
async function signIn(page: Page, email: string) {
  await page.request.post("/api/auth/sign-up/email", { data: { name: "מארח בדיקה", email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}
const dayISO = (d: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const epoch = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);

// 013: editing a Stay's location when a minyan is linked to it must warn (not save silently).
test("location-change guard fires when a minyan is linked to the stay", async ({ page }) => {
  const email = `host-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await signIn(page, email);

  // Setup via API: a stay, then a minyan hosted FROM it (persists the stay→minyan link).
  const stayRes = await page.request.post("/api/stays", {
    data: {
      city: "ורשה", country: "פולין", lat: 52.23, lng: 21.01, addressPrivate: null,
      arrivalDate: epoch(dayISO(20)), departureDate: epoch(dayISO(24)), numMen: 1,
      bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
      contactName: null, contactPhone: null, contactEmail: null, groupMembers: null, notes: null, folderId: null,
    },
  });
  const stay = await stayRes.json();
  await page.request.post("/api/events", {
    data: {
      type: "minyan", city: "ורשה", country: "פולין", lat: 52.23, lng: 21.01,
      addressPrivate: null, addressNotes: null, eventDate: epoch(dayISO(22)), notes: null,
      minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] },
      hostNumMen: 1, stayId: stay.id,
    },
  });

  // Edit the stay, change the city, and save → the guard must appear listing the linked minyan.
  await page.goto(`/stays/${stay.id}/edit`);
  await page.getByRole("button", { name: /שנה מיקום|Change location/ }).click();
  await page.getByRole("button", { name: /הכנס עיר ידנית|Enter city manually/ }).click();
  await page.getByLabel(/^עיר$|^City$/).fill("קרקוב");
  await page.getByRole("button", { name: /עדכון היעד|Update destination/ }).click();

  // Guard dialog, listing the minyan as host-owned, with the choice actions.
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/מיקום היעד השתנה|Destination location changed/)).toBeVisible();
  await expect(page.getByText(/אתם המארגנים|You organize/)).toBeVisible();
  await expect(page.getByRole("button", { name: /שכפלו ליעד חדש|Duplicate/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /נתקו את המניינים|unlink/ })).toBeVisible();
});
