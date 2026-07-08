import { z } from "zod";

/**
 * A seed (imported) user whose phone matches the signed-in user's — offered to be claimed, i.e.
 * their imported trips/minyanim merged into the real account. Surfaced after the user adds a phone.
 */
export interface ClaimableSeedDTO {
  seedUserId: string;
  name: string;
  /** The matched phone (E.164) — the same number the viewer has on their profile. */
  phone: string;
  /** How many trips (stays) this seed owns. */
  stays: number;
  /** How many minyanim this seed hosts. */
  events: number;
}

/** Confirm claiming one or more matched seed users (merge their data, then delete the seed). */
export const claimSeedSchema = z.object({
  seedUserIds: z.array(z.string().min(1)).min(1, "claim.none_selected"),
});
export type ClaimSeedInput = z.infer<typeof claimSeedSchema>;
