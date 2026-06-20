import { ERROR_CODES, type EventRole, type ParticipantMinyanDTO, type OwnerMinyanDTO } from "@minyanim/shared";
import type { Ctx } from "../lib/context";
import { AppError } from "../lib/errors";
import { getCommitment } from "../repositories/eventRepository";
import { claimRole as repoClaim, releaseRole as repoRelease } from "../repositories/roleRepository";
import { getMinyan } from "./eventService";

/**
 * Claim a role slot (FR-009). The caller must be a committed participant (`not_committed`); the
 * atomic insert returns false when the slot is already filled (`role.already_claimed`). Returns
 * the refreshed participant view (its `status` recomputes — a Ba'al Korei can flip a Shabbat
 * Shacharit minyan from quorum-reached to ready, R5/R4). A user may hold both roles.
 */
export async function claimRole(ctx: Ctx, userId: string, eventId: string, role: EventRole): Promise<ParticipantMinyanDTO | OwnerMinyanDTO> {
  if (!(await getCommitment(ctx.db, eventId, userId))) throw new AppError(403, ERROR_CODES.NOT_COMMITTED);
  if (!(await repoClaim(ctx.db, eventId, role, userId))) throw new AppError(409, ERROR_CODES.ROLE_ALREADY_CLAIMED);
  return (await getMinyan(ctx, userId, eventId)) as ParticipantMinyanDTO | OwnerMinyanDTO;
}

/** Release a role the caller holds; the slot reopens and readiness recomputes (R5/R9). */
export async function releaseRole(ctx: Ctx, userId: string, eventId: string, role: EventRole): Promise<ParticipantMinyanDTO | OwnerMinyanDTO> {
  await repoRelease(ctx.db, eventId, role, userId);
  return (await getMinyan(ctx, userId, eventId)) as ParticipantMinyanDTO | OwnerMinyanDTO;
}
