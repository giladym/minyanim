/**
 * Column profiling for the seed-import "inspect" step. Given the parsed rows, produce a structural
 * report — per column: fill rate, distinct count, a few sample values, and a guessed semantic kind
 * (phone / email / date / number / location / text) inferred from BOTH the header name and the
 * values. This is what lets us decide "what does a row represent" before writing any importer.
 *
 * No PII leaves the user's machine — this runs locally and writes JSON to disk.
 */

export type ColumnKind = "phone" | "email" | "date" | "number" | "location" | "name" | "text" | "empty";

export interface ColumnProfile {
  header: string;
  filled: number;
  empty: number;
  fillRate: number; // 0..1
  distinct: number;
  samples: string[]; // up to 5 non-empty examples
  guessedKind: ColumnKind;
}

export interface SheetProfile {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
}

// Header-name hints (Hebrew + English) → kind. Checked case-insensitively as substrings.
const HEADER_HINTS: ReadonlyArray<readonly [kind: ColumnKind, terms: readonly string[]]> = [
  ["phone", ["phone", "mobile", "cell", "tel", "טלפון", "נייד", "פלאפון", "סלולרי"]],
  ["email", ["email", "e-mail", "mail", "מייל", "אימייל", "דוא", "דואל"]],
  ["date", ["date", "arrival", "depart", "from", "to", "when", "תאריך", "הגעה", "עזיבה", "יציאה", "חזרה", "מתי"]],
  ["location", ["city", "country", "location", "destination", "place", "address", "עיר", "מדינה", "יעד", "מיקום", "מקום", "כתובת", "יישוב"]],
  ["name", ["name", "first", "last", "full", "שם", "שם מלא", "פרטי", "משפחה"]],
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose phone shape: 7+ digits, allowing +, spaces, dashes, parens, dots.
const PHONE_RE = /^[+()\-.\s]*(?:\d[()\-.\s]*){7,}$/;

function looksLikeDate(v: string): boolean {
  if (/^\d{1,4}[./-]\d{1,2}([./-]\d{1,4})?$/.test(v)) return true; // 12/07, 2026-07-12, 12.7.26
  const t = Date.parse(v);
  return !Number.isNaN(t) && /\d/.test(v) && v.length >= 6;
}

function looksLikeNumber(v: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(v);
}

function headerHint(header: string): ColumnKind | null {
  const h = header.toLowerCase();
  for (const [kind, terms] of HEADER_HINTS) {
    if (terms.some((term) => h.includes(term))) return kind;
  }
  return null;
}

/** Guess a column's kind from its (non-empty) values, with the header name as a tie-breaker/hint. */
export function classifyColumn(header: string, values: string[]): ColumnKind {
  const nonEmpty = values.filter((v) => v !== "");
  if (nonEmpty.length === 0) return "empty";

  const frac = (pred: (v: string) => boolean) => nonEmpty.filter(pred).length / nonEmpty.length;
  const hint = headerHint(header);

  // Value-driven signals first (strong), then fall back to the header hint. Dates are checked
  // BEFORE phones: an ISO date like "2026-08-01" is all-digits-with-separators and would otherwise
  // trip the loose phone shape, but a real phone never parses as a date.
  if (frac((v) => EMAIL_RE.test(v)) >= 0.7) return "email";
  if (frac(looksLikeDate) >= 0.7) return "date";
  if (frac((v) => PHONE_RE.test(v)) >= 0.7 && frac((v) => (v.match(/\d/g)?.length ?? 0) >= 7) >= 0.7) return "phone";
  if (frac(looksLikeNumber) >= 0.9) return "number";
  if (hint) return hint; // header says location/name/etc. and values didn't strongly say otherwise
  return "text";
}

export function profileSheet(headers: string[], rows: Record<string, string>[]): SheetProfile {
  const columns: ColumnProfile[] = headers.map((header) => {
    const values = rows.map((r) => r[header] ?? "");
    const nonEmpty = values.filter((v) => v !== "");
    const distinct = new Set(nonEmpty).size;
    const samples: string[] = [];
    for (const v of nonEmpty) {
      if (!samples.includes(v)) samples.push(v);
      if (samples.length >= 5) break;
    }
    return {
      header,
      filled: nonEmpty.length,
      empty: values.length - nonEmpty.length,
      fillRate: values.length === 0 ? 0 : nonEmpty.length / values.length,
      distinct,
      samples,
      guessedKind: classifyColumn(header, values),
    };
  });
  return { rowCount: rows.length, columnCount: headers.length, columns };
}
