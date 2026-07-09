import type { FlagContentInput, ModeratedContentType } from "@minyanim/shared";
import type { Db } from "../db/client";
import { NotFound } from "../lib/errors";
import {
  contentExists,
  distinctReporterCount,
  getContentOwnerId,
  insertFlag,
  setContentHidden,
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
): Promise<void> {
  if (!(await contentExists(db, contentType, contentId))) throw NotFound();

  const reportedUserId = input.reportUser ? await getContentOwnerId(db, contentType, contentId) : null;
  await insertFlag(db, { contentType, contentId, userId: reporterId, reason: input.reason, reportedUserId });

  if ((await distinctReporterCount(db, contentType, contentId)) >= AUTO_HIDE_THRESHOLD) {
    await setContentHidden(db, contentType, contentId, true); // idempotent — a 4th+ flag re-fires nothing
  }
}
