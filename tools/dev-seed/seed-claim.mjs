#!/usr/bin/env node
// @ts-check
/**
 * DEV-ONLY seed script for the SEED-USER CLAIM flow (feature 009).
 *
 * Goal: reproduce, in a running local dev environment, the exact scenario claim.test.ts covers so it
 * can be exercised by hand in the browser:
 *   - a SEED user (kind='seed', no login) that OWNS a stay + a hosted minyan, and
 *   - a REAL "claimer" user whose profile carries the SAME phone number,
 * so that when the claimer signs in, the dashboard's ClaimBanner offers the seed and — on confirm —
 * merges the seed's stay + minyan into the claimer's account (then deletes the seed).
 *
 * How it works (why it is not pure API, and why it is local-only):
 *   A real seed user has NO better-auth account, so it cannot be created through the sign-up API. We
 *   therefore create the seed's DATA as an ordinary user THROUGH THE REAL API (correct validation,
 *   timestamps, minyan detail row, phone) and then flip that user to a seed with two trivial,
 *   schema-stable SQL statements via `wrangler d1 execute` (set kind='seed'; delete its account +
 *   sessions so it can never authenticate). That SQL step needs direct D1 access, so this script
 *   targets the LOCAL Miniflare D1 by default (the same store `wrangler dev --local` reads).
 *
 * This script NEVER runs migrations. It defaults to --local; pass --remote deliberately (dev only).
 *
 * Prerequisites — a local backend on :8787 (same flags as tools/dev-seed/README.md) AND local
 * migrations applied (`pnpm --filter @minyanim/backend run db:migrate:local`).
 *
 * Usage:
 *   node tools/dev-seed/seed-claim.mjs
 *   node tools/dev-seed/seed-claim.mjs --phone +972521234567 --api http://localhost:8787
 *   node tools/dev-seed/seed-claim.mjs --remote        # dev only — flips a user to seed on remote D1
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Config / args
// ---------------------------------------------------------------------------

/** Parse `--flag value` (and bare `--flag`) pairs out of argv (dependency-free). */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const API_BASE = String(args.api || process.env.API_BASE || "http://localhost:8787").replace(/\/$/, "");
const DB_NAME = String(args.db || "minyanim");
const REMOTE = args.remote === true;
const PHONE = String(args.phone || "+972521234567"); // the shared match key (seed ↔ claimer)
const PASSWORD = "password123";

// The claimer is the account a human signs into to test the banner — fixed + known.
const CLAIMER = { name: "Claimer Tester", email: "claimer@test.local" };
// The seed's source account is throwaway (it gets flipped to kind='seed' and can never log in), so a
// random email avoids sign-up collisions when the script is re-run against a persisted DB.
const SEED_SRC = { name: "מיובא (Seed)", email: `seed-src-${crypto.randomUUID()}@test.local` };

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "backend");

// ---------------------------------------------------------------------------
// Dates — date-only epoch-ms at UTC midnight (002 convention). Minyan lands on the next Saturday
// ≥ 14 days out; the stay spans the Friday→Sunday around it so server "not in the past" checks pass.
// ---------------------------------------------------------------------------

const utcMidnight = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const addDays = (ms, days) => ms + days * 24 * 60 * 60 * 1000;
function nextSaturday(baseDate) {
  let ms = addDays(utcMidnight(baseDate), 14);
  while (new Date(ms).getUTCDay() !== 6) ms = addDays(ms, 1);
  return ms;
}
const baseDate = args.date ? new Date(`${args.date}T00:00:00Z`) : new Date();
if (Number.isNaN(baseDate.getTime())) {
  console.error(`Invalid --date "${args.date}". Use YYYY-MM-DD.`);
  process.exit(2);
}
const SHABBAT = nextSaturday(baseDate);
const ARRIVAL = addDays(SHABBAT, -1);
const DEPARTURE = addDays(SHABBAT, 1);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const LOCATION = { city: "Jerusalem", country: "Israel", lat: 31.7683, lng: 35.2137 };

// ---------------------------------------------------------------------------
// HTTP + per-user session (manual cookie jar — Node fetch does not persist cookies)
// ---------------------------------------------------------------------------

