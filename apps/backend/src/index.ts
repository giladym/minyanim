import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { secureHeaders } from "hono/secure-headers";
import { createAuth } from "./auth";
import { requestContext, rateLimit } from "./middleware";
import { AppError } from "./lib/errors";
import { createLogger, type Logger } from "./lib/logger";
import { ERROR_CODES } from "@minyanim/shared";
import type { Env } from "./env";

export type { Env } from "./env";

const app = new OpenAPIHono<{ Bindings: Env; Variables: { requestId: string; log: Logger } }>();

// Security headers on every response. The HTML Content-Security-Policy lives on the frontend
// Worker (it serves the markup); the API/JSON + Swagger UI use the safe defaults here.
app.use("*", secureHeaders());
app.use("*", requestContext);

// Centralized errors → shared error-code shape (frontend localizes). (T018/T019)
app.onError((err, c) => {
  const log = c.get("log") ?? createLogger({ path: c.req.path });
  if (err instanceof AppError) {
    log.warn("app_error", { status: err.status, errors: err.errors });
    return c.json(err.toResponse(), err.status as never);
  }
  log.error("unhandled_error", { message: String(err) });
  return c.json({ errors: [{ field: null, code: ERROR_CODES.SERVER_ERROR }] }, 500);
});

// Rate-limit auth endpoints, then hand off to better-auth (Google + email/password). (T019/T020)
app.use("/api/auth/*", rateLimit());
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

// OpenAPI doc + Swagger UI (feature routes register their schemas here). (T021)
app.doc("/api/openapi.json", {
  openapi: "3.0.0",
  info: { title: "Minyanim API", version: "0.0.0" },
});
app.get("/docs", swaggerUI({ url: "/api/openapi.json" }));

export default app;
