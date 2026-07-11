#!/usr/bin/env node
// @ts-check
/**
 * DEV-ONLY seed script for the Minyanim app.
 *
 * Goal: create test users + a *linked* minyan so the "Stay location-change guard" (feature 013)
 * can be exercised by hand. It creates:
 *   - a HOST who hosts a minyan FROM a stay (event.stayId = host's stay), and
 *   - a GUEST who joins that same minyan FROM their own stay (commitment.stayId = guest's stay).
 * Both therefore have a minyan linked to their stay via `commitment.stayId`, which is exactly what
 * the 013 guard reads (`GET /api/stays/:id/linked-minyanim`).
 *
 * Everything goes through the REAL better-auth + API flows (NOT direct SQL) because passwords are
 * hashed — so seeding has to sign up / sign in like a browser would. Node's fetch does not persist
 * cookies, so we capture `set-cookie` from sign-in and replay it as `cookie` per user (see Session).
 *
 * This script does NOT run migrations and NEVER targets production. Point it at a locally-running
 * backend (default http://localhost:8787). See tools/dev-seed/README.md for how to start one.
 *
 * Usage:
 *   node tools/dev-seed/seed.mjs [--api <url>] [--date YYYY-MM-DD]
 *   API_BASE=http://localhost:8787 node tools/dev-seed/seed.mjs
 */

// ---------------------------------------------------------------------------
// Config / args
// ---------------------------------------------------------------------------

/** Parse `--flag value` pairs out of argv (very small, dependency-free). */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const API_BASE = String(args.api || process.env.API_BASE || "http://localhost:8787").replace(/\/$/, "");

const PASSWORD = "password123";

// Test-user identities. All @test.local so they are obviously synthetic and never collide with
// real accounts. The admin identity mirrors the Playwright config's ADMIN_EMAILS allowlist.
const USERS = {
  regular: { name: "Regular Tester", email: "regular@test.local" },
  host: { name: "Host Tester", email: "host@test.local" },
  guest: { name: "Guest Tester", email: "guest@test.local" },
  admin: { name: "Admin Tester", email: "admin-e2e@example.com" },
};

// ---------------------------------------------------------------------------
// Date helpers — dates are date-only epoch-ms at UTC midnight of the civil date (002 convention).
// ---------------------------------------------------------------------------

