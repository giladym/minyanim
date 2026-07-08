import { Hono } from "hono";
import { updateProfileSchema, addPhoneSchema, claimSeedSchema } from "@minyanim/shared";
import { createAuth } from "../auth";
import { createDb } from "../db/client";
import { getProfile, updateProfile, addUserPhone, removeUserPhone, deleteAccount } from "../services/profileService";
import { getClaimableSeeds, claimSeedUsers } from "../services/claimService";
import { AppError, Unauthorized, NotFound } from "../lib/errors";
import { ERROR_CODES } from "@minyanim/shared";
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

// Seed-user claim (F4): trips/minyanim imported under a placeholder whose phone matches the
// caller's. GET previews the matches; POST merges the selected seeds into the account + deletes them.
me.get("/api/me/claims", async (c) => {
  const userId = await requireUserId(c);
  const seeds = await getClaimableSeeds(createDb(c.env.DB), userId);
  return c.json({ seeds });
});

me.post("/api/me/claims", async (c) => {
  const userId = await requireUserId(c);
  const parsed = claimSeedSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  const result = await claimSeedUsers(createDb(c.env.DB), userId, parsed.data.seedUserIds);
  return c.json(result);
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

// Permanently delete the account + all owned data (cascade). Requires explicit confirmation.
me.delete("/api/me", async (c) => {
  const userId = await requireUserId(c);
  const body = (await c.req.json().catch(() => ({}))) as { confirm?: boolean };
  if (body.confirm !== true) throw new AppError(400, ERROR_CODES.SERVER_ERROR, "confirm");
  await deleteAccount(createDb(c.env.DB), userId);
  return c.json({ ok: true });
});
