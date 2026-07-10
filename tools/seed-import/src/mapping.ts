/**
 * Seed-import STEP 2 (mapping config + pure mapper).
 *
 * The source sheet is a human-laid-out dashboard, not a clean table: banner/navigation rows on top,
 * the real header a few rows down, and a second (summary) table off to the right. A `MappingConfig`
 * says where the people table is and which column is which, so `mapSheet` can pull clean records out
 * of the raw CSV matrix. Keep the layout knowledge HERE (per-sheet), not spread through the pipeline.
 */

/** Where the people-table lives + which 0-based column carries which field. */
export interface MappingConfig {
  /** 0-based index of the real header row (data begins on the next row). */
  headerRowIndex: number;
  /** 0-based column indices. Omit a field to leave it null. */
  columns: {
    name: number;
    phone: number;
    city: number;
    numMen?: number;
    arrival?: number;
    departure?: number;
    address?: number;
    seferTorah?: number;
    notes?: number;
  };
  /** Known city → country. A row whose city isn't a key is rejected by the location gate. */
  cityCountry: Record<string, string>;
  /** city → [lat, lng] for the stays/events (the source has no coordinates). */
  cityCoords: Record<string, [number, number]>;
  /** The season's Shabbatot (label + ISO date) — used to derive candidate minyanim from coverage. */
  shabbatot: { label: string; date: string }[];
  /** Year to assume when a date cell omits it (e.g. "9/7"). */
  defaultYear: number;
}

/** One person/trip pulled from the sheet, before normalization/gating (Step 3). */
export interface RawRecord {
  name: string;
  phoneRaw: string;
  city: string | null;
  numMen: number | null;
  arrivalRaw: string | null;
  departureRaw: string | null;
  bringsSeferTorah: boolean;
  address: string | null;
  notes: string | null;
}

const cell = (row: string[], i: number | undefined): string => (i == null ? "" : (row[i] ?? "").trim());

/** Pull clean RawRecords out of the raw CSV matrix using the config. Rows with no name are skipped. */
export function mapSheet(matrix: string[][], config: MappingConfig): RawRecord[] {
  const out: RawRecord[] = [];
  for (let r = config.headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const name = cell(row, config.columns.name);
    if (!name) continue; // spacer / blank row
    const numMenRaw = cell(row, config.columns.numMen);
    out.push({
      name,
      phoneRaw: cell(row, config.columns.phone),
      city: cell(row, config.columns.city) || null,
      numMen: numMenRaw ? Number(numMenRaw) || null : null,
      arrivalRaw: cell(row, config.columns.arrival) || null,
      departureRaw: cell(row, config.columns.departure) || null,
      bringsSeferTorah: cell(row, config.columns.seferTorah).toUpperCase() === "TRUE",
      address: cell(row, config.columns.address) || null,
      notes: cell(row, config.columns.notes) || null,
    });
  }
  return out;
}

/**
 * Mapping for the "מנינים זאקופנה – תשפו" sheet (rows 9+ after the row-8 header; left people table
 * cols A–L). Three real towns in the Tatra region, Poland. Dates in the sheet omit the year → 2026.
 */
export const ZAKOPANE_MAPPING: MappingConfig = {
  headerRowIndex: 7, // 0-based → header is spreadsheet row 8
  columns: { name: 0, phone: 1, address: 2, city: 3, numMen: 4, arrival: 5, departure: 6, seferTorah: 10, notes: 11 },
  cityCountry: { "זקופנה": "פולין", "קושצ'ליסקו": "פולין", "מורזאסיחלה": "פולין" },
  cityCoords: { "זקופנה": [49.2992, 19.9496], "קושצ'ליסקו": [49.2833, 19.8833], "מורזאסיחלה": [49.317, 20.05] },
  shabbatot: [
    { label: "ואתחנן", date: "2026-07-25" },
    { label: "עקב", date: "2026-08-01" },
    { label: "ראה", date: "2026-08-08" },
  ],
  defaultYear: 2026,
};
