import type { Env } from "../env";
import { createDb, type Db } from "../db/client";
import { createLogger, type Logger } from "./logger";

/** Minimal structural view of a Hono context — accepts any route's `Variables` shape. */
interface CtxSource {
  env: Env;
  req: { path: string };
  get(key: "log"): Logger | undefined;
  executionCtx: { waitUntil(p: Promise<unknown>): void };
}

/**
 * Per-request capability bundle threaded into mutating services so they can read/write D1, log,
 * and defer slow work (email fan-out) past the response (R8/R14). `defer` wraps
 * `executionCtx.waitUntil` — the only seam that keeps a Worker alive after returning.
 */
export interface Ctx {
  db: Db;
  env: Env;
  log: Logger;
  /** Schedule work to run after the response is sent (e.g. notification email). */
  defer: (p: Promise<unknown>) => void;
}

/** Build a {@link Ctx} from a Hono request context. */
export function buildCtx(c: CtxSource): Ctx {
  return {
    db: createDb(c.env.DB),
    env: c.env,
    log: c.get("log") ?? createLogger({ path: c.req.path }),
    defer: (p) => c.executionCtx.waitUntil(p.catch(() => {})),
  };
}
