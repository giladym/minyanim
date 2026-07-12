import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  POLL_DETAIL_MS,
  type CreateEventInputType,
  type UpdateEventInputType,
  type OwnerMinyanDTO,
  type ParticipantMinyanDTO,
  type RosterMinyanDTO,
  type PublicMinyanDTO,
  type PublicGatheringDTO,
  type RosterGatheringDTO,
  type ParticipantGatheringDTO,
  type OwnerGatheringDTO,
  type OwnerEventDTO,
  type MyEventsDTO,
  type AttendanceStatus,
  type EventRole,
  type FlagReason,
  type FlagContentInput,
} from "@minyanim/shared";
import { api } from "./api";

/** A Minyan in any of the four viewer shapes (the server picks by relationship): public
 * (signed-out), roster (signed-in, not committed), participant (committed), owner (host). */
export type AnyMinyanDTO = PublicMinyanDTO | RosterMinyanDTO | ParticipantMinyanDTO | OwnerMinyanDTO;
/** A gathering (hosting/social) in any viewer shape. */
export type AnyGatheringDTO = PublicGatheringDTO | RosterGatheringDTO | ParticipantGatheringDTO | OwnerGatheringDTO;
/** Any event (minyan or gathering) in any viewer shape — discriminated on `type` (014). */
export type AnyEventDTO = AnyMinyanDTO | AnyGatheringDTO;

export const minyanKey = (id: string) => ["event", id] as const;
export const myEventsKey = ["me", "events"] as const;

/** GET /events/:id — returns the viewer-appropriate tier for a minyan OR a gathering (014). */
export const getMinyan = (id: string) => api<AnyEventDTO>(`/events/${id}`);
export const hostMinyan = (input: CreateEventInputType) => api<OwnerMinyanDTO>("/events", { method: "POST", body: JSON.stringify(input) });
/** POST /events — create any event type (014). Returns the owner tier for the new event. */
export const hostEvent = (input: CreateEventInputType) => api<OwnerEventDTO>("/events", { method: "POST", body: JSON.stringify(input) });

/** Reassign a minyan's host to a committed participant (013 guard). */
export function useTransferHost() {
  return useMutation({
    mutationFn: ({ eventId, newHostUserId }: { eventId: string; newHostUserId: string }) =>
      api(`/events/${eventId}/transfer-host`, { method: "POST", body: JSON.stringify({ newHostUserId }) }),
  });
}
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

export const flagMinyan = (id: string, reason: FlagReason) =>
  api(`/events/${id}/flag`, { method: "POST", body: JSON.stringify({ reason } satisfies FlagContentInput) });
export function useFlagMinyan(id: string) {
  return useMutation({ mutationFn: (reason: FlagReason) => flagMinyan(id, reason) });
}

// ── Generalized RSVP / attendance (014, T030) ─────────────────────────────────
// These drive the kind-aware RSVP band + host RequestsPanel on a gathering. Each invalidates the
// event detail query on settle so the seats meter / status / roster re-read; the shipped minyan
// `/commit` hooks above are left untouched (SC-005).

/** The attendance mutation response tier — the refreshed event DTO + the viewer's own status. */
export interface AttendanceResult {
  event: AnyEventDTO;
  myStatus: AttendanceStatus;
}

export function useHostEvent() {
  return useMutation({ mutationFn: hostEvent });
}

/** POST /events/:id/attendance — join / request a seat (mode decided server-side). */
export function useRequestSeat(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ partySize, stayId }: { partySize: number; stayId?: string | null }) =>
      api<AttendanceResult>(`/events/${id}/attendance`, { method: "POST", body: JSON.stringify({ partySize, stayId: stayId ?? null }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}

/** PATCH /events/:id/attendance — change own party size (reduce-to-fit or grow). */
export function useChangePartySize(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partySize: number) =>
      api<AttendanceResult>(`/events/${id}/attendance`, { method: "PATCH", body: JSON.stringify({ partySize }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}

/** DELETE /events/:id/attendance — cancel own attendance/request. */
export function useCancelAttendance(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/events/${id}/attendance`, { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: minyanKey(id) }),
  });
}

/** POST /events/:id/requests/:attendanceId/approve — host approves a pending seat request. */
export function useApproveRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attendanceId: string) =>
      api<OwnerEventDTO>(`/events/${id}/requests/${attendanceId}/approve`, { method: "POST", body: "{}" }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: minyanKey(id) });
      void qc.invalidateQueries({ queryKey: myEventsKey });
    },
  });
}

/** POST /events/:id/requests/:attendanceId/decline — host declines a pending seat request. */
export function useDeclineRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attendanceId: string) =>
      api<OwnerEventDTO>(`/events/${id}/requests/${attendanceId}/decline`, { method: "POST", body: "{}" }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: minyanKey(id) });
      void qc.invalidateQueries({ queryKey: myEventsKey });
    },
  });
}

/** GET /api/me/events — the signed-in user's hosted + attending events (FR-017). */
export const getMyEvents = () => api<MyEventsDTO>("/me/events");
export function useMyEvents(enabled = true) {
  return useQuery({ queryKey: myEventsKey, queryFn: getMyEvents, enabled });
}
