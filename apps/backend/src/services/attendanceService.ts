import {
  ERROR_CODES,
  type CreateAttendanceInputType,
  type UpdateAttendanceInputType,
  type AttendanceStatus,
  type PublicEventDTO,
  type RosterEventDTO,
  type ParticipantEventDTO,
  type OwnerEventDTO,
  type PendingRequestDTO,
} from "@minyanim/shared";
import type { Ctx } from "../lib/context";
import type { Db } from "../db/client";
import { AppError, NotFound } from "../lib/errors";
import { assertUserActive } from "../lib/enforcement";
import { isCompleted } from "../lib/minyanStatus";
import * as attRepo from "../repositories/attendanceRepository";
import * as eventRepo from "../repositories/eventRepository";
import type { EventJoined } from "../repositories/eventRepository";
import { getEvent } from "./eventService";
import { onSeatRequested, onRequestApproved, onRequestDeclined, onWaitlistPromoted } from "./notificationService";

type EventTierDTO = PublicEventDTO | RosterEventDTO | ParticipantEventDTO | OwnerEventDTO;

/** Load an event that is joinable (not cancelled / not completed); throws otherwise. */
async function loadJoinable(db: Db, eventId: string): Promise<EventJoined> {
  const e = await eventRepo.getEventById(db, eventId);
  if (!e) throw NotFound();
  if (e.storedStatus === "cancelled") throw new AppError(409, ERROR_CODES.EVENT_CANCELLED);
  if (isCompleted(e.eventDate, e.lat, e.lng)) throw new AppError(409, ERROR_CODES.EVENT_COMPLETED);
  return e;
}

/** Reject new/changed requests after the RSVP cutoff (date-past is already caught as completed, R11). */
function assertNotClosed(e: EventJoined): void {
  if (e.rsvpCutoff && e.rsvpCutoff.getTime() < Date.now()) {
    throw new AppError(400, ERROR_CODES.RSVP_CLOSED, "rsvpCutoff");
  }
}

/**
 * Join / request a seat (R3/R4). `open` → guarded INSERT…SELECT (confirmed if it fits, else
 * waitlisted); `approval` → `pending` (host approves); `invite` → 404 (v1 scaffold). A re-join after
 * a prior cancel/decline UPDATEs the same row (R14). → the viewer's tier DTO + resolved status.
 */
export async function requestOrJoin(
  ctx: Ctx,
  userId: string,
  eventId: string,
  input: CreateAttendanceInputType,
): Promise<{ event: EventTierDTO; myStatus: AttendanceStatus }> {
  await assertUserActive(ctx.db, userId);
  const e = await loadJoinable(ctx.db, eventId);
  assertNotClosed(e);
  const now = Date.now();
  const id = `att_${crypto.randomUUID()}`;

  let status: AttendanceStatus;
  if (e.rsvpMode === "invite") {
    throw NotFound(); // v1: non-invited users cannot see/join an invite event
  } else if (e.rsvpMode === "approval") {
    const s = await attRepo.requestSeat(ctx.db, { id, eventId, userId, partySize: input.partySize, stayId: input.stayId ?? null, now });
    if (!s) throw new AppError(409, ERROR_CODES.COMMITMENT_DUPLICATE);
    status = s;
    await onSeatRequested(ctx, eventId, e.hostUserId);
  } else {
    const s = await attRepo.joinOpen(ctx.db, { id, eventId, userId, partySize: input.partySize, stayId: input.stayId ?? null, now, capacity: e.capacity });
    if (!s) throw new AppError(409, ERROR_CODES.COMMITMENT_DUPLICATE);
    status = s;
  }
  const event = (await getEvent(ctx, userId, eventId)) as EventTierDTO;
  return { event, myStatus: status };
}

/**
 * Change the caller's own party size (R4/A2). Increasing a CONFIRMED party is rejected `capacity.full`
 * when it no longer fits (never demoted); waitlisted/pending just resize (no capacity math).
 */
export async function changePartySize(
  ctx: Ctx,
  userId: string,
  eventId: string,
  input: UpdateAttendanceInputType,
): Promise<{ event: EventTierDTO; myStatus: AttendanceStatus }> {
  const e = await loadJoinable(ctx.db, eventId);
  assertNotClosed(e);
  const now = Date.now();
  const cur = await eventRepo.getAttendance(ctx.db, eventId, userId);
  if (!cur || cur.status === "cancelled" || cur.status === "declined") {
    throw new AppError(404, ERROR_CODES.ATTENDANCE_NOT_FOUND);
  }
  if (cur.status === "confirmed") {
    const res = await attRepo.resizeConfirmed(ctx.db, eventId, userId, input.partySize, e.capacity, now);
    if (res === "full") throw new AppError(400, ERROR_CODES.CAPACITY_FULL, "partySize");
    if (res === "missing") throw new AppError(404, ERROR_CODES.ATTENDANCE_NOT_FOUND);
  } else {
    await attRepo.resizeNonConfirmed(ctx.db, eventId, userId, input.partySize, now);
  }
  const event = (await getEvent(ctx, userId, eventId)) as EventTierDTO;
  const after = await eventRepo.getAttendance(ctx.db, eventId, userId);
  return { event, myStatus: (after?.status as AttendanceStatus) ?? cur.status as AttendanceStatus };
}