class Session {
  constructor(label) {
    this.label = label;
    /** @type {string} */ this.cookie = "";
  }
  captureCookies(res) {
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
  async request(method, path, body) {
    const headers = { "content-type": "application/json", origin: API_BASE };
    if (this.cookie) headers.cookie = this.cookie;
    return fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }
}

async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
function fail(step, res, body) {
  throw new Error(`${step} failed: HTTP ${res.status} — ${typeof body === "string" ? body : JSON.stringify(body)}`);
}

// ---------------------------------------------------------------------------
// Flows (mirror tools/dev-seed/seed.mjs)
// ---------------------------------------------------------------------------

async function ensureUser({ name, email }) {
  const session = new Session(email);
  const signUp = await session.request("POST", "/api/auth/sign-up/email", { name, email, password: PASSWORD });
  if (!signUp.ok) {
    const body = await readBody(signUp);
    const msg = JSON.stringify(body).toLowerCase();
    if (!(signUp.status === 422 || signUp.status === 400 || msg.includes("exist") || msg.includes("already"))) {
      fail(`sign-up (${email})`, signUp, body);
    }
  }
  const signIn = await session.request("POST", "/api/auth/sign-in/email", { email, password: PASSWORD });
  if (!signIn.ok) fail(`sign-in (${email})`, signIn, await readBody(signIn));
  if (!session.captureCookies(signIn)) fail(`sign-in (${email}) — no cookie`, signIn, await readBody(signIn));
  return session;
}

async function getUserId(session) {
  const res = await session.request("GET", "/api/me");
  const body = await readBody(res);
  if (!res.ok) fail(`get me (${session.label})`, res, body);
  return body.id;
}

/** Add a phone to the signed-in user's profile (the claim match key). Tolerates a re-run duplicate. */
async function addPhone(session, e164) {
  const res = await session.request("POST", "/api/me/phones", { e164, label: null });
  if (res.status === 201) return true;
  const body = await readBody(res);
  console.log(`  [${session.label}] add phone → HTTP ${res.status} (${JSON.stringify(body)}) — continuing`);
  return false;
}

async function createStay(session) {
  const payload = {
    city: LOCATION.city, country: LOCATION.country, lat: LOCATION.lat, lng: LOCATION.lng,
    addressPrivate: "1 Seed Street", arrivalDate: ARRIVAL, departureDate: DEPARTURE, numMen: 4,
    contactName: session.label, contactPhone: PHONE, groupMembers: null, notes: null, folderId: null,
  };
  const res = await session.request("POST", "/api/stays", payload);
  const body = await readBody(res);
  if (!res.ok) fail(`create stay (${session.label})`, res, body);
  return body.id;
}

async function hostMinyan(session, stayId) {
  const payload = {
    type: "minyan", city: LOCATION.city, country: LOCATION.country, lat: LOCATION.lat, lng: LOCATION.lng,
    addressPrivate: "1 Seed Street", addressNotes: "Ring the bell.", eventDate: SHABBAT, notes: "Seed-claim minyan",
    minyan: { nusach: "ashkenaz", seferTorah: true, services: [{ tefilla: "shacharit", time: "08:30" }, { tefilla: "mincha", time: "13:00" }] },
    hostNumMen: 3, stayId,
  };
  const res = await session.request("POST", "/api/events", payload);
  const body = await readBody(res);
  if (!res.ok) fail(`host minyan (${session.label})`, res, body);
  return body.id;
}

// ---------------------------------------------------------------------------
// SQL — flip a real user into a seed user (the only step that touches D1 directly).
// ---------------------------------------------------------------------------

/** Run one SQL statement against the target D1 via the backend's wrangler. */
function runSql(sql) {
  const flag = REMOTE ? "--remote" : "--local";
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", DB_NAME, flag, "--command", sql], {
    cwd: backendDir,
    stdio: ["ignore", "ignore", "inherit"],
  });
}

/** Convert `userId` into a claimable seed: kind='seed' + no auth account/session. */
function convertToSeed(userId) {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error(`refusing to run SQL with unexpected user id: ${userId}`);
  runSql(`UPDATE "user" SET kind = 'seed' WHERE id = '${userId}';`);
  runSql(`DELETE FROM account WHERE user_id = '${userId}';`);
  runSql(`DELETE FROM session WHERE user_id = '${userId}';`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Dev seed-claim → API ${API_BASE}  D1 ${DB_NAME} (${REMOTE ? "REMOTE" : "local"})`);
  console.log(`Shared phone: ${PHONE}   minyan date: ${iso(SHABBAT)}   stay: ${iso(ARRIVAL)} … ${iso(DEPARTURE)}\n`);

  // 1) Build the seed's data as an ordinary user THROUGH THE API (stay + hosted minyan + phone).
  console.log("• building seed source user (via API)");
  const src = await ensureUser(SEED_SRC);
  const srcId = await getUserId(src);
  const seedStay = await createStay(src);
  const seedMinyan = await hostMinyan(src, seedStay);
  await addPhone(src, PHONE);
  console.log(`  seed user ${srcId}: stay ${seedStay}, minyan ${seedMinyan}, phone ${PHONE}\n`);

  // 2) Flip it into a real SEED user (kind='seed', no account) via SQL.
  console.log(`• converting ${srcId} → kind='seed' (removing its login) via wrangler d1 execute`);
  convertToSeed(srcId);
  console.log("  done — this user can no longer sign in; its stay + minyan are now claimable\n");

  // 3) The real claimer: same phone on its profile → the seed becomes claimable to it.
  console.log("• building claimer (real user, same phone)");
  const claimer = await ensureUser(CLAIMER);
  await addPhone(claimer, PHONE);
  console.log(`  ${CLAIMER.email} now carries ${PHONE}\n`);

  console.log("=".repeat(72));
  console.log("SEED-CLAIM READY");
  console.log("=".repeat(72));
  console.log(`Claimer login:  ${CLAIMER.email} / ${PASSWORD}`);
  console.log(`Seed user id:   ${srcId}  (stay ${seedStay}, minyan ${seedMinyan})`);
  console.log("");
  console.log("How to test the claim flow (009):");
  console.log(`  1) Sign in as ${CLAIMER.email}. The dashboard ClaimBanner should offer 1 seed`);
  console.log(`     (1 stay + 1 minyan matched on ${PHONE}).`);
  console.log("  2) Confirm the claim → the seed's stay + minyan move to the claimer, seed is deleted.");
  console.log("  API check:  GET /api/me/claims  → lists the seed before, empty after.");
}

main().catch((err) => {
  console.error(`\nSEED-CLAIM FAILED: ${err.message}`);
  process.exit(1);
});
