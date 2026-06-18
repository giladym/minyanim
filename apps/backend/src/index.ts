import { Hono } from "hono";

/** Worker bindings + secrets (secrets resolved via env — see docs/secrets.md). */
export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// Liveness/readiness (T027 will add the D1 connectivity check).
app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
