import { Hono } from "hono";
import { CreateEventInput, UpdateEventInput, CreateAttendanceInput, UpdateAttendanceInput, CreateCommitmentInput, UpdateCommitmentInput, flagContentSchema } from "@minyanim/shared";
import { buildCtx } from "../lib/context";
import { requireUserId, optionalUserId } from "../lib/auth";
import {
  createEventController,
  getMinyanController,
  updateMinyanController,
  cancelMinyanController,
} from "../controllers/eventController";
import { minyanZmanimController } from "../controllers/zmanimController";
import { commit, changeCommitment, withdraw, transferHost } from "../services/commitmentService";
import { requestOrJoin, changePartySize, cancel as cancelAttendance, listRequests, approve, decline } from "../services/attendanceService";
import { claimRole, releaseRole } from "../services/roleService";
import { flagContent } from "../services/moderationService";
import { createDb } from "../db/client";
import { EventRoleSchema } from "@minyanim/shared";
import type { Env } from "../env";
import type { Logger } from "../lib/logger";

export const events = new Hono<{ Bindings: Env; Variables: { log: Logger } }>();

/** Map Zod issues to the keyed error envelope (message = code). */
function envelope(issues: readonly { path: PropertyKey[]; message: string }[]) {
  return { errors: issues.map((i) => ({ field: i.path.map(String).join("."), code: i.message })) };
}

/** POST /api/events — create any event type (minyan or gathering) (auth). */
events.post("/api/events", async (c) => {
  const userId = await requireUserId(c);
  const parsed = CreateEventInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(envelope(parsed.error.issues), 400);
  return c.json(await createEventController(buildCtx(c), userId, parsed.data), 201);
});

/** GET /api/events/:id — viewer-appropriate shape; public (optional auth) for the join link (D13). */
events.get("/api/events/:id", async (c) => {
  const viewerId = await optionalUserId(c);
  return c.json(await getMinyanController(buildCtx(c), viewerId, c.req.param("id")));
});

/** GET /api/events/:id/zmanim — public Shabbat zmanim for a hosted Minyan (005 D9/R10). */
events.get("/api/events/:id/zmanim", async (c) => {
  const res = await minyanZmanimController(createDb(c.env.DB), c.req.param("id"));
  c.header("cache-control", "public, max-age=3600");
  return c.json(res);
});

/** PATCH /api/events/:id — host-only edit. */
events.patch("/api/events/:id", async (c) => {
  const userId = await requireUserId(c);
  const parsed = UpdateEventInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(envelope(parsed.error.issues), 400);
  return c.json(await updateMinyanController(buildCtx(c), userId, c.req.param("id"), parsed.data));
});

/** POST /api/events/:id/cancel — host-only soft cancel (requires confirm). */
/** POST /api/events/:id/transfer-host — reassign host to a committed participant (013 guard). */
events.post("/api/events/:id/transfer-host", async (c) => {
  const userId = await requireUserId(c);
  const body = (await c.req.json().catch(() => ({}))) as { newHostUserId?: string };
  if (!body.newHostUserId) return c.json({ errors: [{ field: "newHostUserId", code: "message.recipient_required" }] }, 400);
  await transferHost(buildCtx(c), userId, c.req.param("id"), body.newHostUserId);
  return c.json({ ok: true });
});

events.post("/api/events/:id/cancel", async (c) => {
  const userId = await requireUserId(c);
  const body = (await c.req.json().catch(() => ({}))) as { confirm?: boolean };
  return c.json(await cancelMinyanController(buildCtx(c), userId, c.req.param("id"), body.confirm === true));
});

/** POST /api/events/:id/commit — join the gathering with a party size (US3). */
events.post("/api/events/:id/commit", async (c) => {
  const userId = await requireUserId(c);
  const parsed = CreateCommitmentInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(envelope(parsed.error.issues), 400);
  return c.json(await commit(buildCtx(c), userId, c.req.param("id"), parsed.data), 201);
});

