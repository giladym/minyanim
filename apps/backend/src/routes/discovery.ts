import { Hono } from "hono";
import { DiscoveryQuery } from "@minyanim/shared";
import { createDb } from "../db/client";
import { requireUserId } from "../lib/auth";
import { discoverController } from "../controllers/discoveryController";
import type { Env } from "../env";
import type { Logger } from "../lib/logger";

export const discovery = new Hono<{ Bindings: Env; Variables: { log: Logger } }>();

/**
 * GET /api/discovery — per-Shabbat potential + hosted Minyanim in an area (FR-001). Authenticated,
 * but requires no Stay of the caller's own (D22). `PublicMinyanDTO` only (address-free, SC-005).
 */
discovery.get("/api/discovery", async (c) => {
  await requireUserId(c);
  const parsed = DiscoveryQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  const started = Date.now();
  const result = await discoverController(createDb(c.env.DB), parsed.data);
  c.get("log")?.info("discovery.query", {
    durationMs: Date.now() - started,
    minyanimCount: result.minyanim.length,
    potentialBuckets: result.potential.length,
  });
  return c.json(result);
});
