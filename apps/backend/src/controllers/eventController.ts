import { NotFound } from "../lib/errors";
import type { Ctx } from "../lib/context";
import type { CreateEventInputType, UpdateEventInputType } from "@minyanim/shared";
import { hostMinyan, getMinyan, updateMinyan, cancelMinyan } from "../services/eventService";

/** Host a Minyan → OwnerMinyanDTO. */
export async function hostMinyanController(ctx: Ctx, userId: string, input: CreateEventInputType) {
  return hostMinyan(ctx, userId, input);
}

/** Fetch one Minyan in the viewer-appropriate shape; 404 if missing/hidden-to-non-host. */
export async function getMinyanController(ctx: Ctx, viewerId: string | null, id: string) {
  const dto = await getMinyan(ctx, viewerId, id);
  if (!dto) throw NotFound();
  return dto;
}

/** Host-only edit; 404 if not the host. */
export async function updateMinyanController(ctx: Ctx, userId: string, id: string, input: UpdateEventInputType) {
  const dto = await updateMinyan(ctx, userId, id, input);
  if (!dto) throw NotFound();
  return dto;
}

/** Host-only cancel (requires confirm); 404 if not the host. */
export async function cancelMinyanController(ctx: Ctx, userId: string, id: string, confirm: boolean) {
  const ok = await cancelMinyan(ctx, userId, id, confirm);
  if (!ok) throw NotFound();
  return { ok: true };
}
