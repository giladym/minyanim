import { toPublicEventDTO, type DiscoveryQueryType } from "@minyanim/shared";
import type { Db } from "../db/client";
import { discover } from "../services/discoveryService";

/**
 * Discovery boundary: runs the service and re-projects every event through `toPublicEventDTO`
 * (per-type structural strip), structurally guaranteeing no private field (address / contact) leaks
 * into discovery (SC-003). Generalized to all event kinds in 014 US2 (the wire field is `events`).
 */
export async function discoverController(db: Db, q: DiscoveryQueryType, viewerId: string | null = null) {
  const { events, ...rest } = await discover(db, q, viewerId);
  return { ...rest, events: events.map(toPublicEventDTO) };
}
