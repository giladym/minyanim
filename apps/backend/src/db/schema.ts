import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import type { PrayerNeeds } from "@minyanim/shared";

// better-auth-owned tables (user/session/account/verification) + our phone_number.
// Field KEYS match better-auth's model fields; DB column names are snake_case.
// `language`/`theme` are app additionalFields on user. All child tables cascade from user
// so account deletion removes 100% of owned data (FR-008/SC-007).

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  language: text("language").notNull().default("he"),
  theme: text("theme").notNull().default("system"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
    scope: text("scope"),
    password: text("password"), // email/password credential hash (never plaintext)
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const phoneNumber = sqliteTable(
  "phone_number",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    e164: text("e164").notNull(),
    label: text("label"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("phone_user_idx").on(t.userId)],
);

// A user's presence at a place over a date range (002). Owned by a user; cascades on user delete.
// Dates are stored as date-only epoch-ms at UTC midnight of the civil date (D4); compared via the
// destination-tz civil-date algorithm (D3), never numerically.
export const stay = sqliteTable(
  "stay",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    country: text("country").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    addressPrivate: text("address_private"),
    arrivalDate: integer("arrival_date", { mode: "timestamp" }).notNull(),
    departureDate: integer("departure_date", { mode: "timestamp" }).notNull(),
    numMen: integer("num_men").notNull(),
    bringsSeferTorah: integer("brings_sefer_torah", { mode: "boolean" }).notNull().default(false),
    prayerNeeds: text("prayer_needs", { mode: "json" }).$type<PrayerNeeds>().notNull(),
    status: text("status").notNull().default("active"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    groupMembers: text("group_members"),
    notes: text("notes"),
    folderId: text("folder_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("stay_user_idx").on(t.userId),
    index("stay_user_arrival_idx").on(t.userId, t.arrivalDate),
  ],
);
