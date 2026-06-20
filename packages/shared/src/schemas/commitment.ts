import { z } from "zod";
import { PARTY_SIZE_MAX } from "../config";

/** Commit-to-a-Minyan body (D3). Independent of any Stay; `stayId` optional (reconciliation, D12). */
export const CreateCommitmentInput = z.object({
  numMen: z.number().int().min(1, "party_size.invalid").max(PARTY_SIZE_MAX, "party_size.invalid"),
  stayId: z.string().nullish(),
});
export type CreateCommitmentInputType = z.infer<typeof CreateCommitmentInput>;

/** Change party size (PATCH). */
export const UpdateCommitmentInput = z.object({
  numMen: z.number().int().min(1, "party_size.invalid").max(PARTY_SIZE_MAX, "party_size.invalid"),
});
export type UpdateCommitmentInputType = z.infer<typeof UpdateCommitmentInput>;
