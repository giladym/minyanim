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
 * Reject an arrival date that is before the destination-local today (D3). When no timezone is
 * resolvable, allow with a ±1-day tolerance (compare against yesterday-UTC) rather than rejecting.
 */
function assertArrivalNotPast(arrival: Date, tz: string | null): void {
  const arrivalCivil = civilDate(arrival, "UTC");
  if (tz) {
    if (arrivalCivil < todayCivil(tz)) {
      throw new AppError(400, ERROR_CODES.DATE_IN_PAST, "arrivalDate");
    }
    return;
  }
  // No tz available: ±1-day tolerance — only reject if before yesterday (UTC).
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (arrivalCivil < civilDate(yesterday, "UTC")) {
    throw new AppError(400, ERROR_CODES.DATE_IN_PAST, "arrivalDate");
  }
}

/** Map a stored row to the owner DTO, computing derived `isPast` / `coversShabbat` (D5/D7). */
function toOwnerDTO(row: StayRow): OwnerStayDTO {
  const tz = resolveTz(row.lat, row.lng) ?? "UTC";
  const departureCivil = civilDate(row.departureDate, "UTC");
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
    status: row.status === "cancelled" ? "cancelled" : "active",
    isPast: departureCivil < todayCivil(tz),
    coversShabbat: coversShabbat(row.arrivalDate, row.departureDate, tz),
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    groupMembers: row.groupMembers,
    notes: row.notes,
    folderId: row.folderId,
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
  assertArrivalNotPast(arrival, tz);

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

/** Fetch one owned stay as an owner DTO, or null if missing/not owned. */
export async function getStay(db: Db, userId: string, id: string): Promise<OwnerStayDTO | null> {
  const row = await repoGet(db, userId, id);
  return row ? toOwnerDTO(row) : null;
}

/** List the user's active stays, nearest-first, as owner DTOs. */
export async function listStays(db: Db, userId: string): Promise<OwnerStayDTO[]> {
  const rows = await repoList(db, userId);
  return rows.map(toOwnerDTO);
}

/**
 * Partially update an owned stay. Re-applies the temporal rule (no date may move into the past)
 * using the effective arrival + coords (patched or existing). Returns null if not owned.
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

  // Re-validate the temporal rule on any date change.
  if (input.arrivalDate !== undefined || input.departureDate !== undefined) {
    const tz = resolveTz(lat, lng, clientTz);
    assertArrivalNotPast(arrival, tz);
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
  return row ? toOwnerDTO(row) : null;
}

/** Soft-cancel an owned stay; returns true if a row was cancelled. */
export function cancelStay(db: Db, userId: string, id: string): Promise<boolean> {
  return repoCancel(db, userId, id);
}
