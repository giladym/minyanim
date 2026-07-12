import { Hono } from "hono";
import { DiscoveryQuery } from "@minyanim/shared";
import { createDb } from "../db/client";
import { requireUserId } from "../lib/auth";
import { discoverController } from "../controllers/discoveryController";
import { nearStay, nearStayCounts } from "../services/discoveryService";
import { toPublicEventDTO } from "@minyanim/shared";
import { NotFound } from "../lib/errors";
import type { Env } from "../env";
import type { Logger } from "../lib/logger";

export const discovery = new Hono<{ Bindings: Env; Variables: { log: Logger } }>();

/**
 * GET /api/discovery — per-Shabbat potential + hosted events of all in-scope kinds in an area
 * (FR-001, generalized 014 US2). Authenticated, but requires no Stay of the caller's own (D22).
 * `PublicEventDTO` only (address-free, SC-003); `types`/`categories`/`occasion` filters via
 * `DiscoveryQuery`.
 */
discovery.get("/api/discovery", async (c) => {
  const viewerId = await requireUserId(c);
  const parsed = DiscoveryQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  const started = Date.now();
  const result = await discoverController(createDb(c.env.DB), parsed.data, viewerId);
  c.get("log")?.info("discovery.query", {
    durationMs: Date.now() - started,
    eventsCount: result.events.length,
    potentialBuckets: result.potential.length,
  });
  return c.json(result);
});

/** GET /api/discovery/near-stay/:stayId — potential + events (all kinds) near an owned Stay (FR-019). */
discovery.get("/api/discovery/near-stay/:stayId", async (c) => {
  const userId = await requireUserId(c);
  const result = await nearStay(createDb(c.env.DB), userId, c.req.param("stayId"));
  if (!result) throw NotFound();
  const { events, ...rest } = result;
  return c.json({ ...rest, events: events.map(toPublicEventDTO) });
});

/** GET /api/discovery/near-stay-counts — batched nearby-minyan counts for the My-Stays dashboard. */
discovery.get("/api/discovery/near-stay-counts", async (c) => {
  const userId = await requireUserId(c);
  return c.json(await nearStayCounts(createDb(c.env.DB), userId));
});
