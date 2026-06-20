import {
  ERROR_CODES,
  type CreateCommitmentInputType,
  type ParticipantMinyanDTO,
  type OwnerMinyanDTO,
} from "@minyanim/shared";
import type { Ctx } from "../lib/context";
import type { Db } from "../db/client";
import { AppError, NotFound } from "../lib/errors";
import { isCompleted } from "../lib/minyanStatus";
import { getMinyanById } from "../repositories/eventRepository";
import { getMinyan } from "./eventService";
import * as repo from "../repositories/commitmentRepository";

/** Guard: the event exists and is joinable (not cancelled / not completed). Returns the joined row. */
async function assertJoinable(db: Db, eventId: string) {
  const m = await getMinyanById(db, eventId);
  if (!m) throw NotFound();
  if (m.storedStatus === "cancelled") throw new AppError(409, ERROR_CODES.MINYAN_CANCELLED);
  if (isCompleted(m.eventDate, m.lat, m.lng)) throw new AppError(409, ERROR_CODES.MINYAN_COMPLETED);
  return m;
}

/**
 * Commit a party to a Minyan (FR-004/D3). Duplicate commits hit the unique guard
 * (`commitment.duplicate`). Returns the participant view (address now revealed) plus a soft
 * `conflict` flag when the user is already committed elsewhere on the same date (D14). The
 * readiness recompute + crossing notification is wired in US5.
 */
export async function commit(
  ctx: Ctx,
  userId: string,
  eventId: string,
  input: CreateCommitmentInputType,
): Promise<{ minyan: ParticipantMinyanDTO; conflict: boolean }> {
  const m = await assertJoinable(ctx.db, eventId);
  const conflict = (await repo.userCommitmentsOnDate(ctx.db, userId, m.eventDate, eventId)).length > 0;
  const now = new Date();
  const row = await repo.insertCommitment(ctx.db, {
    id: `cmt_${crypto.randomUUID()}`,
    eventId,
    userId,
    numMen: input.numMen,
    stayId: input.stayId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  if (!row) throw new AppError(409, ERROR_CODES.COMMITMENT_DUPLICATE);
  ctx.log.info("commitment.changed", { eventId, delta: input.numMen });
  const minyan = (await getMinyan(ctx, userId, eventId)) as ParticipantMinyanDTO;
  return { minyan, conflict };
}

/** Change the caller's party size; `not_committed` if they haven't joined. */
export async function changeCommitment(
  ctx: Ctx,
  userId: string,
  eventId: string,
  numMen: number,
): Promise<ParticipantMinyanDTO | OwnerMinyanDTO> {
  const row = await repo.updateCommitmentMen(ctx.db, eventId, userId, numMen);
  if (!row) throw new AppError(404, ERROR_CODES.NOT_COMMITTED);
  return (await getMinyan(ctx, userId, eventId)) as ParticipantMinyanDTO | OwnerMinyanDTO;
}

/** Withdraw the caller's commitment, releasing any roles they held (R9). */
export async function withdraw(ctx: Ctx, userId: string, eventId: string): Promise<void> {
  const removed = await repo.deleteCommitment(ctx.db, eventId, userId);
  if (!removed) throw new AppError(404, ERROR_CODES.NOT_COMMITTED);
  await repo.deleteRolesForUserEvent(ctx.db, eventId, userId);
  ctx.log.info("commitment.changed", { eventId, delta: 0, withdrew: true });
  // (US5 recomputes readiness here and fires a deduped quorum_lost on a downward crossing.)
}

/**
 * D12 reconciliation: when a Stay is cancelled or edited so it no longer covers a linked
 * commitment's event date, auto-withdraw that commitment (releasing roles). Called by 002's
 * stayService after a cancel/update. db-only for now; US5 upgrades to Ctx to notify the user.
 */
export async function reconcileCommitmentsForStay(db: Db, stayId: string): Promise<void> {
  const coverage = await repo.getStayCoverage(db, stayId);
  const linked = await repo.commitmentsByStay(db, stayId);
  for (const c of linked) {
    const covers =
      coverage !== null &&
      coverage.status === "active" &&
      c.eventDate >= coverage.arrival &&
      c.eventDate <= coverage.departure;
    if (!covers) {
      await repo.deleteRolesForUserEvent(db, c.eventId, c.userId);
      await repo.deleteCommitment(db, c.eventId, c.userId);
    }
  }
}
