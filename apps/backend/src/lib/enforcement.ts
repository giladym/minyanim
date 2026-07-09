import type { Db } from "../db/client";
import { UserBanned, UserSuspended } from "./errors";
import { findUser } from "../repositories/userRepository";
import { setUserStatus } from "../repositories/moderationRepository";

/**
 * Gate a content-creating action on the acting user's moderation status (FR-005/FR-010). A banned
 * actor is blocked permanently (`403 user.banned`); a suspended actor is blocked until their
 * suspension expires (`403 user.suspended` carrying `{ until }` for the UI countdown). An expired
 * suspension auto-clears to `active` in place, and the request proceeds — no cron needed.
 *
 * A missing user (deleted mid-session) is treated as inactive/absent and left to the caller's own
 * auth; this only enforces status, so it no-ops when the user can't be found.
 */
export async function assertUserActive(db: Db, userId: string): Promise<void> {
  const u = await findUser(db, userId);
  if (!u) return;

  if (u.status === "banned") throw UserBanned();

  if (u.status === "suspended") {
    const until = u.suspendedUntil?.getTime() ?? 0;
    if (until > Date.now()) throw UserSuspended(until);
    await setUserStatus(db, userId, "active", null); // lapsed — self-heal and let the request through
  }
}
