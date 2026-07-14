import { test, expect, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Feature 008 — in-app messaging. Drives a real two-party send/receive through the UI (two isolated
 * browser contexts), plus the inbox render + axe. accept_messages defaults ON, so the happy path
 * needs no opt-in. Polling can lag cross-context, so the recipient opens the thread with a fresh
 * navigation (immediate fetch) rather than waiting on the background poll.
 */

const uniqEmail = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** New isolated browser context + page, signed in as a fresh user; returns the page + its user id. */
async function newUser(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqEmail(name);
  await page.request.post("/api/auth/sign-up/email", { data: { name, email, password: "password123" } });
  await page.request.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
  const id = ((await (await page.request.get("/api/me")).json()) as { id: string }).id;
  return { context, page, id };
}

test("send a message via the UI → it appears for both sender and recipient", async ({ browser }) => {
  const sender = await newUser(browser, "sender");
  const recipient = await newUser(browser, "recipient");
  try {
    const body = `שלום 008 ${Date.now()}`; // unique so it can't collide with other data

    // Sender opens the thread with the recipient and sends.
    await sender.page.goto(`/messages/${recipient.id}`);
    await sender.page.getByPlaceholder(/כתבו הודעה|Write a message/).fill(body);
    await sender.page.getByRole("button", { name: /שליחה|Send/ }).click();
    // The bubble renders immediately on the sender's side (onSuccess invalidation, not the poll).
    await expect(sender.page.getByText(body)).toBeVisible();
    expect((await new AxeBuilder({ page: sender.page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);

    // The recipient opens the thread fresh and sees the same message.
    await recipient.page.goto(`/messages/${sender.id}`);
    await expect(recipient.page.getByText(body)).toBeVisible();
  } finally {
    await sender.context.close();
    await recipient.context.close();
  }
});

test("the inbox lists a conversation and is WCAG-clean (axe)", async ({ browser }) => {
  const sender = await newUser(browser, "inboxer");
  const recipient = await newUser(browser, "peer");
  try {
    const body = `הודעת תיבה ${Date.now()}`;
    // Seed one message via the API, then assert it renders on the inbox screen.
    const res = await sender.page.request.post("/api/messages", { data: { recipientUserId: recipient.id, body } });
    expect(res.status()).toBe(201);

    await sender.page.goto("/messages");
    await expect(sender.page.getByRole("heading", { name: /^הודעות$|^Messages$/ })).toBeVisible();
    await expect(sender.page.getByText("peer").first()).toBeVisible(); // conversation shows the correspondent's name
    await expect(sender.page.getByText(body)).toBeVisible(); // ...and the last body
    expect((await new AxeBuilder({ page: sender.page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  } finally {
    await sender.context.close();
    await recipient.context.close();
  }
});
