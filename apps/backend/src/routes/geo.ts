import { Hono } from "hono";
import { createAuth } from "../auth";
import { Unauthorized } from "../lib/errors";
import { rateLimit } from "../middleware";
import { searchPlaces } from "../services/geoService";
import type { Env } from "../env";

export const geo = new Hono<{ Bindings: Env }>();

/** Resolve the authenticated user id from the better-auth session, or 401. */
async function requireUserId(c: { env: Env; req: { raw: Request } }): Promise<string> {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) throw Unauthorized();
  return session.user.id;
}

// Rate-limit the geocoding proxy (reuses 001's RATE_LIMITER binding/middleware; cost/abuse control).
geo.use("/api/geo/*", rateLimit());

geo.get("/api/geo/search", async (c) => {
  await requireUserId(c);
  const q = c.req.query("q") ?? "";
  const lang = c.req.query("lang") ?? "he";
  const result = await searchPlaces(c.env, q, lang);
  return c.json(result);
});
