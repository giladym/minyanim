import { test } from "node:test";
import assert from "node:assert/strict";
import { toE164, toIso, gate, deriveEvents } from "./gates.ts";
import type { MappingConfig, RawRecord } from "./mapping.ts";

const CFG: MappingConfig = {
  headerRowIndex: 0,
  columns: { name: 0, phone: 1, city: 2 },
  cityCountry: { CityA: "CountryX", CityB: "CountryX" },
  cityCoords: { CityA: [1, 2], CityB: [3, 4] },
  shabbatot: [{ label: "S1", date: "2030-01-04" }],
  defaultYear: 2030,
};

const raw = (o: Partial<RawRecord>): RawRecord => ({
  name: "N", phoneRaw: "0501234567", city: "CityA", numMen: 2,
  arrivalRaw: "01/01/2030", departureRaw: "10/01/2030", bringsSeferTorah: false, address: null, notes: null, ...o,
});

test("toE164 normalizes IL + international, rejects junk", () => {
  assert.equal(toE164("0501234567"), "+972501234567");
  assert.equal(toE164("050-123-4567"), "+972501234567");
  assert.equal(toE164("+972501234567"), "+972501234567");
  assert.equal(toE164("972501234567"), "+972501234567");
  assert.equal(toE164("not a phone"), null);
  assert.equal(toE164(""), null);
  assert.equal(toE164(null), null);
});

test("toIso parses d/m[/y] and defaults the year", () => {
  assert.equal(toIso("09/07/2026", 2030), "2026-07-09");
  assert.equal(toIso("9/7", 2026), "2026-07-09");
  assert.equal(toIso("31/13/2026", 2030), null); // bad month
  assert.equal(toIso("nope", 2030), null);
});

test("gate accepts a clean row and rejects by reason", () => {
  const res = gate(
    [
      raw({}),
      raw({ name: "BadPhone", phoneRaw: "xxx" }),
      raw({ name: "BadCity", city: "Nowhere" }),
      raw({ name: "NoDate", arrivalRaw: null }),
    ],
    CFG,
  );
  assert.equal(res.accepted.length, 1);
  assert.equal(res.accepted[0].phone, "+972501234567");
  assert.equal(res.accepted[0].country, "CountryX");
  const reasons = res.rejected.flatMap((r) => r.reasons);
  assert.ok(reasons.includes("phone_unnormalizable"));
  assert.ok(reasons.includes("city_unresolved"));
  assert.ok(reasons.includes("date_missing"));
});

test("collision gate excludes a phone already owned by a real user", () => {
  const existing = new Set(["+972501234567"]);
  const res = gate([raw({})], CFG, existing);
  assert.equal(res.accepted.length, 0);
  assert.equal(res.collisions.length, 1);
  assert.ok(res.collisions[0].reasons.includes("collision_existing_user"));
});

test("deriveEvents groups accepted stays covering a Shabbat by city", () => {
  const res = gate([raw({ name: "A" }), raw({ name: "B", city: "CityB" }), raw({ name: "C" })], CFG);
  const events = deriveEvents(res.accepted, CFG); // Shabbat 2030-01-04 is within 01–10 Jan for all
  const cityA = events.find((e) => e.city === "CityA");
  assert.equal(cityA?.attendeeIndexes.length, 2); // A + C
  assert.equal(events.find((e) => e.city === "CityB")?.attendeeIndexes.length, 1);
});
