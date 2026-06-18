import { Hono } from "hono";
import { updateProfileSchema, addPhoneSchema } from "@minyanim/shared";
import { createAuth } from "../auth";
import { createDb } from "../db/client";
import { getProfile, updateProfile, addUserPhone, removeUserPhone } from "../services/profileService";
import { Unauthorized, NotFound } from "../lib/errors";
import type { Env } from "../env";

export const me = new Hono<{ Bindings: Env }>();

/** Resolve the authenticated user id from the better-auth session, or 401. */
async function requireUserId(c: { env: Env; req: { raw: Request } }): Promise<string> {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) throw Unauthorized();
  return session.user.id;
}

me.get("/api/me", async (c) => {
  const userId = await requireUserId(c);
  const profile = await getProfile(createDb(c.env.DB), userId);
  if (!profile) throw Unauthorized();
  return c.json(profile);
});

me.patch("/api/me", async (c) => {
  const userId = await requireUserId(c);
  const parsed = updateProfileSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  const profile = await updateProfile(createDb(c.env.DB), userId, parsed.data);
  return c.json(profile);
});

me.post("/api/me/phones", async (c) => {
  const userId = await requireUserId(c);
  const parsed = addPhoneSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  const phone = await addUserPhone(createDb(c.env.DB), userId, parsed.data);
  return c.json(phone, 201);
});

me.delete("/api/me/phones/:id", async (c) => {
  const userId = await requireUserId(c);
  const ok = await removeUserPhone(createDb(c.env.DB), userId, c.req.param("id"));
  if (!ok) throw NotFound();
  return c.body(null, 204);
});
