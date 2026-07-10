/**
 * Seed-import STEP 3 (quality gates, pure). Turns RawRecords into either an accepted record (ready
 * to create) or a rejected one with reasons. Gates: E.164 phone, resolvable city, valid dates, and
 * the COLLISION gate — never create a seed for a phone that already belongs to a real user (F4).
 */
import type { MappingConfig, RawRecord } from "./mapping.ts";

/** A record that passed every gate — normalized + ready for SQL generation. */
export interface AcceptedRecord {
  name: string;
  phone: string; // E.164
  city: string;
  country: string;
  numMen: number;
  arrivalDate: string; // ISO yyyy-mm-dd
  departureDate: string;
  bringsSeferTorah: boolean;
  address: string | null;
  notes: string | null;
}

export interface RejectedRecord {
  name: string;
  reasons: string[]; // e.g. ["phone_unnormalizable"], ["city_unresolved"], ["collision_existing_user"]
}

export interface GateResult {
  accepted: AcceptedRecord[];
  rejected: RejectedRecord[];
  /** Subset of rejected caused by the collision gate — surfaced separately so it's noticed. */
  collisions: RejectedRecord[];
}

/** Normalize a phone to E.164. Handles IL local (0X…) + already-international; null if not confident. */
export function toE164(raw: string | null): string | null {
  const s = (raw ?? "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
  if (s.startsWith("972")) return `+${s}`;
  if (s.startsWith("0")) return `+972${s.slice(1)}`;
  if (/^5\d{8}$/.test(s)) return `+972${s}`; // bare IL mobile
  return null;
}

/** Parse a d/m[/y] date cell to ISO yyyy-mm-dd. Missing year → `defaultYear`. Null if unparseable. */
export function toIso(raw: string | null, defaultYear: number): string | null {
  const m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec((raw ?? "").trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : defaultYear;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Apply the gates. `existingRealPhones` is the set of E.164 numbers already owned by real users
 * (query dev before generating); any seed sharing one is a collision and excluded.
 */
export function gate(
  records: RawRecord[],
  config: MappingConfig,
  existingRealPhones: Set<string> = new Set(),
): GateResult {
  const accepted: AcceptedRecord[] = [];
  const rejected: RejectedRecord[] = [];
  const collisions: RejectedRecord[] = [];

  for (const r of records) {
    const reasons: string[] = [];
    const phone = toE164(r.phoneRaw);
    const country = r.city ? config.cityCountry[r.city] : undefined;
    const arrivalDate = toIso(r.arrivalRaw, config.defaultYear);
    const departureDate = toIso(r.departureRaw, config.defaultYear);

    if (!phone) reasons.push("phone_unnormalizable");
    if (!country) reasons.push("city_unresolved");
    if (!arrivalDate || !departureDate) reasons.push("date_missing");
    else if (departureDate < arrivalDate) reasons.push("date_range_invalid");
    // Collision gate runs only once the phone is usable (otherwise it can't match anything).
    if (phone && existingRealPhones.has(phone)) reasons.push("collision_existing_user");

    if (reasons.length > 0) {
      const rec = { name: r.name, reasons };
      rejected.push(rec);
      if (reasons.includes("collision_existing_user")) collisions.push(rec);
      continue;
    }
    accepted.push({
      name: r.name,
      phone: phone!,
      city: r.city!,
      country: country!,
      numMen: r.numMen && r.numMen > 0 ? r.numMen : 1,
      arrivalDate: arrivalDate!,
      departureDate: departureDate!,
      bringsSeferTorah: r.bringsSeferTorah,
      address: r.address,
      notes: r.notes,
    });
  }
  return { accepted, rejected, collisions };
}

/** A candidate minyan: a (city × Shabbat) where ≥1 accepted person's stay covers that Shabbat. */
export interface EventPlan {
  city: string;
  shabbatLabel: string;
  date: string; // ISO
  attendeeIndexes: number[]; // indexes into the accepted[] array
}

/** Derive candidate minyanim from stay coverage (a person "attends" a Shabbat within their dates). */
export function deriveEvents(accepted: AcceptedRecord[], config: MappingConfig): EventPlan[] {
  const events: EventPlan[] = [];
  for (const sh of config.shabbatot) {
    const byCity = new Map<string, number[]>();
    accepted.forEach((s, i) => {
      if (s.arrivalDate <= sh.date && sh.date <= s.departureDate) {
        const list = byCity.get(s.city) ?? [];
        list.push(i);
        byCity.set(s.city, list);
      }
    });
    for (const [city, attendeeIndexes] of byCity) {
      events.push({ city, shabbatLabel: sh.label, date: sh.date, attendeeIndexes });
    }
  }
  return events;
}
