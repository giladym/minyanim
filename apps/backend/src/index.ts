import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { secureHeaders } from "hono/secure-headers";
import { createAuth } from "./auth";
import { me } from "./routes/me";
import { calendar } from "./routes/calendar";
import { stays } from "./routes/stays";
import { folders } from "./routes/folders";
import { zmanim } from "./routes/zmanim";
import { geo } from "./routes/geo";
import { discovery } from "./routes/discovery";
import { events } from "./routes/events";
import { notifications } from "./routes/notifications";
import { messages } from "./routes/messages";
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

// Profile (GET/PATCH /api/me) — auth-guarded, layered route→service→repository.
app.route("/", me);
// Hebrew calendar (public): current Hebrew date + upcoming holiday, computed server-side.
app.route("/", calendar);
// Stays (CRUD) — auth-guarded, layered route→controller→service→repository. (002)
app.route("/", stays);
// Folders (CRUD) — auth-guarded; Stays assign via folder_id, delete reassigns to Unfiled. (004)
app.route("/", folders);
// Per-Stay Shabbat zmanim — owner-scoped, computed server-side. (005)
app.route("/", zmanim);
// Geocoding proxy (auth + rate-limited) — keeps the MapTiler key server-side. (002)
app.route("/", geo);
// Discovery (auth-guarded) — per-Shabbat potential + hosted minyanim in an area. (003 US1)
app.route("/", discovery);
// Events/Minyanim — host, view (optional-auth for join link), edit, cancel. (003 US2)
app.route("/", events);
// Notifications inbox — list / mark-read. (003 US5; emails sent server-side via waitUntil)
app.route("/", notifications);
// Direct in-app messages between users — send / conversations / thread. (008)
app.route("/", messages);

// Public client config (no auth) — the PUBLIC MapTiler tile key for client-side maps, served at
// runtime so the map needs no build-time var. Only client-safe values; never secrets. (005-followup)
app.get("/api/config", (c) =>
  c.json({ maptilerTileKey: c.env.MAPTILER_TILE_KEY ?? "" }, 200, {
    "cache-control": "public, max-age=300",
  }),
);

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
