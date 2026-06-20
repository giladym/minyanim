import { toPublicMinyanDTO, type DiscoveryQueryType, type DiscoveryResult } from "@minyanim/shared";
import type { Db } from "../db/client";
import { discover } from "../services/discoveryService";

/**
 * Discovery boundary: runs the service and re-projects every minyan through `toPublicMinyanDTO`,
 * structurally guaranteeing no private field (address / contact) leaks into discovery (SC-005).
 */
export async function discoverController(db: Db, q: DiscoveryQueryType): Promise<DiscoveryResult> {
  const result = await discover(db, q);
  return { ...result, minyanim: result.minyanim.map(toPublicMinyanDTO) };
}
