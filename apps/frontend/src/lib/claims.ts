import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClaimableSeedDTO, ClaimSeedInput } from "@minyanim/shared";
import { api } from "./api";
import { STAYS_KEY } from "./stays";

export const CLAIMS_KEY = ["claims"] as const;

export const listClaimableSeeds = () => api<{ seeds: ClaimableSeedDTO[] }>("/me/claims");

/** Seed (imported) users whose phone matches the signed-in user — offered to be claimed. */
export function useClaimableSeeds() {
  return useQuery({ queryKey: CLAIMS_KEY, queryFn: listClaimableSeeds });
}

/** Merge the given seed users into the account (their trips/minyanim become the caller's). */
export function useClaimSeeds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seedUserIds: string[]) =>
      api<{ claimed: number; stays: number; events: number }>("/me/claims", {
        method: "POST",
        body: JSON.stringify({ seedUserIds } satisfies ClaimSeedInput),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLAIMS_KEY });
      void qc.invalidateQueries({ queryKey: STAYS_KEY });
    },
  });
}
