import { createAuth } from "../auth";
import { Unauthorized } from "./errors";
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
