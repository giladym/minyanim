/**
 * Seed-import STEP 4 (SQL generation, pure). Turns accepted records + derived events into a single
 * reviewable `upsert.sql` for dev D1. Leads with `DELETE FROM "user" WHERE kind='seed'` so re-applying
 * is idempotent (cascades away the previous seed set). Dates are epoch SECONDS (Drizzle timestamp
 * mode); created/updated use `unixepoch()`. NOTHING is applied here — the caller reviews + runs it via
 * `wrangler d1 execute --remote --file` (dev only; writes require explicit human action).
 */
import type { MappingConfig } from "./mapping.ts";
import type { AcceptedRecord, EventPlan } from "./gates.ts";

const esc = (s: string | null): string => (s == null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const secs = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00.000Z`) / 1000);
const PRAYER_NEEDS = JSON.stringify({ weekday: { shacharit: false, mincha: false, maariv: false } });
const SHABBAT_SERVICES = JSON.stringify([{ tefilla: "shacharit", time: null }]);

export interface SqlPlan {
  sql: string;
  counts: { users: number; phones: number; stays: number; events: number; commitments: number };
}

/** Build the full seed upsert. `events` reference `accepted` by index (see deriveEvents). */
export function buildSeedSql(accepted: AcceptedRecord[], events: EventPlan[], config: MappingConfig): SqlPlan {
  const L: string[] = [];
  L.push("-- 009 seed import (dev only). Real community PII — do not commit. Review before apply.");
  L.push("-- Idempotent: clears the prior seed set first (cascades their stays/events/commitments).");
  L.push('DELETE FROM "user" WHERE kind=\'seed\';');
  L.push("");

  accepted.forEach((s, i) => {
    const uid = `usr_seed_${i + 1}`;
    const [lat, lng] = config.cityCoords[s.city];
    L.push(
      `INSERT INTO "user"(id,name,email,email_verified,kind,created_at,updated_at) ` +
        `VALUES(${esc(uid)},${esc(s.name)},${esc(`seed-${i + 1}@zakopane.seed.local`)},0,'seed',unixepoch(),unixepoch());`,
    );
    L.push(
      `INSERT INTO phone_number(id,user_id,e164,created_at) ` +
        `VALUES(${esc(`phn_seed_${i + 1}`)},${esc(uid)},${esc(s.phone)},unixepoch());`,
    );
    L.push(
      `INSERT INTO stay(id,user_id,city,country,lat,lng,arrival_date,departure_date,num_men,brings_sefer_torah,` +
        `prayer_needs,status,contact_name,contact_phone,notes,created_at,updated_at) VALUES(` +
        `${esc(`sty_seed_${i + 1}`)},${esc(uid)},${esc(s.city)},${esc(s.country)},${lat},${lng},` +
        `${secs(s.arrivalDate)},${secs(s.departureDate)},${s.numMen},${s.bringsSeferTorah ? 1 : 0},` +
        `${esc(PRAYER_NEEDS)},'active',${esc(s.name)},${esc(s.phone)},${esc(s.notes)},unixepoch(),unixepoch());`,
    );
  });
  L.push("");

  let cmt = 0;
  let commitments = 0;
  events.forEach((e, ei) => {
    if (e.attendeeIndexes.length === 0) return;
    const eid = `evt_seed_${ei + 1}`;
    const host = e.attendeeIndexes[0];
    const [lat, lng] = config.cityCoords[e.city];
    L.push(
      `INSERT INTO event(id,type,host_user_id,city,country,lat,lng,event_date,status,hidden,created_at,updated_at) ` +
        `VALUES(${esc(eid)},'minyan',${esc(`usr_seed_${host + 1}`)},${esc(e.city)},${esc(accepted[host].country)},` +
        `${lat},${lng},${secs(e.date)},'forming',0,unixepoch(),unixepoch());`,
    );
    L.push(`INSERT INTO minyan(event_id,nusach,sefer_torah,services) VALUES(${esc(eid)},'any',0,${esc(SHABBAT_SERVICES)});`);
    for (const idx of e.attendeeIndexes) {
      L.push(
        `INSERT INTO commitment(id,event_id,user_id,num_men,stay_id,created_at,updated_at) ` +
          `VALUES(${esc(`cmt_seed_${++cmt}`)},${esc(eid)},${esc(`usr_seed_${idx + 1}`)},${accepted[idx].numMen},` +
          `${esc(`sty_seed_${idx + 1}`)},unixepoch(),unixepoch());`,
      );
      commitments++;
    }
  });

  const eventCount = events.filter((e) => e.attendeeIndexes.length > 0).length;
  return {
    sql: L.join("\n") + "\n",
    counts: { users: accepted.length, phones: accepted.length, stays: accepted.length, events: eventCount, commitments },
  };
}
