import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Feature 015 — a location (Stay/יעד) holds 0…N events. Covers the 015-specific UI surface: the
 * "האירועים שלי כאן" list on the location edit page, the event-count chip on the dashboard card, and
 * the "＋ הוסף אירוע" → KindPicker entry point (carrying fromStay so the new event links to the stay).
 * The linked event is created via the API (like multi-type-events.spec) to keep the UI assertions
 * focused + non-flaky. GEO_MODE=mock (London); email-verify + rate-limit disabled by the webServer.
 */

const uniqEmail = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const dateInput = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const epoch = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);

/** Register + sign in a fresh user on the page's request context. */
async function signIn(page: Page, name = "בעל יעד") {
  const email = uniqEmail("u");
  await page.request.post("/api/auth/sign-up/email", { data: { name, email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}

/** A Stay near London (real coords so a from-stay event can prefill location). */
const stayPayload = (over: Record<string, unknown> = {}) => ({
  city: "London",
  country: "United Kingdom",
  lat: 51.5074,
  lng: -0.1278,
  addressPrivate: "1 Location Street",
  arrivalDate: epoch(dateInput(10)),
  departureDate: epoch(dateInput(16)),
  numMen: 4,
  ...over,
});

/** A hosting gathering attached to a Stay via event.stay_id (the 015 link). */
const hostingPayload = (stayId: string) => ({
  type: "gathering",
  category: "hosting",
  title: "סעודת שבת אצל משפחת כהן",
  city: "London",
  country: "United Kingdom",
  lat: 51.5074,
  lng: -0.1278,
  addressPrivate: "12 Hosting Street, London",
  addressNotes: "צלצלו פעמיים",
  eventDate: epoch(dateInput(14)),
  startTime: "18:30",
  occasion: "shabbat",
  rsvpMode: "approval",
  visibility: "public",
  capacity: 4,
  hostNumMen: 1,
  gathering: { mealType: "shabbat_dinner", kashrut: "glatt", dietary: ["vegetarian"], alcohol: true },
  stayId,
});

test("a location lists its linked events (edit page) + shows a count chip (card), and is axe-clean", async ({ page }) => {
  await signIn(page);
  const stayId = (await (await page.request.post("/api/stays", { data: stayPayload() })).json()).id as string;
  const ev = await page.request.post("/api/events", { data: hostingPayload(stayId) });
  expect(ev.ok()).toBeTruthy();
  const eventId = (await ev.json()).id as string;

  // The edit page shows the "my events here" section with a row linking to the event.
  await page.goto(`/stays/${stayId}/edit`);
  await expect(page.getByRole("heading", { name: /האירועים שלי כאן|My events here/ })).toBeVisible();
  await expect(page.locator(`a[href*="${eventId}"]`)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);

  // The dashboard card carries an event-count chip (loaded async per card — allow it time).
  await page.goto("/stays");
  const card = page.getByTestId("stay-card");
  await expect(card).toBeVisible();
  await expect(card.getByText(/אירוע|event/i).first()).toBeVisible({ timeout: 15000 });
});

test("＋ add-event from a location opens the kind picker carrying fromStay", async ({ page }) => {
  await signIn(page);
  const stayId = (await (await page.request.post("/api/stays", { data: stayPayload() })).json()).id as string;

  await page.goto(`/stays/${stayId}/edit`);
  await expect(page.getByRole("heading", { name: /האירועים שלי כאן|My events here/ })).toBeVisible();

  // The add control links to /event/new?fromStay=<stayId> → the KindPicker.
  await page.getByRole("link", { name: /הוסף אירוע|Add event/ }).click();
  await page.waitForURL(/\/event\/new\?.*fromStay=/);

  await expect(page.getByRole("radiogroup")).toBeVisible();
  await expect(page.getByRole("radio", { name: /מניין|Minyan/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /אירוח|Hosting/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /מפגש|Gathering/ })).toBeVisible();
});
