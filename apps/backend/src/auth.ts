import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "./db/client";
import * as schema from "./db/schema";
import { sendEmail } from "./lib/email";
import { verificationEmail, resetPasswordEmail } from "./lib/email-templates";
import type { Env } from "./env";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_DAY = 60 * 60 * 24;

/** Build the better-auth instance for a request's bindings. */
export function createAuth(env: Env) {
  const db = createDb(env.DB);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_BASE_URL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "sqlite", schema }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION !== "false",
      sendResetPassword: async ({ user, url }) => {
        const { subject, html } = resetPasswordEmail(url);
        await sendEmail(env, { to: user.email, subject, html });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        const { subject, html } = verificationEmail(url);
        await sendEmail(env, { to: user.email, subject, html });
      },
    },
    socialProviders: {
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
    // Link a Google login and an email/password account that share a verified email (FR-014).
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    session: { expiresIn: THIRTY_DAYS, updateAge: ONE_DAY },
    user: {
      additionalFields: {
        language: { type: "string", required: false, defaultValue: "he", input: true },
        theme: { type: "string", required: false, defaultValue: "system", input: true },
        havdalahOpinion: { type: "string", required: false, defaultValue: "geonim", input: true },
        sharePhone: { type: "boolean", required: false, defaultValue: true, input: true },
        // 010: never settable by the client (input:false) — only the admin guard promotes, from the
        // ADMIN_EMAILS allowlist. Declared here so better-auth includes it in the user model.
        isAdmin: { type: "boolean", required: false, defaultValue: false, input: false },
        // 006: moderation status — only the sanction service writes these (input:false).
        status: { type: "string", required: false, defaultValue: "active", input: false },
        suspendedUntil: { type: "date", required: false, input: false },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
