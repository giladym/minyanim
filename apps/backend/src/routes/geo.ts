import { Hono } from "hono";
import { createAuth } from "../auth";
import { Unauthorized } from "../lib/errors";
import { rateLimit } from "../middleware";
import { reverseGeocode, searchPlaces } from "../services/geoService";
import { AppError } from "../lib/errors";
import { ERROR_CODES } from "@minyanim/shared";
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

geo.get("/api/geo/reverse", async (c) => {
  await requireUserId(c);
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  // Reject anything that isn't a finite, in-range coordinate before hitting the provider.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new AppError(400, ERROR_CODES.GEO_INVALID_COORDS);
  }
  const lang = c.req.query("lang") ?? "he";
  const result = await reverseGeocode(c.env, lat, lng, lang);
  return c.json(result);
});
