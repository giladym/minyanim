import { createAuth } from "../auth";
import { Unauthorized, Forbidden } from "./errors";
import { createDb } from "../db/client";
import { findUser, updateUser } from "../repositories/userRepository";
import type { Env } from "../env";

/** Minimal structural context — accepts any Hono context regardless of its `Variables`. */
type AuthCtx = { env: Env; req: { raw: Request } };

/**
 * Resolve the authenticated user id from the better-auth session, or throw 401. Lifted from the
 * copies previously inlined in routes/{stays,me,geo}.ts so all routes share one implementation.
 */
export async function requireUserId(c: AuthCtx): Promise<string> {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) throw Unauthorized();
  return session.user.id;
}

/**
 * Resolve the user id if signed in, else `null` — never throws. Enables optional-auth reads such
 * as the public Minyan join-link page (a signed-out visitor sees the public projection, R11).
 */
export async function optionalUserId(c: AuthCtx): Promise<string | null> {
  try {
    const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the user id and require ADMIN, or throw (401 if signed out, 403 otherwise). Admin iff the
 * user row is already `isAdmin`, OR the account email is in the `ADMIN_EMAILS` allowlist — in which
 * case the row is **idempotently promoted** (010 D2/FR-008). This is the ONLY writer of `isAdmin`:
 * the first admin is set purely by configuring the allowlist secret + signing in (no self-service
 * promotion, no DB edit). A session for an allowlisted email already implies control of it — Google
 * SSO emails are provider-verified and prod email/password sign-in is gated on verification.
 */
export async function requireAdmin(c: AuthCtx): Promise<string> {
  const userId = await requireUserId(c);
  const db = createDb(c.env.DB);
  const u = await findUser(db, userId);
  if (u?.isAdmin) return userId;

  const allow = (c.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = (u?.email ?? "").toLowerCase();
  if (email && allow.includes(email)) {
    await updateUser(db, userId, { isAdmin: true });
    return userId;
  }
  throw Forbidden();
}
