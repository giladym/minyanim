/**
 * Minimal RFC-4180-ish CSV parser (no dependencies). Handles quoted fields, escaped quotes (""),
 * commas and newlines inside quotes, and both LF and CRLF line endings. Good enough for a
 * spreadsheet exported as CSV (Google Sheets → File → Download → Comma-separated values).
 *
 * Returns rows as arrays of raw string cells. Empty trailing lines are dropped.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Normalise a leading BOM (Excel/Sheets exports often prepend one).
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow — a following \n closes the row; a lone \r also closes it
      if (text[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else {
      field += ch;
    }
  }
  // Flush the final field/row unless the input ended exactly on a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty rows (e.g. blank trailing lines).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Parse a CSV into header + objects keyed by trimmed header names. Duplicate/empty headers get a
 * positional suffix so no column is silently lost.
 */
export function parseCsvToObjects(input: string): { headers: string[]; rows: Record<string, string>[] } {
  const matrix = parseCsv(input);
  if (matrix.length === 0) return { headers: [], rows: [] };
  const seen = new Map<string, number>();
  const headers = matrix[0].map((h, idx) => {
    const base = h.trim() || `col_${idx + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}_${n + 1}`;
  });
  const rows = matrix.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}
