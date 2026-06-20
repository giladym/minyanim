import { Hono } from "hono";
import { CreateEventInput, UpdateEventInput, CreateCommitmentInput, UpdateCommitmentInput } from "@minyanim/shared";
import { buildCtx } from "../lib/context";
import { requireUserId, optionalUserId } from "../lib/auth";
import {
  hostMinyanController,
  getMinyanController,
  updateMinyanController,
  cancelMinyanController,
} from "../controllers/eventController";
import { commit, changeCommitment, withdraw } from "../services/commitmentService";
import type { Env } from "../env";
import type { Logger } from "../lib/logger";

export const events = new Hono<{ Bindings: Env; Variables: { log: Logger } }>();

/** Map Zod issues to the keyed error envelope (message = code). */
function envelope(issues: readonly { path: PropertyKey[]; message: string }[]) {
  return { errors: issues.map((i) => ({ field: i.path.map(String).join("."), code: i.message })) };
}

/** POST /api/events — host a Minyan (auth). */
events.post("/api/events", async (c) => {
  const userId = await requireUserId(c);
  const parsed = CreateEventInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(envelope(parsed.error.issues), 400);
  return c.json(await hostMinyanController(buildCtx(c), userId, parsed.data), 201);
});

/** GET /api/events/:id — viewer-appropriate shape; public (optional auth) for the join link (D13). */
events.get("/api/events/:id", async (c) => {
  const viewerId = await optionalUserId(c);
  return c.json(await getMinyanController(buildCtx(c), viewerId, c.req.param("id")));
});

/** PATCH /api/events/:id — host-only edit. */
events.patch("/api/events/:id", async (c) => {
  const userId = await requireUserId(c);
  const parsed = UpdateEventInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(envelope(parsed.error.issues), 400);
  return c.json(await updateMinyanController(buildCtx(c), userId, c.req.param("id"), parsed.data));
});

/** POST /api/events/:id/cancel — host-only soft cancel (requires confirm). */
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
