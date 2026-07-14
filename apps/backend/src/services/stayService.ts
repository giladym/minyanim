import {
  ERROR_CODES,
  type CreateStayInputType,
  type UpdateStayInputType,
  type OwnerStayDTO,
  type HistoryPage,
} from "@minyanim/shared";
import type { Db } from "../db/client";
import { AppError } from "../lib/errors";
import { assertUserActive } from "../lib/enforcement";
import { tzFromCoords, civilDate, todayCivil, coversShabbat } from "../lib/timezone";
import {
  createStay as repoCreate,
  getStayById as repoGet,
  listStays as repoList,
  listStaysForHistory as repoHistory,
  updateStay as repoUpdate,
  cancelStay as repoCancel,
  hardDeleteStay as repoHardDelete,
  type StayRow,
  type HistoryCursor,
} from "../repositories/stayRepository";
// 003 (D12/R9): after a Stay cancel/edit, reconcile any commitments linked to it (auto-withdraw
// when the Stay no longer covers the event date). 002 service → 003 service is the intended seam.
import { reconcileCommitmentsForStay } from "./commitmentService";
// 004 (R7/D6): assigning a Stay to a folder must verify the caller owns it (FK alone is not enough
// — a foreign folder row exists, so the FK passes). Throws NotFound, never leaking existence.
import { assertFolderOwned } from "./folderService";

