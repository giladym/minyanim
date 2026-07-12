import {
  ERROR_CODES,
  type CreateEventInputType,
  type UpdateEventInputType,
  type PublicMinyanDTO,
  type RosterMinyanDTO,
  type ParticipantMinyanDTO,
  type OwnerMinyanDTO,
  type PublicGatheringDTO,
  type RosterGatheringDTO,
  type ParticipantGatheringDTO,
  type OwnerGatheringDTO,
  type PublicEventDTO,
  type RosterEventDTO,
  type ParticipantEventDTO,
  type OwnerEventDTO,
  type PendingRequestDTO,
  type RsvpState,
  type AttendanceStatus,
  type MyEventsDTO,
  type MyEventRow,
  type MinyanStatus,
  type GatheringStatus,
} from "@minyanim/shared";
import type { Ctx } from "../lib/context";
import { AppError } from "../lib/errors";
import { assertUserActive } from "../lib/enforcement";
import { tzFromCoords, civilDate, todayCivil } from "../lib/timezone";
import { deriveStatus, missingForReady, isShabbatShacharit, isCompleted } from "../lib/minyanStatus";
import { EVENT_STRATEGY, gatheringStatus, seatsRemaining } from "../lib/eventStrategy";
import { ATTRS_BY_CATEGORY, type Category, type GatheringAttrs } from "@minyanim/shared";
import { fuzzCoord } from "../lib/geoPrivacy";
import * as repo from "../repositories/eventRepository";
import type { MinyanJoined, GatheringJoined, GatheringInsert, MyEventQueryRow } from "../repositories/eventRepository";
import { pendingRequestsForEvent, confirmedPartySize } from "../repositories/attendanceRepository";
import { recipientsForEvent, eventNotifyContext } from "../repositories/notificationRepository";
import { userRolesForEvent } from "../repositories/roleRepository";
import { onCancelled, onMinyanCreated } from "./notificationService";
import { usersWithStaysNear } from "./discoveryService";