/** UTC-midnight epoch-ms for a given Date's civil Y/M/D (matches the app's date-only convention). */
function utcMidnight(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Add whole days to an epoch-ms value (24h * days). */
function addDays(ms, days) {
  return ms + days * 24 * 60 * 60 * 1000;
}

/**
 * Compute the next Saturday that is at least 14 days out from the base date. This is the Shabbat the
 * minyan is hosted on. We keep it comfortably in the future so the server's destination-tz "not in
 * the past" checks always pass.
 */
function nextSaturday(baseDate) {
  let ms = utcMidnight(baseDate);
  ms = addDays(ms, 14); // minimum lead time
  // getUTCDay(): 0=Sun … 6=Sat. Walk forward to the next Saturday (0..6 days).
  while (new Date(ms).getUTCDay() !== 6) ms = addDays(ms, 1);
  return ms;
}

// Base date: either --date YYYY-MM-DD, or "now". This is a runtime script (not a workflow), so
// using the real clock as the base is fine.
const baseDate = args.date ? new Date(`${args.date}T00:00:00Z`) : new Date();
if (Number.isNaN(baseDate.getTime())) {
  console.error(`Invalid --date "${args.date}". Use YYYY-MM-DD.`);
  process.exit(2);
}

const SHABBAT = nextSaturday(baseDate); // Saturday, UTC-midnight epoch-ms
const ARRIVAL = addDays(SHABBAT, -1); // Friday before
const DEPARTURE = addDays(SHABBAT, 1); // Sunday after
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// Shared location for the linked stays + minyan so the guest's stay matches the minyan's city.
const LOCATION = { city: "Jerusalem", country: "Israel", lat: 31.7683, lng: 35.2137 };

// ---------------------------------------------------------------------------
// HTTP + per-user session (manual cookie jar — Node fetch does not persist cookies)
// ---------------------------------------------------------------------------

/** Holds one user's session cookie string and replays it on subsequent requests. */
class Session {
  constructor(label) {
    this.label = label;
    /** @type {string} */ this.cookie = "";
  }

  /** Extract `name=value` pairs from a Set-Cookie list and store them as a single Cookie header. */
  captureCookies(res) {
    // Node 18+ exposes getSetCookie(); fall back to the single-header form otherwise.
    const list =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
    const pairs = list.map((c) => c.split(";")[0].trim()).filter(Boolean);
    if (pairs.length) this.cookie = pairs.join("; ");
    return pairs.length > 0;
  }

  /** fetch() wrapper that sends this session's cookie and JSON-encodes the body. */
  async request(method, path, body) {
    const headers = { "content-type": "application/json" };
    if (this.cookie) headers.cookie = this.cookie;
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res;
  }
}

/** Read a response body as JSON when possible, else as text (for error logging). */
async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Throw with context on a genuine failure (network/5xx/unexpected 4xx). */
function fail(step, res, body) {
  const detail = typeof body === "string" ? body : JSON.stringify(body);
  throw new Error(`${step} failed: HTTP ${res.status} — ${detail}`);
}

// ---------------------------------------------------------------------------
// Auth + resource flows
// ---------------------------------------------------------------------------

/**
 * Ensure a user exists and return a signed-in Session. Idempotent-ish: if sign-up reports the email
 * already exists we simply proceed to sign in. Only sign-in reliably yields the session cookie, so
 * we always sign in explicitly (regardless of better-auth's autoSignIn behaviour).
 */
async function ensureUser({ name, email }) {
  const session = new Session(email);

  // 1) Sign up (tolerate "already exists").
  const signUp = await session.request("POST", "/api/auth/sign-up/email", { name, email, password: PASSWORD });
  if (signUp.ok) {
    console.log(`  [${email}] signed up`);
  } else {
    const body = await readBody(signUp);
    const msg = JSON.stringify(body).toLowerCase();
    if (signUp.status === 422 || signUp.status === 400 || msg.includes("exist") || msg.includes("already")) {
      console.log(`  [${email}] already exists — continuing to sign in`);
    } else {
      fail(`sign-up (${email})`, signUp, body);
    }
  }

  // 2) Sign in and capture the session cookie.
  const signIn = await session.request("POST", "/api/auth/sign-in/email", { email, password: PASSWORD });
  if (!signIn.ok) fail(`sign-in (${email})`, signIn, await readBody(signIn));
  if (!session.captureCookies(signIn)) {
    fail(`sign-in (${email}) — no session cookie returned`, signIn, await readBody(signIn));
  }
  console.log(`  [${email}] signed in (session cookie captured)`);
  return session;
}

/** Create a Stay for the signed-in session; returns the created stay's id. */
async function createStay(session, overrides) {
  /** @type {Record<string, unknown>} CreateStayInput (packages/shared/src/schemas/stay.ts) */
  const payload = {
    city: LOCATION.city,
    country: LOCATION.country,
    lat: LOCATION.lat,
    lng: LOCATION.lng,
    addressPrivate: "1 Test Street",
    arrivalDate: ARRIVAL,
    departureDate: DEPARTURE,
    numMen: 4,
    bringsSeferTorah: false,
    // PrayerNeedsSchema — Shabbat is the always-on baseline; only weekday flags are stored.
    prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
    contactName: session.label,
    contactPhone: "+972500000000",
    contactEmail: session.label,
    groupMembers: null,
    notes: null,
    folderId: null,
    ...overrides,
  };
  const res = await session.request("POST", "/api/stays", payload);
  const body = await readBody(res);
  if (!res.ok) fail(`create stay (${session.label})`, res, body);
  return body.id;
}

/** Host a Minyan FROM a stay; returns the created event's id. `stayId` links it to the host's stay. */
async function hostMinyan(session, stayId) {
  /** @type {Record<string, unknown>} CreateEventInput (packages/shared/src/schemas/event.ts) */
  const payload = {
    type: "minyan",
    city: LOCATION.city,
    country: LOCATION.country,
    lat: LOCATION.lat,
    lng: LOCATION.lng,
    addressPrivate: "1 Test Street",
    addressNotes: "Ring the bell.",
    eventDate: SHABBAT,
    notes: "Dev seed minyan",
    // MinyanAttrsSchema — at least one service required.
    minyan: {
      nusach: "ashkenaz",
      seferTorah: true,
      services: [
        { tefilla: "shacharit", time: "08:30" },
        { tefilla: "mincha", time: "13:00" },
      ],
    },
    hostNumMen: 3,
    // 013: persisted on the host's self-commitment so the minyan is trackable back to this Stay.
    stayId,
  };
  const res = await session.request("POST", "/api/events", payload);
  const body = await readBody(res);
  if (!res.ok) fail(`host minyan (${session.label})`, res, body);
  return body.id;
}

/** Commit the signed-in session to a Minyan FROM their stay; links via commitment.stayId. */
async function commitToMinyan(session, eventId, stayId) {
  /** @type {Record<string, unknown>} CreateCommitmentInput (packages/shared/src/schemas/commitment.ts) */
  const payload = { numMen: 2, stayId };
  const res = await session.request("POST", `/api/events/${eventId}/commit`, payload);
  const body = await readBody(res);
  if (!res.ok) fail(`commit to minyan (${session.label})`, res, body);
  return body;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Dev seed → API ${API_BASE}`);
  console.log(`Shabbat (minyan date): ${iso(SHABBAT)}  stay range: ${iso(ARRIVAL)} … ${iso(DEPARTURE)}\n`);

  // 1) Regular user: one plain stay, no minyan.
  console.log("• regular@test.local (plain user + stay)");
  const regular = await ensureUser(USERS.regular);
  const regularStay = await createStay(regular);
  console.log(`  stay: ${regularStay}\n`);

  // 2) Host: Stay S, then Minyan M hosted FROM S (event.stayId = S).
  console.log("• host@test.local (stay S + minyan M hosted from S)");
  const host = await ensureUser(USERS.host);
  const stayS = await createStay(host);
  console.log(`  stay S: ${stayS}`);
  const minyanM = await hostMinyan(host, stayS);
  console.log(`  minyan M: ${minyanM} (linked to stay S via host self-commitment)\n`);

  // 3) Guest: Stay G, then commit to M FROM G (commitment.stayId = G).
  console.log("• guest@test.local (stay G + commitment to M from G)");
  const guest = await ensureUser(USERS.guest);
  const stayG = await createStay(guest);
  console.log(`  stay G: ${stayG}`);
  await commitToMinyan(guest, minyanM, stayG);
  console.log(`  committed to minyan M (linked to stay G via commitment.stayId)\n`);

  // 4) Admin identity — DO NOT try to create an admin; admin is env-gated via ADMIN_EMAILS. We just
  //    ensure the account exists so it can sign in locally (promotion happens server-side when the
  //    email is in the backend's ADMIN_EMAILS allowlist).
  console.log("• admin-e2e@example.com (account only — promotion is env-gated by ADMIN_EMAILS)");
  await ensureUser(USERS.admin);
  console.log("");

  // Summary
  console.log("=".repeat(72));
  console.log("SEED COMPLETE");
  console.log("=".repeat(72));
  console.log("Logins (all password: password123):");
  console.log(`  regular@test.local   stay:        ${regularStay}`);
  console.log(`  host@test.local      stay S:      ${stayS}`);
  console.log(`  guest@test.local     stay G:      ${stayG}`);
  console.log(`  minyan M (hosted from S):        ${minyanM}`);
  console.log(`  admin-e2e@example.com (admin only if in backend ADMIN_EMAILS)`);
  console.log("");
  console.log("How to test the Stay location-change guard (013):");
  console.log("  1) Sign in as host@test.local → open Stay S → edit → change the city.");
  console.log(`     The guard should list Minyan M (${minyanM}) as HOST.`);
  console.log("  2) Sign in as guest@test.local → edit Stay G → change the city.");
  console.log(`     The guard should list Minyan M (${minyanM}) as PARTICIPANT.`);
  console.log(`  (API check: GET /api/stays/<id>/linked-minyanim returns M for both S and G.)`);
}

main().catch((err) => {
  console.error(`\nSEED FAILED: ${err.message}`);
  process.exit(1);
});
