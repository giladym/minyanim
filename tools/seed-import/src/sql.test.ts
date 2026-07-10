import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeedSql } from "./sql.ts";
import { deriveEvents, type AcceptedRecord } from "./gates.ts";
import type { MappingConfig } from "./mapping.ts";

const CFG: MappingConfig = {
  headerRowIndex: 0,
  columns: { name: 0, phone: 1, city: 2 },
  cityCountry: { CityA: "CountryX" },
  cityCoords: { CityA: [1.5, 2.5] },
  shabbatot: [{ label: "S1", date: "2030-01-04" }],
  defaultYear: 2030,
};

const acc = (o: Partial<AcceptedRecord>): AcceptedRecord => ({
  name: "N", phone: "+972500000000", city: "CityA", country: "CountryX", numMen: 3,
  arrivalDate: "2030-01-01", departureDate: "2030-01-10", bringsSeferTorah: false, address: null, notes: null, ...o,
});

test("buildSeedSql emits idempotent DELETE + per-person inserts, escaping quotes", () => {
  const accepted = [acc({ name: "O'Brien" }), acc({ name: "Second" })];
  const { sql, counts } = buildSeedSql(accepted, [], CFG);
  assert.match(sql, /DELETE FROM "user" WHERE kind='seed';/);
  assert.equal(counts.users, 2);
  assert.equal((sql.match(/INSERT INTO "user"/g) ?? []).length, 2);
  assert.equal((sql.match(/INSERT INTO phone_number/g) ?? []).length, 2);
  assert.equal((sql.match(/INSERT INTO stay/g) ?? []).length, 2);
  assert.match(sql, /'O''Brien'/); // single quote doubled
  assert.equal(counts.events, 0);
});

test("buildSeedSql creates events + commitments from derived plans", () => {
  const accepted = [acc({ name: "A" }), acc({ name: "B" })];
  const events = deriveEvents(accepted, CFG); // both cover the Shabbat → one CityA event, 2 attendees
  const { sql, counts } = buildSeedSql(accepted, events, CFG);
  assert.equal(counts.events, 1);
  assert.equal(counts.commitments, 2);
  assert.equal((sql.match(/INSERT INTO event\(/g) ?? []).length, 1);
  assert.equal((sql.match(/INSERT INTO minyan\(/g) ?? []).length, 1);
  assert.equal((sql.match(/INSERT INTO commitment\(/g) ?? []).length, 2);
  assert.match(sql, /'minyan'/);
});
