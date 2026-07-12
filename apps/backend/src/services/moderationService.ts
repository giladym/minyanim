import type {
  FlagContentInput,
  FlagReason,
  ModeratedContentType,
  ModerationQueueEntryDTO,
  UserStatus,
} from "@minyanim/shared";
import type { Db } from "../db/client";
import type { Ctx } from "../lib/context";
import { LastAdmin, NotFound } from "../lib/errors";
import { findUser } from "../repositories/userRepository";
import { onEventUnavailable, onHostSanctioned } from "./notificationService";
import {
  activeAdminCount,
  clearFlags,
  contentExists,
  distinctReporterCount,
  eventSummaries,
  getContentOwnerId,
  insertFlag,
  listFlagGroups,
  setContentHidden,
  setUserStatus,
  staySummaries,
} from "../repositories/moderationRepository";

/** Distinct reporters that auto-hide content. Counting distinct reporters (not raw flags) is why one
 * person spamming the flag button can't cross it alone (US2 / SC-001). */
const AUTO_HIDE_THRESHOLD = 3;

/**
 * Record a flag on a Stay or Minyan and auto-hide it once ≥3 distinct reporters have flagged it —
 * synchronously, in the same request (no cron → "within seconds"). Idempotent per reporter. The
 * content owner is NEVER auto-sanctioned (SC-002) — only the content is hidden.
 */
export async function flagContent(
  db: Db,
  contentType: ModeratedContentType,
  contentId: string,
  reporterId: string,
  input: FlagContentInput,
  ctx?: Ctx,
): Promise<void> {
  if (!(await contentExists(db, contentType, contentId))) throw NotFound();

  const reportedUserId = input.reportUser ? await getContentOwnerId(db, contentType, contentId) : null;
  await insertFlag(db, { contentType, contentId, userId: reporterId, reason: input.reason, reportedUserId });

  const reporters = await distinctReporterCount(db, contentType, contentId);
  if (reporters >= AUTO_HIDE_THRESHOLD) {
    await setContentHidden(db, contentType, contentId, true); // idempotent — a 4th+ flag re-fires nothing
    // On the FIRST crossing of the threshold, tell an event's pending requesters it's unavailable
    // (T047). In-app rows write in-request (source of truth); the helper defers only the emails and
    // never throws. `=== threshold` avoids re-notifying on a 4th+ flag.
    if (ctx && contentType === "event" && reporters === AUTO_HIDE_THRESHOLD) {
      await onEventUnavailable(ctx, contentId);
    }
  }
}

// ── Moderation queue (US3) ──────────────────────────────────────────────────
/**
 * The moderation queue: flags aggregated per content item, enriched with a light recognizer and the
 * sanction target. Ordered auto-hidden-first, then reporter-count desc, then oldest-first (FR-003) —
 * the most urgent (already hidden, or piling up) surfaces at the top.
 */
export async function getQueue(db: Db): Promise<ModerationQueueEntryDTO[]> {
  const groups = await listFlagGroups(db);
  if (groups.length === 0) return [];

  const eventIds = groups.filter((g) => g.contentType === "event").map((g) => g.contentId);
  const stayIds = groups.filter((g) => g.contentType === "stay").map((g) => g.contentId);
  const [events, stays] = await Promise.all([eventSummaries(db, eventIds), staySummaries(db, stayIds)]);

  const entries = groups.flatMap<ModerationQueueEntryDTO>((g) => {
    const summary = (g.contentType === "event" ? events : stays).get(g.contentId);
    if (!summary) return []; // content deleted out from under its flags — drop it
    return [
      {
        contentType: g.contentType,
        contentId: g.contentId,
        reporterCount: g.reporterCount,
        reasons: (g.reasonsCsv ? g.reasonsCsv.split(",") : []) as FlagReason[],
        hidden: summary.hidden,
        reportedUserId: summary.ownerId,
        content: { city: summary.city, country: summary.country },
        createdAt: g.firstFlaggedSec * 1000, // timestamp mode stores epoch-seconds; DTO is epoch-ms
      },
    ];
  });

  entries.sort(
    (a, b) =>
      Number(b.hidden) - Number(a.hidden) || // auto-hidden / removed first
      b.reporterCount - a.reporterCount || // then most-reported
      a.createdAt - b.createdAt, // then oldest (most urgent to clear)
  );
  return entries;
}

/** Dismiss the flags as invalid → restore content (hidden=false) and clear its flags (US3.2). */
export async function dismissContent(db: Db, contentType: ModeratedContentType, contentId: string): Promise<void> {
  if (!(await contentExists(db, contentType, contentId))) throw NotFound();
  await setContentHidden(db, contentType, contentId, false);
  await clearFlags(db, contentType, contentId);
}

/** Remove content → hidden=true (kept for the record; flags retained). Idempotent. */
export async function removeContent(db: Db, contentType: ModeratedContentType, contentId: string): Promise<void> {
  if (!(await contentExists(db, contentType, contentId))) throw NotFound();
  await setContentHidden(db, contentType, contentId, true);
}

// ── Sanctions (US3) ─────────────────────────────────────────────────────────
export type SanctionAction = "warn" | "suspend" | "ban" | "reinstate";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SUSPEND_DAYS = 7;

export interface SanctionResult {
  status: UserStatus;
  suspendedUntil: number | null; // epoch-ms
}

/**
 * Apply a sanction to a user. `warn` is advisory (no status change). `suspend`/`ban` are guarded by
 * FR-009: they cannot leave the platform with zero active admins → `409 admin.last_admin`.
 * `reinstate` clears any sanction. Throws 404 if the user is missing.
 */
export async function sanctionUser(
  db: Db,
  targetId: string,
  action: SanctionAction,
  suspendDays?: number,
  ctx?: Ctx,
): Promise<SanctionResult> {
  const target = await findUser(db, targetId);
  if (!target) throw NotFound();

  // Last-admin guard: removing an active admin from the active set must not empty it (FR-009).
  if ((action === "suspend" || action === "ban") && target.isAdmin && target.status === "active") {
    if ((await activeAdminCount(db)) <= 1) throw LastAdmin();
  }

  switch (action) {
    case "warn":
      // Advisory only — status unchanged. (Audit logging is emitted at the route via structured logs.)
      return { status: target.status as UserStatus, suspendedUntil: target.suspendedUntil?.getTime() ?? null };
    case "suspend": {
      const until = new Date(Date.now() + (suspendDays ?? DEFAULT_SUSPEND_DAYS) * DAY_MS);
      await setUserStatus(db, targetId, "suspended", until);
      // The host's hosted events can no longer proceed for pending requesters (T047). In-app rows
      // write in-request; the helper defers only the emails and never throws.
      if (ctx) await onHostSanctioned(ctx, targetId);
      return { status: "suspended", suspendedUntil: until.getTime() };
    }
    case "ban":
      await setUserStatus(db, targetId, "banned", null);
      if (ctx) await onHostSanctioned(ctx, targetId);
      return { status: "banned", suspendedUntil: null };
    case "reinstate":
      await setUserStatus(db, targetId, "active", null);
      return { status: "active", suspendedUntil: null };
  }
}
