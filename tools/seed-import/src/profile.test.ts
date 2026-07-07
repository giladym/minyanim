import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseCsvToObjects } from "./csv.ts";
import { classifyColumn, profileSheet } from "./profile.ts";

test("parseCsv handles quotes, escaped quotes, and newlines inside fields", () => {
  const csv = 'a,b,c\n1,"hello, world","line1\nline2"\n2,"she said ""hi""",x\n';
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], ["a", "b", "c"]);
  assert.deepEqual(rows[1], ["1", "hello, world", "line1\nline2"]);
  assert.deepEqual(rows[2], ["2", 'she said "hi"', "x"]);
});

test("parseCsv handles CRLF and a BOM, and drops blank lines", () => {
  const csv = "﻿h1,h2\r\nv1,v2\r\n\r\n";
  const rows = parseCsv(csv);
  assert.deepEqual(rows, [["h1", "h2"], ["v1", "v2"]]);
});

test("parseCsvToObjects keys rows by header and de-dupes/handles empty headers", () => {
  const { headers, rows } = parseCsvToObjects("name,name,\nDavid,Cohen,x\n");
  assert.deepEqual(headers, ["name", "name_2", "col_3"]);
  assert.deepEqual(rows, [{ name: "David", name_2: "Cohen", col_3: "x" }]);
});

test("classifyColumn detects phone/email/date/number/location by values + header", () => {
  assert.equal(classifyColumn("Phone", ["+972-54-123-4567", "0501234567", "054 987 6543"]), "phone");
  assert.equal(classifyColumn("contact", ["a@b.com", "c@d.org", "e@f.co.il"]), "email");
  assert.equal(classifyColumn("Arrival", ["2026-07-12", "2026-08-01", "12/07/2026"]), "date");
  assert.equal(classifyColumn("men", ["2", "4", "1"]), "number");
  // header hint carries a low-signal text column
  assert.equal(classifyColumn("City", ["Paris", "London", "Berlin"]), "location");
  assert.equal(classifyColumn("notes", ["", ""]), "empty");
});

test("classifyColumn does not misread a numeric id column as a phone", () => {
  assert.equal(classifyColumn("row", ["1", "2", "3"]), "number");
});

test("classifyColumn reads ISO dates as date, not phone (all-digits-with-separators)", () => {
  assert.equal(classifyColumn("Arrival", ["2026-08-01", "2026-08-10", "2026-09-02"]), "date");
  assert.equal(classifyColumn("Departure", ["01/08/2026", "10/08/2026"]), "date");
  // and a real phone still classifies as phone
  assert.equal(classifyColumn("Phone", ["+972501234567", "050-987-6543"]), "phone");
});

test("profileSheet reports fill rate, distinct count, and samples", () => {
  const { headers, rows } = parseCsvToObjects("name,phone,city\nA,+972501111111,Paris\nB,,Paris\nC,+972502222222,\n");
  const p = profileSheet(headers, rows);
  assert.equal(p.rowCount, 3);
  assert.equal(p.columnCount, 3);
  const phone = p.columns.find((c) => c.header === "phone")!;
  assert.equal(phone.filled, 2);
  assert.equal(phone.empty, 1);
  assert.equal(phone.guessedKind, "phone");
  const city = p.columns.find((c) => c.header === "city")!;
  assert.equal(city.distinct, 1); // "Paris" (x2) + one empty → 1 distinct non-empty
  assert.equal(city.guessedKind, "location");
});
