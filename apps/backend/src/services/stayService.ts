import {
  PrayerNeedsSchema,
  ERROR_CODES,
  type CreateStayInputType,
  type UpdateStayInputType,
  type OwnerStayDTO,
} from "@minyanim/shared";
import type { Db } from "../db/client";
import { AppError } from "../lib/errors";
import { tzFromCoords, civilDate, todayCivil, coversShabbat } from "../lib/timezone";
import {
  createStay as repoCreate,
  getStayById as repoGet,
  listStays as repoList,
  updateStay as repoUpdate,
  cancelStay as repoCancel,
  type StayRow,
} from "../repositories/stayRepository";
// 003 (D12/R9): after a Stay cancel/edit, reconcile any commitments linked to it (auto-withdraw
// when the Stay no longer covers the event date). 002 service → 003 service is the intended seam.
import { reconcileCommitmentsForStay } from "./commitmentService";

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
    bringsSeferTorah: row.bringsSeferTorah,
    prayerNeeds: PrayerNeedsSchema.parse(row.prayerNeeds),
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
  const arrival = toUtcMidnight(input.arrivalDate);
  const departure = toUtcMidnight(input.departureDate);
  const tz = resolveTz(input.lat, input.lng, clientTz);
  assertNotPast(arrival, tz, "arrivalDate");

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
    bringsSeferTorah: input.bringsSeferTorah,
    prayerNeeds: PrayerNeedsSchema.parse(input.prayerNeeds),
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
 * List the user's active stays, nearest-first, as owner DTOs.
 *
 * @param clientTz The viewer's `X-Client-Timezone`, threaded into `isPast` for coordless stays.
 */
export async function listStays(
  db: Db,
  userId: string,
  clientTz?: string,
): Promise<OwnerStayDTO[]> {
  const rows = await repoList(db, userId);
  return rows.map((row) => toOwnerDTO(row, clientTz));
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
  if (input.bringsSeferTorah !== undefined) fields.bringsSeferTorah = input.bringsSeferTorah;
  if (input.prayerNeeds !== undefined) fields.prayerNeeds = PrayerNeedsSchema.parse(input.prayerNeeds);
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
