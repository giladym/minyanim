import type { ClaimableSeedDTO } from "@minyanim/shared";
import type { Db } from "../db/client";
import { claimSeeds, findClaimableSeeds, type ClaimResult } from "../repositories/claimRepository";

/** Seed users the signed-in user could claim (phone match), as DTOs for the claim prompt. */
export async function getClaimableSeeds(db: Db, userId: string): Promise<ClaimableSeedDTO[]> {
  const seeds = await findClaimableSeeds(db, userId);
  return seeds.map((s) => ({ seedUserId: s.seedUserId, name: s.name, phone: s.phone, stays: s.stays, events: s.events }));
}

/** Claim (merge + delete) the selected seed users into the signed-in account. */
export function claimSeedUsers(db: Db, userId: string, seedUserIds: string[]): Promise<ClaimResult> {
  return claimSeeds(db, userId, seedUserIds);
}
