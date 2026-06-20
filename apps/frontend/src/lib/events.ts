import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  POLL_DETAIL_MS,
  type CreateEventInputType,
  type UpdateEventInputType,
  type OwnerMinyanDTO,
  type ParticipantMinyanDTO,
  type PublicMinyanDTO,
  type EventRole,
} from "@minyanim/shared";
import { api } from "./api";

/** A Minyan in any of the three viewer shapes (the server picks by relationship). */
export type AnyMinyanDTO = PublicMinyanDTO | ParticipantMinyanDTO | OwnerMinyanDTO;

export const minyanKey = (id: string) => ["event", id] as const;

export const getMinyan = (id: string) => api<AnyMinyanDTO>(`/events/${id}`);
export const hostMinyan = (input: CreateEventInputType) => api<OwnerMinyanDTO>("/events", { method: "POST", body: JSON.stringify(input) });
export const updateMinyan = (id: string, input: UpdateEventInputType) => api<OwnerMinyanDTO>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const cancelMinyan = (id: string) => api<{ ok: true }>(`/events/${id}/cancel`, { method: "POST", body: JSON.stringify({ confirm: true }) });
export const commitToMinyan = (id: string, numMen: number, stayId?: string | null) =>
  api<{ minyan: ParticipantMinyanDTO; conflict: boolean }>(`/events/${id}/commit`, { method: "POST", body: JSON.stringify({ numMen, stayId: stayId ?? null }) });
export const changeCommitment = (id: string, numMen: number) =>
  api<{ minyan: ParticipantMinyanDTO }>(`/events/${id}/commit`, { method: "PATCH", body: JSON.stringify({ numMen }) });
export const withdrawCommitment = (id: string) => api<{ ok: true }>(`/events/${id}/commit`, { method: "DELETE" });

/**
 * Minyan-detail query. Polls every {@link POLL_DETAIL_MS} so the committed count/status stay fresh
 * (SC-002/D5), but STOPS once the gathering is terminal (completed/cancelled) — no point polling a
 * dead minyan (R7). Pauses while the tab is hidden.
 */
export function useMinyan(id: string) {
  return useQuery({
    queryKey: minyanKey(id),
    queryFn: () => getMinyan(id),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "completed" || s === "cancelled" ? false : POLL_DETAIL_MS;
    },
    refetchIntervalInBackground: false,
  });
}

export function useHostMinyan() {
  return useMutation({ mutationFn: hostMinyan });
}

export function useUpdateMinyan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEventInputType) => updateMinyan(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}

export function useCancelMinyan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cancelMinyan(id),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}

export function useCommit(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (numMen: number) => commitToMinyan(id, numMen),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}

export function useChangeCommitment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (numMen: number) => changeCommitment(id, numMen),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}

export function useWithdraw(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => withdrawCommitment(id),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}

export const claimRole = (id: string, role: EventRole) => api(`/events/${id}/roles/${role}`, { method: "POST", body: "{}" });
export const releaseRole = (id: string, role: EventRole) => api(`/events/${id}/roles/${role}`, { method: "DELETE" });

export function useClaimRole(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: EventRole) => claimRole(id, role),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}

export function useReleaseRole(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: EventRole) => releaseRole(id, role),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}
