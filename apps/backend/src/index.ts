import { Hono } from "hono";
import { createAuth } from "./auth";
import { AppError } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { ERROR_CODES } from "@minyanim/shared";
import type { Env } from "./env";

export type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

// Centralized error handling → shared error-code shape (frontend localizes). (T018/T019)
app.onError((err, c) => {
  const log = createLogger({ path: c.req.path });
  if (err instanceof AppError) {
    log.warn("app_error", { status: err.status, errors: err.errors });
    return c.json(err.toResponse(), err.status as never);
  }
  log.error("unhandled_error", { message: String(err) });
  return c.json({ errors: [{ field: null, code: ERROR_CODES.SERVER_ERROR }] }, 500);
});

// better-auth: Google + email/password (sign-up, verify, reset). (T020)
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

// Liveness/readiness incl. D1 connectivity. (T027)
app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 503);
  }
});

export default app;
