import { and, eq, ne, sql } from "drizzle-orm";
import { QUORUM } from "@minyanim/shared";
import type { Db } from "../db/client";
import { user, stay, event, attendance, flag } from "../db/schema";

/** Coerce a single-row `count(*)` select to a number. */
async function count(q: Promise<{ n: number }[]>): Promise<number> {
  return Number((await q)[0]?.n ?? 0);
}

/** All the aggregate reads behind the admin metrics view (US5). Each is a cheap COUNT/GROUP query. */
export async function collectMetrics(db: Db) {
  const usersTotal = count(db.select({ n: sql<number>`count(*)` }).from(user));
  const admins = count(db.select({ n: sql<number>`count(*)` }).from(user).where(eq(user.isAdmin, true)));
  const suspended = count(db.select({ n: sql<number>`count(*)` }).from(user).where(eq(user.status, "suspended")));
  const banned = count(db.select({ n: sql<number>`count(*)` }).from(user).where(eq(user.status, "banned")));

  const staysTotal = count(db.select({ n: sql<number>`count(*)` }).from(stay));
  const staysActive = count(db.select({ n: sql<number>`count(*)` }).from(stay).where(eq(stay.status, "active")));
  const staysHidden = count(db.select({ n: sql<number>`count(*)` }).from(stay).where(eq(stay.hidden, true)));

  const minyanimTotal = count(db.select({ n: sql<number>`count(*)` }).from(event).where(eq(event.type, "minyan")));
  const minyanimCancelled = count(
    db.select({ n: sql<number>`count(*)` }).from(event).where(and(eq(event.type, "minyan"), eq(event.status, "cancelled"))),
  );
  const minyanimHidden = count(
    db.select({ n: sql<number>`count(*)` }).from(event).where(and(eq(event.type, "minyan"), eq(event.hidden, true))),
  );

  // Quorum (north-star): non-cancelled minyanim whose committed men total ≥ QUORUM. Derived, not
  // stored — "ready" in the finer sense (Shabbat Torah + Ba'al Korei) is a subset we don't split in v1.
  const quorumRows = db
    .select({ id: event.id })
    .from(event)
    .innerJoin(attendance, and(eq(attendance.eventId, event.id), eq(attendance.status, "confirmed")))
    .where(and(eq(event.type, "minyan"), ne(event.status, "cancelled")))
    .groupBy(event.id)
    .having(sql`sum(${attendance.partySize}) >= ${QUORUM}`);

  // Moderation: distinct flagged content items + hidden content across both tables.
  const openFlags = count(
    db.select({ n: sql<number>`count(distinct ${flag.contentType} || ':' || ${flag.contentId})` }).from(flag),
  );

  // Busiest places by combined stay + minyan activity.
  const topLocations = db.all<{ city: string; country: string; count: number }>(sql`
    SELECT city, country, COUNT(*) AS count FROM (
      SELECT city, country FROM stay
      UNION ALL
      SELECT city, country FROM event WHERE type = 'minyan'
    ) GROUP BY city, country ORDER BY count DESC, city ASC LIMIT 5
  `);

  const [
    usersTotalV, adminsV, suspendedV, bannedV,
    staysTotalV, staysActiveV, staysHiddenV,
    minyanimTotalV, minyanimCancelledV, minyanimHiddenV,
    quorumRowsV, openFlagsV, topLocationsV,
  ] = await Promise.all([
    usersTotal, admins, suspended, banned,
    staysTotal, staysActive, staysHidden,
    minyanimTotal, minyanimCancelled, minyanimHidden,
    quorumRows, openFlags, topLocations,
  ]);

  const quorum = quorumRowsV.length;
  return {
    users: { total: usersTotalV, admins: adminsV, suspended: suspendedV, banned: bannedV },
    stays: { total: staysTotalV, active: staysActiveV, hidden: staysHiddenV },
    minyanim: {
      total: minyanimTotalV,
      cancelled: minyanimCancelledV,
      hidden: minyanimHiddenV,
      ready: quorum,
      // Non-cancelled minyanim below quorum. Never negative (quorum ⊆ non-cancelled).
      forming: Math.max(0, minyanimTotalV - minyanimCancelledV - quorum),
    },
    autoHidden: staysHiddenV + minyanimHiddenV,
    openFlags: openFlagsV,
    topLocations: topLocationsV.map((r) => ({ city: r.city, country: r.country, count: Number(r.count) })),
  };
}