/**
 * Cancel the caller's own attendance (soft, R14). If the cancelled row was CONFIRMED and the event is
 * OPEN mode, atomically promote the earliest-requested waitlisted attendee that still fits and notify
 * them. In approval mode a freed seat does NOT auto-confirm (the host may approve a pending request).
 */
export async function cancel(ctx: Ctx, userId: string, eventId: string): Promise<void> {
  const e = await eventRepo.getEventById(ctx.db, eventId);
  if (!e) throw NotFound();
  const now = Date.now();
  const prior = await attRepo.cancelOwn(ctx.db, eventId, userId, now);
  if (!prior) throw new AppError(404, ERROR_CODES.ATTENDANCE_NOT_FOUND);
  if (prior === "confirmed" && e.rsvpMode !== "approval") {
    const promotedUserId = await attRepo.promoteEarliestThatFits(ctx.db, eventId, e.capacity, now);
    if (promotedUserId) await onWaitlistPromoted(ctx, eventId, promotedUserId);
  }
}

/** Host: pending-request queue (approval mode), earliest-first, with public profile + shared phone. */
export async function listRequests(ctx: Ctx, hostUserId: string, eventId: string): Promise<PendingRequestDTO[]> {
  const e = await eventRepo.getEventById(ctx.db, eventId);
  if (!e || e.hostUserId !== hostUserId) throw NotFound(); // request.not_host → 404
  const rows = await attRepo.pendingRequestsForEvent(ctx.db, eventId);
  const phones = await eventRepo.firstPhonesByUser(ctx.db, rows.map((r) => r.userId));
  return rows.map((r) => ({
    attendanceId: r.attendanceId,
    userId: r.userId,
    name: r.name,
    image: r.image ?? null,
    phone: r.sharePhone ? phones.get(r.userId) ?? null : null,
    partySize: r.partySize,
    requestedAt: r.requestedAt.getTime(),
    status: r.status as AttendanceStatus,
  }));
}

/**
 * Host: approve a pending request (R4) — one guarded UPDATE. On 0 rows, one read disambiguates
 * `request.not_pending` vs `capacity.full`. On success the requester is notified + now sees the
 * exact address on next read. → OwnerEventDTO.
 */
export async function approve(ctx: Ctx, hostUserId: string, eventId: string, attendanceId: string): Promise<OwnerEventDTO> {
  const e = await eventRepo.getEventById(ctx.db, eventId);
  if (!e || e.hostUserId !== hostUserId) throw NotFound();
  const now = Date.now();
  const ok = await attRepo.approveRequest(ctx.db, eventId, attendanceId, e.capacity, now);
  if (!ok) {
    const row = await attRepo.attendanceById(ctx.db, eventId, attendanceId);
    if (!row || row.status !== "pending") throw new AppError(400, ERROR_CODES.REQUEST_NOT_PENDING, "attendanceId");
    throw new AppError(400, ERROR_CODES.CAPACITY_FULL, "capacity");
  }
  const row = await attRepo.attendanceById(ctx.db, eventId, attendanceId);
  if (row) await onRequestApproved(ctx, eventId, row.userId);
  return (await getEvent(ctx, hostUserId, eventId)) as OwnerEventDTO;
}

/** Host: decline a pending request (R4) → `declined`; notify the requester. → OwnerEventDTO. */
export async function decline(ctx: Ctx, hostUserId: string, eventId: string, attendanceId: string): Promise<OwnerEventDTO> {
  const e = await eventRepo.getEventById(ctx.db, eventId);
  if (!e || e.hostUserId !== hostUserId) throw NotFound();
  const now = Date.now();
  const row = await attRepo.attendanceById(ctx.db, eventId, attendanceId);
  const ok = await attRepo.declineRequest(ctx.db, eventId, attendanceId, now);
  if (!ok) throw new AppError(400, ERROR_CODES.REQUEST_NOT_PENDING, "attendanceId");
  if (row) await onRequestDeclined(ctx, eventId, row.userId);
  return (await getEvent(ctx, hostUserId, eventId)) as OwnerEventDTO;
}
