import { createMiddleware } from "hono/factory";
import { RateLimited } from "../lib/errors";
import { createLogger, type Logger } from "../lib/logger";
import type { Env } from "../env";

type Vars = { requestId: string; log: Logger };

/** Attach a request id + a logger bound to it (request-id propagated to every log line). */
export const requestContext = createMiddleware<{ Bindings: Env; Variables: Vars }>(
  async (c, next) => {
    const id = c.req.header("cf-ray") ?? crypto.randomUUID();
    c.set("requestId", id);
    c.set("log", createLogger({ requestId: id, path: c.req.path }));
    c.header("x-request-id", id);
    await next();
  },
);

/**
 * Rate limit via Cloudflare's native binding when present (no-op if unbound, e.g. before the
 * binding is configured). Keyed by client IP by default. Research D13.
 */
export function rateLimit(keyFn?: (c: { req: Request }) => string) {
  return createMiddleware<{ Bindings: Env; Variables: Vars }>(async (c, next) => {
    const limiter = c.env.RATE_LIMITER;
    if (limiter) {
      const key = keyFn?.({ req: c.req.raw }) ?? c.req.header("cf-connecting-ip") ?? "anon";
      const { success } = await limiter.limit({ key });
      if (!success) throw RateLimited();
    }
    await next();
  });
}
