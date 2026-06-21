import type { OwnerStayDTO } from "@minyanim/shared";
import type { CreateStayInputType, UpdateStayInputType } from "@minyanim/shared";
import type { Db } from "../db/client";
import { NotFound, AppError } from "../lib/errors";
import { ERROR_CODES } from "@minyanim/shared";
import {
  createStay as svcCreate,
  getStay as svcGet,
  listStays as svcList,
  listStayHistory as svcHistory,
  updateStay as svcUpdate,
  cancelStay as svcCancel,
  permanentlyDeleteStay as svcPermanentDelete,
} from "../services/stayService";

/**
 * Owner-DTO builder enforced at the controller boundary (D8). The service already returns
 * `OwnerStayDTO`-shaped objects; this guarantees the response shape — private fields stay
 * present for the owner, and nothing extra leaks.
 */
function toOwnerResponse(dto: OwnerStayDTO): OwnerStayDTO {
  return {
    id: dto.id,
    city: dto.city,
    country: dto.country,
    lat: dto.lat,
    lng: dto.lng,
    addressPrivate: dto.addressPrivate,
    arrivalDate: dto.arrivalDate,
    departureDate: dto.departureDate,
    numMen: dto.numMen,
    bringsSeferTorah: dto.bringsSeferTorah,
    prayerNeeds: dto.prayerNeeds,
    status: dto.status,
    isPast: dto.isPast,
    coversShabbat: dto.coversShabbat,
    contactName: dto.contactName,
    contactPhone: dto.contactPhone,
    contactEmail: dto.contactEmail,
    groupMembers: dto.groupMembers,
    notes: dto.notes,
    folderId: dto.folderId,
    historyTag: dto.historyTag,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/** List the user's active-dashboard stays (upcoming/in-progress, nearest-first). */
export async function listStaysController(db: Db, userId: string, clientTz?: string) {
  const stays = await svcList(db, userId, clientTz);
  return { stays: stays.map(toOwnerResponse) };
}

/** A page of the user's History (past + cancelled, newest-first, cursor-paginated). */
export async function listHistoryController(
  db: Db,
  userId: string,
  cursor?: string,
  limit?: number,
) {
  const page = await svcHistory(db, userId, cursor, limit);
  return { stays: page.stays.map(toOwnerResponse), nextCursor: page.nextCursor };
}

/** Create a stay. */
export async function createStayController(
  db: Db,
  userId: string,
  input: CreateStayInputType,
  clientTz?: string,
) {
  const dto = await svcCreate(db, userId, input, clientTz);
  return toOwnerResponse(dto);
}

/** Fetch one owned stay (404 if missing/not owned). */
export async function getStayController(db: Db, userId: string, id: string, clientTz?: string) {
  const dto = await svcGet(db, userId, id, clientTz);
  if (!dto) throw NotFound();
  return toOwnerResponse(dto);
}

/** Partial update of an owned stay (404 if not owned). */
export async function updateStayController(
  db: Db,
  userId: string,
  id: string,
  input: UpdateStayInputType,
  clientTz?: string,
) {
  const dto = await svcUpdate(db, userId, id, input, clientTz);
  if (!dto) throw NotFound();
  return toOwnerResponse(dto);
}

/** Soft-cancel an owned stay (requires explicit confirmation; 404 if not owned). */
export async function cancelStayController(db: Db, userId: string, id: string, confirm: boolean) {
  if (confirm !== true) throw new AppError(400, ERROR_CODES.CONFIRM_REQUIRED, "confirm");
  const ok = await svcCancel(db, userId, id);
  if (!ok) throw NotFound();
  return { ok: true };
}

/** Permanently hard-delete a cancelled stay (confirm-guarded; `stay.not_cancelled` otherwise). */
export async function permanentDeleteStayController(
  db: Db,
  userId: string,
  id: string,
  confirm: boolean,
) {
  if (confirm !== true) throw new AppError(400, ERROR_CODES.CONFIRM_REQUIRED, "confirm");
  await svcPermanentDelete(db, userId, id);
  return { ok: true as const };
}