/** Normalize an epoch-ms instant to a Date at UTC midnight of its UTC civil date (D4). */
function toUtcMidnight(epochMs: number): Date {
  const d = new Date(epochMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Resolve the destination timezone for temporal checks: coords win (tz-lookup), else the
 * client-supplied tz, else null (caller applies the ±1-day tolerance).
 */
function resolveTz(lat: number | null | undefined, lng: number | null | undefined, clientTz?: string): string | null {
  if (typeof lat === "number" && typeof lng === "number") return tzFromCoords(lat, lng);
  if (clientTz) return clientTz;
  return null;
}

/**
 * Reject a date that is before the destination-local today (D3). When no timezone is resolvable,
 * allow with a ±1-day tolerance (compare against yesterday-UTC) rather than rejecting.
 *
 * @param date The UTC-midnight date under test.
 * @param tz The resolved destination timezone, or null when none is available.
 * @param field The field name attached to the thrown `DATE_IN_PAST` error.
 */
function assertNotPast(date: Date, tz: string | null, field: string): void {
  const dateCivil = civilDate(date, "UTC");
  if (tz) {
    if (dateCivil < todayCivil(tz)) {
      throw new AppError(400, ERROR_CODES.DATE_IN_PAST, field);
    }
    return;
  }
  // No tz available: ±1-day tolerance — only reject if before yesterday (UTC).
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (dateCivil < civilDate(yesterday, "UTC")) {
    throw new AppError(400, ERROR_CODES.DATE_IN_PAST, field);
  }
}

/**
 * Map a stored row to the owner DTO, computing derived `isPast` / `coversShabbat` (D5/D7).
 *
 * @param clientTz The viewer's `X-Client-Timezone`, used for `isPast` when the stay has no
 *   coordinates (manual entry) so the read-path matches the create-path check.
 */
function toOwnerDTO(row: StayRow, clientTz?: string): OwnerStayDTO {
  const tz = resolveTz(row.lat, row.lng, clientTz) ?? "UTC";
  const departureCivil = civilDate(row.departureDate, "UTC");
  const status = row.status === "cancelled" ? "cancelled" : "active";
  const isPast = departureCivil < todayCivil(tz);
  // historyTag (004 D2): cancelled wins over attended; active+past → attended; else null
  // (active/upcoming). For coordless Stays read on the History path, callers omit clientTz so tz
  // falls back to UTC — keeping History membership stable across devices (R5).
  const historyTag: OwnerStayDTO["historyTag"] =
    status === "cancelled" ? "cancelled" : isPast ? "attended" : null;
  return {
    id: row.id,
    city: row.city,
    country: row.country,
    lat: row.lat,
    lng: row.lng,
    addressPrivate: row.addressPrivate,
    arrivalDate: row.arrivalDate.getTime(),
    departureDate: row.departureDate.getTime(),
    numMen: row.numMen,
    status,
    isPast,
    coversShabbat: coversShabbat(row.arrivalDate, row.departureDate, tz),
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    groupMembers: row.groupMembers,
    notes: row.notes,
    folderId: row.folderId,
    historyTag,
    images: row.images ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

/**
 * Create a stay for the user. Applies the destination-tz temporal rule (arrival not in the past),
 * normalizes dates to UTC midnight, validates prayer-needs, and snapshots contact fields.
 *
 * @param clientTz The `X-Client-Timezone` header value (used when the stay has no coordinates).
 */
export async function createStay(
  db: Db,
  userId: string,
  input: CreateStayInputType,
  clientTz?: string,
): Promise<OwnerStayDTO> {
  await assertUserActive(db, userId); // FR-005/010 — banned/suspended cannot create
  const arrival = toUtcMidnight(input.arrivalDate);
  const departure = toUtcMidnight(input.departureDate);
  const tz = resolveTz(input.lat, input.lng, clientTz);
  assertNotPast(arrival, tz, "arrivalDate");
  if (input.folderId != null) await assertFolderOwned(db, userId, input.folderId);

  const now = new Date();
  const row = await repoCreate(db, {
    id: crypto.randomUUID(),
    userId,
    city: input.city,
    country: input.country,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    addressPrivate: input.addressPrivate ?? null,
    arrivalDate: arrival,
    departureDate: departure,
    numMen: input.numMen,
    status: "active",
    contactName: input.contactName ?? null,
    contactPhone: input.contactPhone ?? null,
    contactEmail: input.contactEmail ?? null,
    groupMembers: input.groupMembers ?? null,
    notes: input.notes ?? null,
    folderId: input.folderId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return toOwnerDTO(row);
}

/**
 * Fetch one owned stay as an owner DTO, or null if missing/not owned.
 *
 * @param clientTz The viewer's `X-Client-Timezone`, threaded into `isPast` for coordless stays.
 */
export async function getStay(
  db: Db,
  userId: string,
  id: string,
  clientTz?: string,
): Promise<OwnerStayDTO | null> {
  const row = await repoGet(db, userId, id);
  return row ? toOwnerDTO(row, clientTz) : null;
}

/**
 * List the user's ACTIVE-dashboard stays (004 D1): `status='active'` AND not past
 * (upcoming/in-progress), nearest-first. Past-active stays move to History — so they're filtered
 * out here in-service (`isPast` is tz-derived, not a SQL column).
 *
 * @param clientTz The viewer's `X-Client-Timezone`, threaded into `isPast` for coordless stays.
 */
export async function listStays(
  db: Db,
  userId: string,
  clientTz?: string,
): Promise<OwnerStayDTO[]> {
  const rows = await repoList(db, userId);
  return rows.map((row) => toOwnerDTO(row, clientTz)).filter((s) => !s.isPast);
}

/** Default History page size (004 D10). The repo over-fetches a +1 probe to detect a next page. */
const HISTORY_PAGE_SIZE = 20;
/** Max coarse batches to scan per page request — a safety bound on the refine loop. */
const HISTORY_MAX_BATCHES = 20;

/** Encode a kept row's keyset position as an opaque cursor: base64 `${departureMs}_${id}`. */
function encodeCursor(dto: OwnerStayDTO): string {
  return btoa(`${dto.departureDate}_${dto.id}`);
}

/** Decode a cursor back to its keyset components, or null if absent/malformed. */
function decodeCursor(cursor?: string): HistoryCursor | null {
  if (!cursor) return null;
  try {
    const [ms, id] = atob(cursor).split("_");
    const departureMs = Number(ms);
    if (!id || !Number.isFinite(departureMs)) return null;
    return { departureMs, id };
  } catch {
    return null;
  }
}

/**
 * The History page (004 D2/D10/R5): past (`attended`) + cancelled stays, newest-departure first,
 * keyset-paginated. Because `isPast`/`historyTag` are tz-derived in-service (not SQL), the coarse
 * SQL over-fetches, this refines by `historyTag != null`, and the cursor is re-derived from the
 * last KEPT row — looping over batches until `pageSize + 1` kept rows accumulate (the +1 proves a
 * next page) or the source is exhausted, so pages are complete + non-duplicated (SC-005).
 *
 * Coordless stays are mapped WITHOUT `clientTz` → their `isPast` pins to UTC, keeping History
 * membership stable across devices (R5/ARC-10).
 */
export async function listStayHistory(
  db: Db,
  userId: string,
  cursor?: string,
  limit: number = HISTORY_PAGE_SIZE,
): Promise<HistoryPage> {
  // Coarse boundary: tomorrow's UTC midnight (today_utc + 1 day) — inclusive of anything that the
  // tz-aware refine might still keep, never excluding a real history row.
  const now = new Date();
  const boundary = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

  const kept: OwnerStayDTO[] = [];
  let coarse = decodeCursor(cursor);
  let exhausted = false;
  for (let batch = 0; kept.length <= limit && !exhausted && batch < HISTORY_MAX_BATCHES; batch++) {
    const rows = await repoHistory(db, userId, boundary, coarse, limit + 1);
    if (rows.length === 0) break;
    for (const row of rows) {
      const dto = toOwnerDTO(row); // no clientTz → coordless pins to UTC (R5)
      if (dto.historyTag !== null) kept.push(dto);
    }
    const last = rows[rows.length - 1]!;
    coarse = { departureMs: last.departureDate.getTime(), id: last.id };
    if (rows.length < limit + 1) exhausted = true; // SQL returned a short batch → source done
  }

  const hasMore = kept.length > limit;
  const stays = kept.slice(0, limit);
  const nextCursor = hasMore && stays.length > 0 ? encodeCursor(stays[stays.length - 1]!) : null;
  return { stays, nextCursor };
}

/**
 * Partially update an owned stay. Re-applies the temporal rules on the EFFECTIVE (patched-or-
 * existing) pair: departure must not precede arrival, and no patched date may move into the
 * destination-local past. The shared Zod range refine only fires when both dates are present in
 * the body, so a single-field PATCH is re-checked here. Returns null if not owned.
 */
export async function updateStay(
  db: Db,
  userId: string,
  id: string,
  input: UpdateStayInputType,
  clientTz?: string,
): Promise<OwnerStayDTO | null> {
  const existing = await repoGet(db, userId, id);
  if (!existing) return null;
  // Assigning/moving to a folder: verify ownership before the write (R7). null = move to Unfiled.
  if (input.folderId != null) await assertFolderOwned(db, userId, input.folderId);

  const lat = input.lat !== undefined ? input.lat : existing.lat;
  const lng = input.lng !== undefined ? input.lng : existing.lng;
  const arrival =
    input.arrivalDate !== undefined ? toUtcMidnight(input.arrivalDate) : existing.arrivalDate;
  const departure =
    input.departureDate !== undefined ? toUtcMidnight(input.departureDate) : existing.departureDate;

  // Re-validate the temporal rules on any date change, against the effective pair.
  if (input.arrivalDate !== undefined || input.departureDate !== undefined) {
    const tz = resolveTz(lat, lng, clientTz);
    // Range rule on the effective pair (the Zod refine only fires when both are patched).
    if (departure < arrival) {
      throw new AppError(400, ERROR_CODES.DATE_RANGE_INVALID, "departureDate");
    }
    // No patched date may move into the destination-local past (Clarification).
    if (input.arrivalDate !== undefined) assertNotPast(arrival, tz, "arrivalDate");
    if (input.departureDate !== undefined) assertNotPast(departure, tz, "departureDate");
  }

  const fields: Partial<StayRow> = { updatedAt: new Date() };
  if (input.city !== undefined) fields.city = input.city;
  if (input.country !== undefined) fields.country = input.country;
  if (input.lat !== undefined) fields.lat = input.lat ?? null;
  if (input.lng !== undefined) fields.lng = input.lng ?? null;
  if (input.addressPrivate !== undefined) fields.addressPrivate = input.addressPrivate ?? null;
  if (input.arrivalDate !== undefined) fields.arrivalDate = arrival;
  if (input.departureDate !== undefined) fields.departureDate = departure;
  if (input.numMen !== undefined) fields.numMen = input.numMen;
  if (input.contactName !== undefined) fields.contactName = input.contactName ?? null;
  if (input.contactPhone !== undefined) fields.contactPhone = input.contactPhone ?? null;
  if (input.contactEmail !== undefined) fields.contactEmail = input.contactEmail ?? null;
  if (input.groupMembers !== undefined) fields.groupMembers = input.groupMembers ?? null;
  if (input.notes !== undefined) fields.notes = input.notes ?? null;
  if (input.folderId !== undefined) fields.folderId = input.folderId ?? null;

  const row = await repoUpdate(db, userId, id, fields);
  if (row) await reconcileCommitmentsForStay(db, id); // D12: edited dates may drop coverage
  return row ? toOwnerDTO(row) : null;
}

/** Soft-cancel an owned stay; returns true if a row was cancelled. Also auto-withdraws any
 * commitments linked to it (D12). */
export async function cancelStay(db: Db, userId: string, id: string): Promise<boolean> {
  const ok = await repoCancel(db, userId, id);
  if (ok) await reconcileCommitmentsForStay(db, id);
  return ok;
}

/**
 * Permanently hard-delete a stay (004 D8). Allowed ONLY when the stay is cancelled
 * (`stay.not_cancelled` otherwise); 404 if missing/not owned. Linked `commitment.stay_id` rows are
 * SET NULL via the FK (003 data stays consistent). The confirm guard is enforced by the controller.
 */
export async function permanentlyDeleteStay(db: Db, userId: string, id: string): Promise<void> {
  const existing = await repoGet(db, userId, id);
  if (!existing) throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND);
  if (existing.status !== "cancelled") {
    throw new AppError(400, ERROR_CODES.STAY_NOT_CANCELLED, "status");
  }
  await repoHardDelete(db, userId, id);
}
