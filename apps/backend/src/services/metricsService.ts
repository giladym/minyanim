import type { AdminMetricsDTO } from "@minyanim/shared";
import type { Db } from "../db/client";
import { collectMetrics } from "../repositories/metricsRepository";

/**
 * Assemble the admin metrics DTO (US5) from aggregate D1 counts. Read-only; hand-built into the
 * response shape. The funnel is potential travelers (active stays) → hosted minyanim → reached
 * quorum (the SC-001 north-star).
 */
export async function getMetrics(db: Db): Promise<AdminMetricsDTO> {
  const m = await collectMetrics(db);
  return {
    users: m.users,
    stays: m.stays,
    minyanim: m.minyanim,
    funnel: { potential: m.stays.active, hosted: m.minyanim.total, quorum: m.minyanim.ready },
    moderation: { openFlags: m.openFlags, autoHidden: m.autoHidden },
    topLocations: m.topLocations,
  };
}
