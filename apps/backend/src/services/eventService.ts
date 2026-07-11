import {
  ERROR_CODES,
  MinyanAttrsSchema,
  type CreateEventInputType,
  type UpdateEventInputType,
  type PublicMinyanDTO,
  type RosterMinyanDTO,
  type ParticipantMinyanDTO,
  type OwnerMinyanDTO,
} from "@minyanim/shared";
import type { Ctx } from "../lib/context";
import { AppError } from "../lib/errors";
import { assertUserActive } from "../lib/enforcement";
import { tzFromCoords, civilDate, todayCivil } from "../lib/timezone";
import { deriveStatus, missingForReady, isShabbatShacharit } from "../lib/minyanStatus";
import { fuzzCoord } from "../lib/geoPrivacy";
import * as repo from "../repositories/eventRepository";
import type { MinyanJoined } from "../repositories/eventRepository";
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

function buildPublic(
  m: MinyanJoined,
  committedMen: number,
  roles: { baalTefila: boolean; baalKorei: boolean },
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
    id: m.id,
    type: "minyan",
    city: m.city,
    country: m.country,
    // Public projection: fuzzed to ~neighbourhood; the exact point is participant-only (D4).
    lat: fuzzCoord(m.lat),
    lng: fuzzCoord(m.lng),
    eventDate: m.eventDate.getTime(),
    nusach: m.nusach,
    seferTorah: m.seferTorah,
    services: m.services,
    notes: m.notes,
    hostName: m.hostName,
    hostImage: m.hostImage,
    images: m.images ?? null,
    committedMen,
    status: deriveStatus(readiness),
    isShabbatShacharit: isShabbatShacharit(m.services, m.eventDate),
    missingForReady: missingForReady(readiness),
    rolesFilled: roles,
    createdAt: m.createdAt.getTime(),
    updatedAt: m.updatedAt.getTime(),
  };
}

/**
 * Build the roster fields (participant list + host contact + the viewer's own role slots) on top of
 * a public DTO. Contact rules (FR: contact people to minyanim):
 *  • phone — shown only for participants who share it (`user.sharePhone`); an opt-out hides it from
 *    everyone, committed or not.
 *  • email — committed-only: a not-yet-committed viewer gets the roster + phones but not emails.
 * When `viewerCommitted` is true the result is upgraded to a ParticipantMinyanDTO: exact
 * coordinates + private address + entry notes (D4). Otherwise coordinates stay fuzzed (from `base`)
 * and the address is absent — those reveal only on commit.
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
    // Committed participants get the EXACT point + private address + entry notes (D4).
    lat: m.lat,
    lng: m.lng,
    addressPrivate: m.addressPrivate,
    addressNotes: m.addressNotes,
  };
}

/**
 * Fetch one Minyan in the shape appropriate to the viewer's relationship (R10): host →
 * `OwnerMinyanDTO`; committed participant → `ParticipantMinyanDTO`; otherwise (or signed-out) →
 * `PublicMinyanDTO`. Returns null if missing, or hidden to a non-host (404 to non-owners, D19).
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
  const base = buildPublic(m, men.get(id) ?? 0, roles);

  if (isHost) {
    const p = (await withRosterFields(ctx, m, base, viewerId, true)) as ParticipantMinyanDTO;
    return { ...p, isHost: true } satisfies OwnerMinyanDTO;
  }
  if (viewerId === null) return base; // signed-out → public projection (no roster/contact)
  const committed = (await repo.getCommitment(ctx.db, id, viewerId)) !== null;
  // Signed-in: committed → address + roster; not committed → roster + contact only (address hidden).
  return withRosterFields(ctx, m, base, viewerId, committed);
}

/**
 * Host a Minyan (D11): validate temporal rule + attrs, insert event + minyan + host self-commitment
 * in one batch, and return the owner view (assembled via the read path).
 */
export async function hostMinyan(ctx: Ctx, userId: string, input: CreateEventInputType): Promise<OwnerMinyanDTO> {
  await assertUserActive(ctx.db, userId); // FR-005/010 — banned/suspended cannot host
  const eventDate = toUtcMidnight(input.eventDate);
  assertNotPast(eventDate, input.lat, input.lng);
  const attrs = MinyanAttrsSchema.parse(input.minyan);
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
    { id: `cmt_${crypto.randomUUID()}`, eventId: id, userId, numMen: input.hostNumMen, stayId: input.stayId ?? null, createdAt: now, updatedAt: now },
  );
  ctx.log.info("event.hosted", { eventId: id });
  // Notify people with an active location near this minyan's place + date (in-app; host excluded).
  const nearby = await usersWithStaysNear(ctx.db, input.lat, input.lng, eventDate, userId);
  await onMinyanCreated(ctx, id, nearby);
  return (await getMinyan(ctx, userId, id)) as OwnerMinyanDTO;
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

  // (US5 will recompute readiness + fire quorum_lost on a Torah/service change here.)
  return (await getMinyan(ctx, userId, id)) as OwnerMinyanDTO;
}

/** Host-only cancel (D11): void commitments + roles, flip to cancelled. (US5 adds the fan-out.) */
export async function cancelMinyan(ctx: Ctx, userId: string, id: string, confirm: boolean): Promise<boolean> {
  if (confirm !== true) throw new AppError(400, ERROR_CODES.CONFIRM_REQUIRED, "confirm");
  // Capture recipients + context BEFORE the batch voids commitments, so we can still notify them.
  const info = await eventNotifyContext(ctx.db, id);
  const recipients = await recipientsForEvent(ctx.db, id);
  const ok = await repo.cancelMinyanBatch(ctx.db, id, userId);
  if (ok && info) await onCancelled(ctx, id, recipients, info);
  return ok;
}
