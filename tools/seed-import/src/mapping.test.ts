import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSheet, type MappingConfig } from "./mapping.ts";

const CFG: MappingConfig = {
  headerRowIndex: 2, // banner rows 0–1, header row 2, data from row 3
  columns: { name: 0, phone: 1, city: 2, numMen: 3, arrival: 4, departure: 5, seferTorah: 6, notes: 7 },
  cityCountry: {},
  cityCoords: {},
  shabbatot: [],
  defaultYear: 2030,
};

test("mapSheet skips banner + header rows, reads columns, drops nameless rows", () => {
  const matrix = [
    ["Important links:", "", "", "", "", "", "", ""], // banner
    ["", "", "", "", "", "", "", ""], // banner
    ["name", "phone", "city", "men", "from", "to", "torah", "notes"], // header (row index 2)
    ["Alice", "0501111111", "CityA", "2", "01/01", "05/01", "TRUE", "hi"],
    ["", "0502222222", "CityA", "1", "", "", "", ""], // no name → skipped
    ["Bob", "0503333333", "CityB", "3", "02/02/2031", "09/02/2031", "false", ""],
  ];
  const recs = mapSheet(matrix, CFG);
  assert.equal(recs.length, 2);
  assert.deepEqual(
    { name: recs[0].name, city: recs[0].city, numMen: recs[0].numMen, sefer: recs[0].bringsSeferTorah, notes: recs[0].notes },
    { name: "Alice", city: "CityA", numMen: 2, sefer: true, notes: "hi" },
  );
  assert.equal(recs[0].arrivalRaw, "01/01");
  assert.equal(recs[1].name, "Bob");
  assert.equal(recs[1].bringsSeferTorah, false);
});
