import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { PrayerNeeds, MinyanService } from "@minyanim/shared";

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
  // 005: which end-of-Shabbat opinion the user sees for Havdalah ('geonim'|'rabbeinu_tam'|'both').
  havdalahOpinion: text("havdalah_opinion").notNull().default("geonim"),
  // 006: opt-out for sharing the phone with others (minyan roster + travelers list). Default ON so
  // contact is easy by default; a privacy-conscious user can disable it. Governs phone only.
  sharePhone: integer("share_phone", { mode: "boolean" }).notNull().default(true),
  // 008: opt-out for receiving in-app messages from other users. Default ON (any signed-in user
  // may message you); a user can disable it to stop receiving new messages.
  acceptMessages: integer("accept_messages", { mode: "boolean" }).notNull().default(true),
  // 009: 'real' = a normal authenticated user; 'seed' = an imported placeholder (no account, can
  // never sign in) whose stays/events are visible so people find each other. A seed row is CLAIMED
  // and deleted when a real user signs up whose profile phone matches the seed's phone (F4).
  kind: text("kind").notNull().default("real"),
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

// ── Feature 004: Folders ─────────────────────────────────────────────────────
// A user-owned grouping of that user's Stays (D3). Cascades on user delete; the Stays survive
// (their folder_id is SET NULL — "Unfiled" — D4). Per-user case-insensitive name uniqueness is
// enforced by a raw NOCASE unique index added in the migration (Drizzle can't express COLLATE).
export const folder = sqliteTable(
  "folder",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // 006 (design): folders shown as quick-filter chips on the dashboard. Default TRUE so existing
    // folders keep showing; the user unpins to declutter the filter across years of trips.
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("folder_user_idx").on(t.userId)],
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
    // 004 D4: "Unfiled" = NULL. ON DELETE SET NULL reassigns a deleted folder's Stays to Unfiled
    // in a single DELETE (no app-side loop, no interactive txn).
    folderId: text("folder_id").references(() => folder.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("stay_user_idx").on(t.userId),
    index("stay_user_arrival_idx").on(t.userId, t.arrivalDate),
    // 003 (D15 geospatial seam): bounding-box scan for cross-user "potential" aggregation.
    index("stay_lat_lng_idx").on(t.lat, t.lng),
    // 004: browse-by-folder (D6) and History keyset (id in the index so the
    // (departure_date DESC, id DESC) tiebreaker doesn't filesort — R5).
    index("stay_user_folder_idx").on(t.userId, t.folderId),
    index("stay_user_departure_idx").on(t.userId, t.departureDate, t.id),
  ],
);

// ── Feature 003: Discovery & Quorum ─────────────────────────────────────────
// A Minyan is a generic `event` (type='minyan', D21) + a 1:1 `minyan` detail. Commitments,
// roles, and notifications reference the generic event. All child tables cascade from user/event.

export const event = sqliteTable(
  "event",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull().default("minyan"),
    hostUserId: text("host_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    country: text("country").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    addressPrivate: text("address_private"),
    // Private entry/access instructions (e.g. "ring twice, code 1234") — revealed only to
    // committed participants alongside the address (D4).
    addressNotes: text("address_notes"),
    eventDate: integer("event_date", { mode: "timestamp" }).notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("forming"),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("event_host_idx").on(t.hostUserId),
    index("event_lat_lng_idx").on(t.lat, t.lng),
    index("event_status_type_date_idx").on(t.status, t.type, t.eventDate),
  ],
);

export const minyan = sqliteTable("minyan", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  nusach: text("nusach").notNull().default("any"),
  seferTorah: integer("sefer_torah", { mode: "boolean" }).notNull().default(false),
  // The gathering's tefillot, each with an optional time (D3). Typed JSON like 002's prayer_needs.
  services: text("services", { mode: "json" }).$type<MinyanService[]>().notNull(),
});

export const commitment = sqliteTable(
  "commitment",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    numMen: integer("num_men").notNull(),
    stayId: text("stay_id").references(() => stay.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("commitment_event_user_uidx").on(t.eventId, t.userId),
    index("commitment_event_idx").on(t.eventId),
    index("commitment_user_idx").on(t.userId),
  ],
);

export const eventRole = sqliteTable(
  "event_role",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("event_role_uidx").on(t.eventId, t.role)],
);

export const notification = sqliteTable(
  "notification",
  {
    id: text("id").primaryKey(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("notification_recipient_idx").on(t.recipientUserId)],
);

// 008: direct in-app messages between users (any signed-in user → any other, gated by the
// recipient's `accept_messages` opt-out + a per-sender rate limit). Both FKs cascade so deleting
// either party removes the thread. A conversation is the set of rows between a given user pair.
export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("message_recipient_idx").on(t.recipientUserId),
    index("message_pair_idx").on(t.recipientUserId, t.senderUserId),
  ],
);

// Idempotency ledger (R8): a threshold crossing fans out only when a NEW row inserts here.
export const notificationEventLog = sqliteTable(
  "notification_event_log",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    threshold: integer("threshold"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("notification_event_log_uidx").on(t.eventId, t.kind, t.threshold)],
);

// Flag affordance (D19). The 3-flag auto-hide threshold + moderation UI are Feature 006.
export const flag = sqliteTable(
  "flag",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("flag_event_user_uidx").on(t.eventId, t.userId)],
);

// Static, admin-curated informational pins (D18). Not user-owned.
export const beitChabadPin = sqliteTable("beit_chabad_pin", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  city: text("city").notNull(),
  country: text("country").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
