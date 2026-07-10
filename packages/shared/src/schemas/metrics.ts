/**
 * Admin metrics (006 US5). A read-only projection assembled server-side from aggregate D1 counts and
 * hand-built into JSON — no inbound parsing, so this is a plain TS interface (no Zod). v1 is current
 * counts + a form→host→quorum funnel + top locations; time-series (DAU/WAU/MAU) is deferred to v2.
 */
export interface AdminMetricsDTO {
  users: { total: number; admins: number; suspended: number; banned: number };
  stays: { total: number; active: number; hidden: number };
  minyanim: { total: number; forming: number; ready: number; cancelled: number; hidden: number };
  /** Product funnel: potential travelers (active stays) → hosted minyanim → reached quorum (north-star). */
  funnel: { potential: number; hosted: number; quorum: number };
  moderation: { openFlags: number; autoHidden: number };
  /** Busiest places by combined stay + minyan activity, most active first. */
  topLocations: Array<{ city: string; country: string; count: number }>;
}
