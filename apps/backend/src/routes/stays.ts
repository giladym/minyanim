import { Hono } from "hono";
import { CreateStayInput, UpdateStayInput, flagContentSchema } from "@minyanim/shared";
import { flagContent } from "../services/moderationService";
import { cleanupParent } from "../services/mediaService";
import { createAuth } from "../auth";
import { createDb } from "../db/client";
import { Unauthorized } from "../lib/errors";
import {
  listStaysController,
  listHistoryController,
  createStayController,
  getStayController,
  updateStayController,
  cancelStayController,
  permanentDeleteStayController,
} from "../controllers/stayController";
import type { Logger } from "../lib/logger";
import type { Env } from "../env";

export const stays = new Hono<{ Bindings: Env; Variables: { log?: Logger } }>();

/** Resolve the authenticated user id from the better-auth session, or 401. */
async function requireUserId(c: { env: Env; req: { raw: Request } }): Promise<string> {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) throw Unauthorized();
  return session.user.id;
}

/** Client-supplied IANA timezone for the temporal check when a stay has no coordinates (D3). */
function clientTz(c: { req: { header(name: string): string | undefined } }): string | undefined {
  return c.req.header("X-Client-Timezone") || undefined;
}

stays.get("/api/stays", async (c) => {
  const userId = await requireUserId(c);
  const db = createDb(c.env.DB);
  // scope=history → paginated past+cancelled; default scope=active → upcoming/in-progress (D1).
  if (c.req.query("scope") === "history") {
    const limitRaw = Number(c.req.query("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : undefined;
    return c.json(await listHistoryController(db, userId, c.req.query("cursor"), limit));
  }
  return c.json(await listStaysController(db, userId, clientTz(c)));
});

stays.post("/api/stays", async (c) => {
  const userId = await requireUserId(c);
  const parsed = CreateStayInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  const dto = await createStayController(createDb(c.env.DB), userId, parsed.data, clientTz(c));
  return c.json(dto, 201);
});

stays.get("/api/stays/:id", async (c) => {
  const userId = await requireUserId(c);
  return c.json(await getStayController(createDb(c.env.DB), userId, c.req.param("id"), clientTz(c)));
});

stays.patch("/api/stays/:id", async (c) => {
  const userId = await requireUserId(c);
  const parsed = UpdateStayInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  const dto = await updateStayController(createDb(c.env.DB), userId, c.req.param("id"), parsed.data, clientTz(c));
  return c.json(dto);
});

stays.post("/api/stays/:id/cancel", async (c) => {
  const userId = await requireUserId(c);
  const body = (await c.req.json().catch(() => ({}))) as { confirm?: boolean };
  return c.json(
    await cancelStayController(createDb(c.env.DB), userId, c.req.param("id"), body.confirm === true),
  );
});

stays.delete("/api/stays/:id/permanent", async (c) => {
  const userId = await requireUserId(c);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { confirm?: boolean };
  const res = await permanentDeleteStayController(createDb(c.env.DB), userId, id, body.confirm === true);
  await cleanupParent(c.env.IMAGES, "stay", id).catch(() => {}); // 012: best-effort image cleanup
  c.get("log")?.info("stay.permanently_deleted", { stayId: id });
  return c.json(res);
});

/** POST /api/stays/:id/flag — flag a Stay for moderation (006). Idempotent per reporter; the 3rd
 * distinct reporter auto-hides it from discovery. Any signed-in user (not just the owner). */
stays.post("/api/stays/:id/flag", async (c) => {
  const userId = await requireUserId(c);
  const parsed = flagContentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) }, 400);
  }
  await flagContent(createDb(c.env.DB), "stay", c.req.param("id"), userId, parsed.data);
  return c.json({ ok: true });
});