function toUtcMidnight(epochMs: number): Date {
  const d = new Date(epochMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Events always have coords, so the temporal tz comes from them (D3). */
function assertNotPast(eventDate: Date, lat: number, lng: number): void {
  if (civilDate(eventDate, "UTC") < todayCivil(tzFromCoords(lat, lng))) {
    throw new AppError(400, ERROR_CODES.DATE_IN_PAST, "eventDate");
  }
}

/** Derived RSVP state (R11): closed once the cutoff passed OR the event date has passed. */
function deriveRsvpState(eventDate: Date, lat: number, lng: number, rsvpCutoff: Date | null): RsvpState {
  if (rsvpCutoff && rsvpCutoff.getTime() < Date.now()) return "closed";
  if (isCompleted(eventDate, lat, lng)) return "closed";
  return "open";
}

/** The 014 common axes shared by every public DTO (populated for a minyan too — capacity stays null). */
function commonPublic(e: MinyanJoined | GatheringJoined, viewerId: string | null, confirmedCount: number) {
  return {
    id: e.id,
    occasion: e.occasion,
    title: e.title,
    city: e.city,
    country: e.country,
    lat: fuzzCoord(e.lat),
    lng: fuzzCoord(e.lng),
    eventDate: e.eventDate.getTime(),
    startTime: e.startTime,
    endTime: e.endTime,
    rsvpCutoff: e.rsvpCutoff ? e.rsvpCutoff.getTime() : null,
    rsvpMode: e.rsvpMode,
    visibility: e.visibility,
    capacity: e.capacity,
    seatsRemaining: e.type === "gathering" ? seatsRemaining(e.capacity, confirmedCount) : null,
    rsvpState: deriveRsvpState(e.eventDate, e.lat, e.lng, e.rsvpCutoff),
    notes: e.notes,
    hostName: e.hostName,
    hostImage: e.hostImage,
    images: e.images ?? null,
    viewerIsHost: viewerId !== null && e.hostUserId === viewerId,
    createdAt: e.createdAt.getTime(),
    updatedAt: e.updatedAt.getTime(),
  };
}

function buildPublic(
  m: MinyanJoined,
  committedMen: number,
  roles: { baalTefila: boolean; baalKorei: boolean },
  viewerId: string | null = null,
): PublicMinyanDTO {
  const readiness = {
    storedStatus: m.storedStatus,
    eventDate: m.eventDate,
    lat: m.lat,
    lng: m.lng,
    committedMen,
    seferTorah: m.seferTorah,
    services: m.services,
    baalKoreiClaimed: roles.baalKorei,
  };
  return {
    ...commonPublic(m, viewerId, committedMen),
    type: "minyan",
    category: null,
    capacity: null,
    seatsRemaining: null,
    nusach: m.nusach,
    seferTorah: m.seferTorah,
    services: m.services,
    committedMen,
    status: deriveStatus(readiness),
    isShabbatShacharit: isShabbatShacharit(m.services, m.eventDate),
    missingForReady: missingForReady(readiness),
    rolesFilled: roles,
  };
}

function buildPublicGathering(g: GatheringJoined, confirmedCount: number, viewerId: string | null): PublicGatheringDTO {
  return {
    ...commonPublic(g, viewerId, confirmedCount),
    type: "gathering",
    category: g.category,
    attrs: g.attrs,
    status: gatheringStatus({
      storedStatus: g.storedStatus,
      eventDate: g.eventDate,
      lat: g.lat,
      lng: g.lng,
      capacity: g.capacity,
      confirmedPartySize: confirmedCount,
    }),
    confirmedCount,
  };
}

/**
 * Build the minyan roster fields (participant list + host contact + the viewer's own role slots) on
 * top of a public DTO. phone shows only for sharers; email is committed-only. When `viewerCommitted`
 * the result upgrades to a ParticipantMinyanDTO (exact coords + private address + entry notes, D4).
 */
async function withRosterFields(
  ctx: Ctx,
  m: MinyanJoined,
  base: PublicMinyanDTO,
  viewerId: string | null,
  viewerCommitted: boolean,
): Promise<RosterMinyanDTO | ParticipantMinyanDTO> {
  const parts = await repo.participantsForEvent(ctx.db, m.id);
  const phones = await repo.firstPhonesByUser(ctx.db, parts.map((p) => p.userId));
  const host = parts.find((p) => p.userId === m.hostUserId);
  const phoneOf = (userId: string, sharePhone: boolean) => (sharePhone ? phones.get(userId) ?? null : null);
  const emailOf = (email: string) => (viewerCommitted ? email : null);
  const myRoles = viewerCommitted && viewerId !== null ? await userRolesForEvent(ctx.db, m.id, viewerId) : { baalTefila: false, baalKorei: false };
  const roster: RosterMinyanDTO = {
    ...base,
    hostContact: {
      name: m.hostName,
      email: emailOf(host?.email ?? ""),
      phone: host ? phoneOf(m.hostUserId, host.sharePhone) : null,
    },
    participants: parts.map((p) => ({
      userId: p.userId,
      name: p.name,
      numMen: p.numMen,
      email: emailOf(p.email),
      phone: phoneOf(p.userId, p.sharePhone),
      image: p.image ?? null,
      isHost: p.userId === m.hostUserId,
    })),
    myRoles,
  };
  if (!viewerCommitted) return roster;
  return {
    ...roster,
    lat: m.lat,
    lng: m.lng,
    addressPrivate: m.addressPrivate,
    addressNotes: m.addressNotes,
  };
}

/**
 * Fetch one Minyan in the shape appropriate to the viewer's relationship (R10): host →
 * `OwnerMinyanDTO`; CONFIRMED participant → `ParticipantMinyanDTO`; otherwise (or signed-out) →
 * `PublicMinyanDTO`. The reveal gate keys on `status='confirmed'` (SC-003 audit #2). Null if missing,
 * or hidden to a non-host (404 to non-owners, D19).
 */
export async function getMinyan(
  ctx: Ctx,
  viewerId: string | null,
  id: string,
): Promise<PublicMinyanDTO | RosterMinyanDTO | ParticipantMinyanDTO | OwnerMinyanDTO | null> {
  const m = await repo.getMinyanById(ctx.db, id);
  if (!m) return null;
  const isHost = viewerId !== null && m.hostUserId === viewerId;
  if (m.hidden && !isHost) return null; // hidden content is 404 to non-hosts (D19)

  const [men, rolesMap] = await Promise.all([
    repo.committedMenByEvent(ctx.db, [id]),
    repo.rolesByEvent(ctx.db, [id]),
  ]);
  const roles = rolesMap.get(id) ?? { baalTefila: false, baalKorei: false };
  const base = buildPublic(m, men.get(id) ?? 0, roles, viewerId);

  if (isHost) {
    const p = (await withRosterFields(ctx, m, base, viewerId, true)) as ParticipantMinyanDTO;
    return { ...p, isHost: true } satisfies OwnerMinyanDTO;
  }
  if (viewerId === null) return base; // signed-out → public projection (no roster/contact)
  // Signed-in: ONLY a confirmed attendance unlocks the address + email (SC-003 audit #2).
  const confirmed = (await repo.getConfirmedAttendance(ctx.db, id, viewerId)) !== null;
  return withRosterFields(ctx, m, base, viewerId, confirmed);
}

/**
 * Gathering roster/participant/owner shaping. For a `hosting` category, a non-confirmed viewer's
 * roster OMITS the named attendees (aggregate `confirmedCount` only, A8); social exposes the roster
 * like a minyan. A confirmed viewer (or host) gets the exact address + attendee contact (SC-003).
 */
async function getGathering(
  ctx: Ctx,
  viewerId: string | null,
  g: GatheringJoined,
  isHost: boolean,
): Promise<PublicGatheringDTO | RosterGatheringDTO | ParticipantGatheringDTO | OwnerGatheringDTO> {
  const menMap = await repo.committedMenByEvent(ctx.db, [g.id]);
  const confirmedCount = menMap.get(g.id) ?? 0;
  const base = buildPublicGathering(g, confirmedCount, viewerId);
  if (viewerId === null) return base; // signed-out → public projection

  const myAtt = await repo.getAttendance(ctx.db, g.id, viewerId);
  const myStatus = (myAtt?.status as AttendanceStatus | undefined) ?? null;
  const viewerConfirmed = isHost || myStatus === "confirmed";

  const parts = await repo.participantsForEvent(ctx.db, g.id);
  const userIds = new Set(parts.map((p) => p.userId));
  const pend = isHost ? await pendingRequestsForEvent(ctx.db, g.id) : [];
  for (const p of pend) userIds.add(p.userId);
  const phones = await repo.firstPhonesByUser(ctx.db, [...userIds]);
  const host = parts.find((p) => p.userId === g.hostUserId);
  const phoneOf = (userId: string, sharePhone: boolean) => (sharePhone ? phones.get(userId) ?? null : null);
  const emailOf = (email: string) => (viewerConfirmed ? email : null);

  // Named attendees are withheld from a non-confirmed viewer of a HOSTING gathering (A8).
  const showAttendees = viewerConfirmed || g.category !== "hosting";
  const attendees = showAttendees
    ? parts.map((p) => ({
        userId: p.userId,
        name: p.name,
        numMen: p.numMen,
        email: emailOf(p.email),
        phone: phoneOf(p.userId, p.sharePhone),
        image: p.image ?? null,
        isHost: p.userId === g.hostUserId,
      }))
    : null;

  const roster: RosterGatheringDTO = {
    ...base,
    hostContact: {
      name: g.hostName,
      email: emailOf(host?.email ?? ""),
      phone: host ? phoneOf(g.hostUserId, host.sharePhone) : null,
    },
    attendees,
    myStatus,
  };
  if (!viewerConfirmed) return roster;

  const participant: ParticipantGatheringDTO = {
    ...roster,
    lat: g.lat,
    lng: g.lng,
    addressPrivate: g.addressPrivate,
    addressNotes: g.addressNotes,
  };
  if (!isHost) return participant;

  const pendingRequests: PendingRequestDTO[] = pend.map((p) => ({
    attendanceId: p.attendanceId,
    userId: p.userId,
    name: p.name,
    image: p.image ?? null,
    phone: phoneOf(p.userId, p.sharePhone),
    partySize: p.partySize,
    requestedAt: p.requestedAt.getTime(),
    status: p.status as AttendanceStatus,
  }));
  return { ...participant, isHost: true, pendingRequests } satisfies OwnerGatheringDTO;
}

/**
 * Generic event read (R6/R10), viewer-appropriate shape per type. A minyan delegates to
 * {@link getMinyan} (unchanged behavior); a gathering uses the capacity/RSVP shaping. Null if
 * missing or hidden-to-non-host.
 */
export async function getEvent(
  ctx: Ctx,
  viewerId: string | null,
  id: string,
): Promise<PublicEventDTO | RosterEventDTO | ParticipantEventDTO | OwnerEventDTO | null> {
  const e = await repo.getEventById(ctx.db, id);
  if (!e) return null;
  const isHost = viewerId !== null && e.hostUserId === viewerId;
  if (e.hidden && !isHost) return null;
  if (e.type === "minyan") return getMinyan(ctx, viewerId, id);
  return getGathering(ctx, viewerId, e, isHost);
}

/**
 * Host a Minyan (D11): validate temporal rule + attrs, insert event + minyan + host self-attendance
 * (a `confirmed` attendance counting toward quorum — `hostSelfAttends`, R12) in one batch, and return
 * the owner view (assembled via the read path).
 */
export async function hostMinyan(ctx: Ctx, userId: string, input: CreateEventInputType): Promise<OwnerMinyanDTO> {
  await assertUserActive(ctx.db, userId); // FR-005/010 — banned/suspended cannot host
  const eventDate = toUtcMidnight(input.eventDate);
  assertNotPast(eventDate, input.lat, input.lng);
  const attrs = EVENT_STRATEGY.minyan.detailParse(input.minyan, null) as { nusach: PublicMinyanDTO["nusach"]; seferTorah: boolean; services: MinyanJoined["services"] };
  const now = new Date();
  const id = `evt_${crypto.randomUUID()}`;
  await repo.createMinyanBatch(
    ctx.db,
    {
      id,
      type: "minyan",
      hostUserId: userId,
      city: input.city,
      country: input.country,
      lat: input.lat,
      lng: input.lng,
      addressPrivate: input.addressPrivate ?? null,
      addressNotes: input.addressNotes ?? null,
      eventDate,
      notes: input.notes ?? null,
      status: "forming",
      hidden: false,
      createdAt: now,
      updatedAt: now,
    },
    { eventId: id, nusach: attrs.nusach, seferTorah: attrs.seferTorah, services: attrs.services },
    {
      id: `att_${crypto.randomUUID()}`,
      eventId: id,
      userId,
      partySize: input.hostNumMen,
      status: "confirmed",
      stayId: input.stayId ?? null,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  );
  ctx.log.info("event.hosted", { eventId: id });
  // Notify people with an active location near this minyan's place + date (in-app; host excluded).
  const nearby = await usersWithStaysNear(ctx.db, input.lat, input.lng, eventDate, userId);
  await onMinyanCreated(ctx, id, nearby);
  return (await getMinyan(ctx, userId, id)) as OwnerMinyanDTO;
}

/**
 * Host a gathering (T021, R12). Requires + validates `category` (`category.invalid`); validates the
 * per-category `attrs` (`gathering.attrs_invalid`); applies category defaults for an omitted
 * rsvpMode/visibility (CATEGORY_META: hosting→approval). Creates the event + gathering detail with
 * NO host attendance (the host is the organizer, never a seat against `capacity`). → OwnerGatheringDTO.
 */
async function createGathering(ctx: Ctx, userId: string, input: CreateEventInputType): Promise<OwnerGatheringDTO> {
  await assertUserActive(ctx.db, userId); // FR-005/010 — banned/suspended cannot host
  const category = input.category;
  if (!category || !(category in ATTRS_BY_CATEGORY)) {
    throw new AppError(400, ERROR_CODES.CATEGORY_INVALID, "category");
  }
  const eventDate = toUtcMidnight(input.eventDate);
  assertNotPast(eventDate, input.lat, input.lng);
  const strat = EVENT_STRATEGY.gathering;
  const attrs = strat.detailParse(input.gathering, category) as GatheringAttrs; // throws category/attrs codes
  const rsvpMode = input.rsvpMode ?? strat.defaultRsvpMode(category);
  const visibility = input.visibility ?? "public";
  const now = new Date();
  const id = `evt_${crypto.randomUUID()}`;
  await repo.createEventBatch(
    ctx.db,
    {
      id,
      type: "gathering",
      category: category as Category,
      hostUserId: userId,
      title: input.title ?? null,
      city: input.city,
      country: input.country,
      lat: input.lat,
      lng: input.lng,
      addressPrivate: input.addressPrivate ?? null,
      addressNotes: input.addressNotes ?? null,
      eventDate,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      occasion: input.occasion ?? null,
      rsvpMode,
      visibility,
      capacity: input.capacity ?? null,
      rsvpCutoff: input.rsvpCutoff != null ? new Date(input.rsvpCutoff) : null,
      notes: input.notes ?? null,
      status: "forming",
      hidden: false,
      createdAt: now,
      updatedAt: now,
    },
    { kind: "gathering", values: strat.detailInsertValues(id, attrs) as GatheringInsert },
    // hostSelfAttends:false — no host attendance row (R12).
  );
  ctx.log.info("event.hosted", { eventId: id, type: "gathering", category });
  return (await getEvent(ctx, userId, id)) as OwnerGatheringDTO;
}

/**
 * Create any event type (T020/T021). A minyan delegates to {@link hostMinyan} (unchanged behavior,
 * SC-005) — `category` is FORBIDDEN for a minyan (`category.invalid`); a gathering runs the
 * capacity/RSVP create path. → OwnerEventDTO.
 */
export async function createEvent(ctx: Ctx, userId: string, input: CreateEventInputType): Promise<OwnerEventDTO> {
  if (input.type === "gathering") return createGathering(ctx, userId, input);
  if (input.category !== undefined) throw new AppError(400, ERROR_CODES.CATEGORY_INVALID, "category");
  return hostMinyan(ctx, userId, input);
}

/** Host-only edit (R9). Date + tefilla-bundle date are immutable; services/nusach/Torah/notes editable. */
export async function updateMinyan(
  ctx: Ctx,
  userId: string,
  id: string,
  input: UpdateEventInputType,
): Promise<OwnerMinyanDTO | null> {
  const m = await repo.getMinyanById(ctx.db, id);
  if (!m || m.hostUserId !== userId) return null;

  const eventFields: Record<string, unknown> = { updatedAt: new Date() };
  if (input.addressPrivate !== undefined) eventFields.addressPrivate = input.addressPrivate ?? null;
  if (input.addressNotes !== undefined) eventFields.addressNotes = input.addressNotes ?? null;
  if (input.notes !== undefined) eventFields.notes = input.notes ?? null;
  await repo.updateEventRow(ctx.db, id, eventFields);

  const minyanFields: Record<string, unknown> = {};
  if (input.nusach !== undefined) minyanFields.nusach = input.nusach;
  if (input.seferTorah !== undefined) minyanFields.seferTorah = input.seferTorah;
  if (input.services !== undefined) minyanFields.services = input.services;
  if (Object.keys(minyanFields).length > 0) await repo.updateMinyanRow(ctx.db, id, minyanFields);

  return (await getMinyan(ctx, userId, id)) as OwnerMinyanDTO;
}

/**
 * Host-only edit of a gathering (T042a/FR-012). Edits the generic axes (title/occasion/rsvpMode/
 * visibility/capacity/times/rsvpCutoff/notes/address) and re-validates the per-category `attrs` via
 * the strategy. REJECTS reducing `capacity` below the current confirmed party-size SUM
 * (`capacity.invalid`) so confirmed guests are never bumped off. → OwnerGatheringDTO.
 */
async function updateGathering(
  ctx: Ctx,
  userId: string,
  g: GatheringJoined,
  input: UpdateEventInputType,
): Promise<OwnerGatheringDTO> {
  // Capacity may not drop below the confirmed party-size sum (never bump confirmed guests off).
  if (input.capacity !== undefined && input.capacity !== null) {
    const confirmed = await confirmedPartySize(ctx.db, g.id);
    if (input.capacity < confirmed) throw new AppError(400, ERROR_CODES.CAPACITY_INVALID, "capacity");
  }

  const eventFields: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) eventFields.title = input.title ?? null;
  if (input.occasion !== undefined) eventFields.occasion = input.occasion ?? null;
  if (input.rsvpMode !== undefined) eventFields.rsvpMode = input.rsvpMode;
  if (input.visibility !== undefined) eventFields.visibility = input.visibility;
  if (input.capacity !== undefined) eventFields.capacity = input.capacity ?? null;
  if (input.startTime !== undefined) eventFields.startTime = input.startTime ?? null;
  if (input.endTime !== undefined) eventFields.endTime = input.endTime ?? null;
  if (input.rsvpCutoff !== undefined) eventFields.rsvpCutoff = input.rsvpCutoff != null ? new Date(input.rsvpCutoff) : null;
  if (input.notes !== undefined) eventFields.notes = input.notes ?? null;
  if (input.addressPrivate !== undefined) eventFields.addressPrivate = input.addressPrivate ?? null;
  if (input.addressNotes !== undefined) eventFields.addressNotes = input.addressNotes ?? null;
  await repo.updateEventRow(ctx.db, g.id, eventFields);

  // Re-validate + persist the gathering attrs when supplied (per-category schema, R1).
  if (input.gathering !== undefined) {
    const attrs = EVENT_STRATEGY.gathering.detailParse(input.gathering, g.category) as GatheringAttrs;
    await repo.updateGatheringRow(ctx.db, g.id, { attrs });
  }

  return (await getEvent(ctx, userId, g.id)) as OwnerGatheringDTO;
}

/**
 * Host-only edit of any event type (T042a/FR-012). A minyan delegates to {@link updateMinyan}
 * (today's behavior verbatim, SC-005); a gathering runs the generic + attrs edit path. 404 (null)
 * if the event is missing or the caller is not its host.
 */
export async function updateEvent(
  ctx: Ctx,
  userId: string,
  id: string,
  input: UpdateEventInputType,
): Promise<OwnerEventDTO | null> {
  const e = await repo.getEventById(ctx.db, id);
  if (!e || e.hostUserId !== userId) return null;
  if (e.type === "minyan") return updateMinyan(ctx, userId, id, input);
  return updateGathering(ctx, userId, e, input);
}

/**
 * "My events" (FR-017/T031a): the signed-in user's hosted + attending events as compact rows with a
 * derived status. Hosted approval-mode events carry a `pendingRequestCount` (the requests-queue
 * badge). No private fields — a lightweight list that links to the full event read.
 */
export async function getMyEvents(ctx: Ctx, userId: string): Promise<MyEventsDTO> {
  const [hosted, attending] = await Promise.all([
    repo.hostedEventsForUser(ctx.db, userId),
    repo.attendingEventsForUser(ctx.db, userId),
  ]);
  const ids = [...new Set([...hosted, ...attending].map((r) => r.id))];
  const [men, rolesMap, pending] = await Promise.all([
    repo.committedMenByEvent(ctx.db, ids),
    repo.rolesByEvent(ctx.db, ids),
    repo.pendingCountsByEvent(ctx.db, hosted.filter((r) => r.rsvpMode === "approval").map((r) => r.id)),
  ]);

  const deriveRowStatus = (r: MyEventQueryRow): MinyanStatus | GatheringStatus => {
    const confirmed = men.get(r.id) ?? 0;
    if (r.type === "minyan") {
      const roles = rolesMap.get(r.id) ?? { baalTefila: false, baalKorei: false };
      return deriveStatus({
        storedStatus: r.storedStatus,
        eventDate: r.eventDate,
        lat: r.lat,
        lng: r.lng,
        committedMen: confirmed,
        seferTorah: r.seferTorah,
        services: r.services,
        baalKoreiClaimed: roles.baalKorei,
      });
    }
    return gatheringStatus({
      storedStatus: r.storedStatus,
      eventDate: r.eventDate,
      lat: r.lat,
      lng: r.lng,
      capacity: r.capacity,
      confirmedPartySize: confirmed,
    });
  };

  const toRow = (r: MyEventQueryRow, withPending: boolean): MyEventRow => {
    const row: MyEventRow = {
      id: r.id,
      type: r.type,
      category: r.category,
      title: r.title,
      city: r.city,
      country: r.country,
      eventDate: r.eventDate.getTime(),
      status: deriveRowStatus(r),
      myStatus: (r.myStatus as AttendanceStatus | null) ?? null,
    };
    if (withPending && r.rsvpMode === "approval") row.pendingRequestCount = pending.get(r.id) ?? 0;
    return row;
  };

  return {
    hosting: hosted.map((r) => toRow(r, true)),
    attending: attending.map((r) => toRow(r, false)),
  };
}

/** Host-only cancel (D11): void attendances + roles, flip to cancelled, notify confirmed attendees. */
export async function cancelMinyan(ctx: Ctx, userId: string, id: string, confirm: boolean): Promise<boolean> {
  if (confirm !== true) throw new AppError(400, ERROR_CODES.CONFIRM_REQUIRED, "confirm");
  // Capture recipients + context BEFORE the batch voids attendances, so we can still notify them.
  const info = await eventNotifyContext(ctx.db, id);
  const recipients = await recipientsForEvent(ctx.db, id);
  const ok = await repo.cancelMinyanBatch(ctx.db, id, userId);
  if (ok && info) await onCancelled(ctx, id, recipients, info);
  return ok;
}