/** PATCH /api/events/:id/commit — change the caller's party size. */
events.patch("/api/events/:id/commit", async (c) => {
  const userId = await requireUserId(c);
  const parsed = UpdateCommitmentInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(envelope(parsed.error.issues), 400);
  return c.json({ minyan: await changeCommitment(buildCtx(c), userId, c.req.param("id"), parsed.data.numMen) });
});

/** DELETE /api/events/:id/commit — withdraw the caller's commitment. */
events.delete("/api/events/:id/commit", async (c) => {
  const userId = await requireUserId(c);
  await withdraw(buildCtx(c), userId, c.req.param("id"));
  return c.json({ ok: true });
});

/** POST /api/events/:id/attendance — join / request a seat (generalized RSVP, 014). */
events.post("/api/events/:id/attendance", async (c) => {
  const userId = await requireUserId(c);
  const parsed = CreateAttendanceInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(envelope(parsed.error.issues), 400);
  return c.json(await requestOrJoin(buildCtx(c), userId, c.req.param("id"), parsed.data));
});

/** PATCH /api/events/:id/attendance — change the caller's own party size. */
events.patch("/api/events/:id/attendance", async (c) => {
  const userId = await requireUserId(c);
  const parsed = UpdateAttendanceInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(envelope(parsed.error.issues), 400);
  return c.json(await changePartySize(buildCtx(c), userId, c.req.param("id"), parsed.data));
});

/** DELETE /api/events/:id/attendance — cancel the caller's own attendance (open mode may promote). */
events.delete("/api/events/:id/attendance", async (c) => {
  const userId = await requireUserId(c);
  await cancelAttendance(buildCtx(c), userId, c.req.param("id"));
  return c.json({ ok: true });
});

/** GET /api/events/:id/requests — host-only pending-request queue (approval mode). */
events.get("/api/events/:id/requests", async (c) => {
  const userId = await requireUserId(c);
  return c.json({ requests: await listRequests(buildCtx(c), userId, c.req.param("id")) });
});

/** POST /api/events/:id/requests/:attendanceId/approve — host approves a pending request. */
events.post("/api/events/:id/requests/:attendanceId/approve", async (c) => {
  const userId = await requireUserId(c);
  return c.json(await approve(buildCtx(c), userId, c.req.param("id"), c.req.param("attendanceId")));
});

/** POST /api/events/:id/requests/:attendanceId/decline — host declines a pending request. */
events.post("/api/events/:id/requests/:attendanceId/decline", async (c) => {
  const userId = await requireUserId(c);
  return c.json(await decline(buildCtx(c), userId, c.req.param("id"), c.req.param("attendanceId")));
});

/** POST /api/events/:id/roles/:role — claim a prayer-role slot (US4). */
events.post("/api/events/:id/roles/:role", async (c) => {
  const userId = await requireUserId(c);
  const role = EventRoleSchema.safeParse(c.req.param("role"));
  if (!role.success) return c.json({ errors: [{ field: "role", code: "resource.not_found" }] }, 404);
  return c.json({ minyan: await claimRole(buildCtx(c), userId, c.req.param("id"), role.data) });
});

/** DELETE /api/events/:id/roles/:role — release a role the caller holds. */
events.delete("/api/events/:id/roles/:role", async (c) => {
  const userId = await requireUserId(c);
  const role = EventRoleSchema.safeParse(c.req.param("role"));
  if (!role.success) return c.json({ errors: [{ field: "role", code: "resource.not_found" }] }, 404);
  return c.json({ minyan: await releaseRole(buildCtx(c), userId, c.req.param("id"), role.data) });
});

/** POST /api/events/:id/flag — flag a Minyan for moderation (006). Idempotent per reporter; the 3rd
 * distinct reporter auto-hides it (server-side). `contentType` is fixed by the route, not the body. */
events.post("/api/events/:id/flag", async (c) => {
  const userId = await requireUserId(c);
  const parsed = flagContentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) }, 400);
  }
  await flagContent(createDb(c.env.DB), "event", c.req.param("id"), userId, parsed.data, buildCtx(c));
  return c.json({ ok: true });
});
