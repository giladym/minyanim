import { test, expect } from "@playwright/test";

const day = (d: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const epoch = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
const minyanPayload = () => ({
  type: "minyan", city: "ורשה", country: "פולין", lat: 52.23, lng: 21.01,
  addressPrivate: null, addressNotes: null, eventDate: epoch(day(21)), notes: null,
  minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] },
  hostNumMen: 1,
});

// 013 follow-up: reassigning a minyan's host notifies participants (host_changed).
test("transfer-host sends a host_changed notification to participants", async ({ playwright, baseURL }) => {
  const host = await playwright.request.newContext({ baseURL });
  const guest = await playwright.request.newContext({ baseURL });
  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

  for (const [ctx, name, email] of [[host, "מארח", uniq("host")], [guest, "אורח", uniq("guest")]] as const) {
    await ctx.post("/api/auth/sign-up/email", { data: { name, email, password: "password123" } });
    await ctx.post("/api/auth/sign-in/email", { data: { email, password: "password123" } });
  }

  const eventId = (await (await host.post("/api/events", { data: minyanPayload() })).json()).id;
  await guest.post(`/api/events/${eventId}/commit`, { data: { numMen: 1 } });

  // Find the guest's user id from the host's participant view, then reassign hosting to them.
  const participants = (await (await host.get(`/api/events/${eventId}`)).json()).participants as Array<{ userId: string; isHost?: boolean }>;
  const guestId = participants.find((p) => !p.isHost)!.userId;
  const res = await host.post(`/api/events/${eventId}/transfer-host`, { data: { newHostUserId: guestId } });
  expect(res.ok()).toBeTruthy();

  // The (new host) participant receives a host_changed in-app notification.
  const inbox = await (await guest.get("/api/notifications")).json();
  expect((inbox.notifications as Array<{ kind: string }>).some((n) => n.kind === "host_changed")).toBeTruthy();
});
