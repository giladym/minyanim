import { createAuthClient } from "better-auth/react";

/**
 * better-auth client — same origin, default basePath /api/auth (proxied to the backend).
 * Use members directly, e.g. `authClient.useSession()`, `authClient.signIn.social(...)`.
 */
export const authClient = createAuthClient();
