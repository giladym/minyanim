import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "./db/client";
import * as schema from "./db/schema";
import { sendEmail } from "./lib/email";
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
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "איפוס סיסמה · Minyanim",
          html: `<p>לאיפוס הסיסמה: <a href="${url}">${url}</a></p>`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "אימות כתובת אימייל · Minyanim",
          html: `<p>לאימות הכתובת: <a href="${url}">${url}</a></p>`,
        });
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
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
