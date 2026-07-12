import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Feature 014 — multi-type events e2e + WCAG (axe). Drives the flagship MISSION flow end-to-end
 * through the real running Worker (quickstart Scenario A): host a hosting event → traveler requests a
 * seat → address hidden while pending → host approves → address revealed (SC-002/SC-003). Plus axe
 * scans of the new surfaces (kind picker, hosting form, hosting detail, discovery filters).
 * GEO_MODE=mock (London), rate-limit + email-verify disabled by the playwright webServer config.
 */

const uniqEmail = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const dateInput = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const epoch = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);

/** Register + sign in a fresh user on the given page/request context. */
async function signIn(page: Page, name = "נוסע בדיקה") {
  const email = uniqEmail("u");
  await page.request.post("/api/auth/sign-up/email", { data: { name, email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
}

/** A hosting-event (gathering, category=hosting) create body near London (GEO_MODE=mock coords). */
const hostingPayload = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

test("mission flow: request→approve reveals the address only after approval (SC-002/SC-003)", async ({ playwright, baseURL }) => {
  const host = await playwright.request.newContext({ baseURL });
  const traveler = await playwright.request.newContext({ baseURL });
  for (const [ctx, name, prefix] of [[host, "מארח", "host"], [traveler, "נוסע", "trav"]] as const) {
    await ctx.post("/api/auth/sign-up/email", { data: { name, email: uniqEmail(prefix), password: "password123" } });
  }
  // sign-up signs in; but re-sign-in defensively so the cookie is fresh.
  // (sign-up above used a throwaway email per ctx; sign the same ctx in is unnecessary — cookies persist.)

  // Host creates a hosting event (approval mode, 4 seats).
  const created = await host.post("/api/events", { data: hostingPayload() });
  expect(created.ok()).toBeTruthy();
  const eventId = (await created.json()).id as string;

  // Traveler requests a seat → pending; the exact address MUST NOT be visible yet (SC-003).
  const req = await traveler.post(`/api/events/${eventId}/attendance`, { data: { partySize: 2 } });
  expect(req.ok()).toBeTruthy();
  const pendingView = await (await traveler.get(`/api/events/${eventId}`)).json();
  expect(pendingView.addressPrivate ?? null).toBeNull();
  expect(JSON.stringify(pendingView)).not.toContain("12 Hosting Street");

  // Host sees the pending request and approves it.
  const requests = (await (await host.get(`/api/events/${eventId}/requests`)).json()).requests as Array<{
    attendanceId: string;
    partySize: number;
  }>;
  expect(requests.length).toBe(1);
  expect(requests[0].partySize).toBe(2);
  const approve = await host.post(`/api/events/${eventId}/requests/${requests[0].attendanceId}/approve`);
  expect(approve.ok()).toBeTruthy();

  // Now (and only now) the traveler sees the exact address + entry notes (SC-002).
  const confirmedView = await (await traveler.get(`/api/events/${eventId}`)).json();
  expect(confirmedView.addressPrivate).toContain("12 Hosting Street");
  expect(confirmedView.addressNotes).toContain("צלצלו פעמיים");
});

test("capacity holds: a 5th seat cannot be confirmed beyond a 4-seat meal (SC-006)", async ({ playwright, baseURL }) => {
  const host = await playwright.request.newContext({ baseURL });
  await host.post("/api/auth/sign-up/email", { data: { name: "מארח", email: uniqEmail("host2"), password: "password123" } });
  const eventId = (await (await host.post("/api/events", { data: hostingPayload({ capacity: 4 }) })).json()).id as string;

  // Five travelers each request a party of 1; approving the 5th must fail capacity.full.
  const outcomes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = await playwright.request.newContext({ baseURL });
    await t.post("/api/auth/sign-up/email", { data: { name: `נוסע ${i}`, email: uniqEmail(`t${i}`), password: "password123" } });
    await t.post(`/api/events/${eventId}/attendance`, { data: { partySize: 1 } });
  }
  const reqs = (await (await host.get(`/api/events/${eventId}/requests`)).json()).requests as Array<{ attendanceId: string }>;
  for (const r of reqs) {
    const res = await host.post(`/api/events/${eventId}/requests/${r.attendanceId}/approve`);
    outcomes.push(res.status());
  }
  // Four approvals succeed (200), the fifth is rejected 400 capacity.full — never a 5th confirmed seat.
  expect(outcomes.filter((s) => s === 200).length).toBe(4);
  expect(outcomes.filter((s) => s === 400).length).toBe(1);
});

test("kind picker + hosting form are WCAG-clean (axe)", async ({ page }) => {
  await signIn(page);
  await page.goto("/event/new");
  // The kind picker shows three kind cards (מניין / אירוח / מפגש); assert the first rendered.
  await expect(page.getByText(/מניין|אירוח|מפגש/).first()).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);

  await page.goto("/event/new?kind=hosting");
  await page.waitForLoadState("networkidle");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
});

test("hosting detail reveals the address to the host and is WCAG-clean (axe)", async ({ page }) => {
  await signIn(page, "מארח");
  const eventId = (await (await page.request.post("/api/events", { data: hostingPayload() })).json()).id as string;
  await page.goto(`/event/${eventId}`);
  await expect(page.getByText("12 Hosting Street", { exact: false })).toBeVisible(); // host sees the exact address
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
});

test("discovery with kind filters is WCAG-clean (axe)", async ({ page }) => {
  await signIn(page);
  await page.goto("/discovery");
  await page.getByLabel(/חיפוש עיר|Search a city/).fill("London");
  await page.getByRole("button", { name: /London, United Kingdom/ }).click();
  await page.getByLabel(/מתאריך|^From$/).fill(dateInput(7));
  await page.getByLabel(/עד תאריך|^To$/).fill(dateInput(40));
  // The kind-filter chips render from EVENT_KINDS regardless of results.
  await expect(page.getByRole("button", { name: /מניינים|אירוח|מפגש/ }).first()).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
});

test("regression: hosting a minyan still reveals the address to the host and is WCAG-clean (SC-005)", async ({ page }) => {
  await signIn(page, "מארח מניין");
  const minyanBody = {
    type: "minyan",
    city: "London",
    country: "United Kingdom",
    lat: 51.5074,
    lng: -0.1278,
    addressPrivate: "9 Minyan Lane, London",
    eventDate: epoch(dateInput(14)),
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] },
    hostNumMen: 1,
  };
  const eventId = (await (await page.request.post("/api/events", { data: minyanBody })).json()).id as string;
  await page.goto(`/minyan/${eventId}`);
  await expect(page.getByText("9 Minyan Lane", { exact: false })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
});
