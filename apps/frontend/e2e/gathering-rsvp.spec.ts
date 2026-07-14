import { test, expect, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Feature 014 — the mission request→approve flow driven through the UI (the existing
 * multi-type-events.spec covers it API-only). A traveler requests a seat on an approval-mode hosting
 * gathering; the exact address stays hidden while pending (SC-003); the host approves via the
 * RequestsPanel; after a reload the traveler is confirmed and the address is revealed (SC-002).
 * Two isolated browser contexts (host + traveler). Cross-context updates don't push (5s poll,
 * background-throttled), so we navigate/reload explicitly rather than await the poll.
 */

const uniqEmail = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const dateInput = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const epoch = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);

/** `name` is the (possibly Hebrew) display name; `prefix` MUST be ASCII (it forms the email local-part). */
async function newUser(browser: Browser, name: string, prefix: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqEmail(prefix);
  await page.request.post("/api/auth/sign-up/email", { data: { name, email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
  return { context, page };
}

const hostingPayload = () => ({
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
});

test("UI: request → address hidden while pending → host approves → address revealed", async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await newUser(browser, "מארח", "host");
  const traveler = await newUser(browser, "נוסע", "trav");
  try {
    const created = await host.page.request.post("/api/events", { data: hostingPayload() });
    expect(created.ok(), `create event failed: ${created.status()} ${await created.text()}`).toBeTruthy();
    const eventId = ((await created.json()) as { id: string }).id;
    expect(eventId, "event id missing from create response").toBeTruthy();

    // Traveler requests a seat via the RSVP band.
    await traveler.page.goto(`/event/${eventId}`);
    await traveler.page.getByRole("button", { name: /בקשת מקום|Request a seat/ }).click();
    await expect(traveler.page.getByText(/בקשתכם נשלחה|Your request was sent/)).toBeVisible();
    // SC-003: the exact address must NOT be in the DOM while pending.
    await expect(traveler.page.getByText("12 Hosting Street")).toHaveCount(0);

    // Host opens the event (fresh nav → sees the pending request) and approves it.
    await host.page.goto(`/event/${eventId}`);
    await expect(host.page.getByRole("heading", { name: /בקשות ממתינות|Pending requests/ })).toBeVisible();
    await host.page.getByRole("button", { name: /אישור|Approve/ }).first().click();
    // The only pending request clears.
    await expect(host.page.getByRole("button", { name: /אישור —|Approve —/ })).toHaveCount(0);

    // Traveler reloads → confirmed, and the exact address is now revealed (SC-002).
    await traveler.page.reload();
    await expect(traveler.page.getByText("12 Hosting Street", { exact: false })).toBeVisible();
    expect((await new AxeBuilder({ page: traveler.page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  } finally {
    await host.context.close();
    await traveler.context.close();
  }
});
