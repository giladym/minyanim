import { NotFound } from "../lib/errors";
import type { Ctx } from "../lib/context";
import type { CreateEventInputType, UpdateEventInputType } from "@minyanim/shared";
import { createEvent, getEvent, updateEvent, cancelMinyan, getMyEvents, getStayEvents } from "../services/eventService";

/** Create any event type (minyan or gathering) → OwnerEventDTO. */
export async function createEventController(ctx: Ctx, userId: string, input: CreateEventInputType) {
  return createEvent(ctx, userId, input);
}

/** The signed-in user's hosted + attending events (FR-017) → MyEventsDTO. */
export async function myEventsController(ctx: Ctx, userId: string) {
  return getMyEvents(ctx, userId);
}

/** A location's events (015): owner-only, 404 if the stay isn't the caller's → { events: MyEventRow[] }. */
export async function stayEventsController(ctx: Ctx, userId: string, stayId: string) {
  const res = await getStayEvents(ctx, userId, stayId);
  if (!res) throw NotFound();
  return res;
}

/** Fetch one event (minyan or gathering) in the viewer-appropriate tier; 404 if missing/hidden-to-non-host. */
export async function getMinyanController(ctx: Ctx, viewerId: string | null, id: string) {
  const dto = await getEvent(ctx, viewerId, id);
  if (!dto) throw NotFound();
  return dto;
}

/** Host-only edit of any event type (minyan or gathering); 404 if not the host. */
export async function updateMinyanController(ctx: Ctx, userId: string, id: string, input: UpdateEventInputType) {
  const dto = await updateEvent(ctx, userId, id, input);
  if (!dto) throw NotFound();
  return dto;
}

/** Host-only cancel (requires confirm); 404 if not the host. */
export async function cancelMinyanController(ctx: Ctx, userId: string, id: string, confirm: boolean) {
  const ok = await cancelMinyan(ctx, userId, id, confirm);
  if (!ok) throw NotFound();
  return { ok: true };
}
