import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CreateStayInputType,
  UpdateStayInputType,
  OwnerStayDTO,
  HistoryPage,
  LinkedMinyanDTO,
} from "@minyanim/shared";
import { api } from "./api";

/** Active minyanim linked to a Stay (013 location-change guard). Disabled until a stay id is known. */
export function useLinkedMinyanim(stayId: string | null) {
  return useQuery({
    queryKey: ["stay-linked-minyanim", stayId] as const,
    queryFn: () => api<{ minyanim: LinkedMinyanDTO[] }>(`/stays/${stayId}/linked-minyanim`),
    enabled: !!stayId,
  });
}

/** Query key for the active-dashboard Stay list. Parameterized by scope (004 D13) — History uses
 * `["stays","history"]` with an InfiniteData shape (see `useStaysInfinite`). */
export const STAYS_KEY = ["stays", "active"] as const;
/** Query key for the cursor-paginated History list (InfiniteData shape). */
export const HISTORY_KEY = ["stays", "history"] as const;

/** The device IANA timezone, sent on read/create/edit so the server can run the temporal check
 * (and derive `isPast`) for Stays that have no coordinates (D3). */
function clientTimezoneHeader(): Record<string, string> {
  return { "X-Client-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone };
}

/** GET /api/stays?scope=active — caller's upcoming/in-progress Stays, nearest-first (D1). */
export const listStays = () =>
  api<{ stays: OwnerStayDTO[] }>("/stays?scope=active", { headers: clientTimezoneHeader() }).then((r) => r.stays);

/** GET /api/stays?scope=history — one page of past + cancelled Stays, newest-departure first. */
export const listStayHistory = (cursor?: string) =>
  api<HistoryPage>(`/stays?scope=history${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, {
    headers: clientTimezoneHeader(),
  });

/** POST /api/stays — create a Stay. */
export const createStay = (input: CreateStayInputType) =>
  api<OwnerStayDTO>("/stays", {
    method: "POST",
    headers: clientTimezoneHeader(),
    body: JSON.stringify(input),
  });

/** PATCH /api/stays/{id} — partial update of a Stay. */
export const updateStay = (id: string, input: UpdateStayInputType) =>
  api<OwnerStayDTO>(`/stays/${id}`, {
    method: "PATCH",
    headers: clientTimezoneHeader(),
    body: JSON.stringify(input),
  });

/** GET /api/stays/{id} — fetch one owned Stay (used to seed the edit form). */
export const getStay = (id: string) =>
  api<OwnerStayDTO>(`/stays/${id}`, { headers: clientTimezoneHeader() });

/** POST /api/stays/{id}/cancel — soft-cancel (requires explicit confirmation). */
export const cancelStay = (id: string) =>
  api<{ ok: true }>(`/stays/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });

/** DELETE /api/stays/{id}/permanent — hard-delete a cancelled Stay (confirm-guarded, D8). */
export const permanentDeleteStay = (id: string) =>
  api<{ ok: true }>(`/stays/${id}/permanent`, {
    method: "DELETE",
    body: JSON.stringify({ confirm: true }),
  });

/** TanStack Query hook for the dashboard list. */
export function useStays() {
  return useQuery({ queryKey: STAYS_KEY, queryFn: listStays });
}

/** Infinite-scroll hook for History — pages keyed by `nextCursor` (InfiniteData shape, D13). */
export function useStaysInfinite() {
  return useInfiniteQuery({
    queryKey: HISTORY_KEY,
    queryFn: ({ pageParam }) => listStayHistory(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: HistoryPage) => last.nextCursor ?? undefined,
  });
}

/** Permanent-delete mutation (History). Invalidates the history cache on settle (D8). */
export function usePermanentDeleteStay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: permanentDeleteStay,
    onSettled: () => qc.invalidateQueries({ queryKey: HISTORY_KEY }),
  });
}

/** Create mutation. Invalidates the list on settle so the new Stay appears (SC-002). */
export function useCreateStay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createStay,
    onSettled: () => qc.invalidateQueries({ queryKey: STAYS_KEY }),
  });
}

/** Update mutation with optimistic patch on the ["stays"] cache (SC-003), rollback on error. */
export function useUpdateStay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStayInputType }) =>
      updateStay(id, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: STAYS_KEY });
      const previous = qc.getQueryData<OwnerStayDTO[]>(STAYS_KEY);
      if (previous) {
        qc.setQueryData<OwnerStayDTO[]>(
          STAYS_KEY,
          previous.map((s) => (s.id === id ? { ...s, ...input } : s)),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(STAYS_KEY, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: STAYS_KEY }),
  });
}

/** Cancel mutation with optimistic removal from the active list (SC-002 <2s), rollback on error.
 * A cancelled Stay moves to History, so the history cache is invalidated on settle too (D2). */
export function useCancelStay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelStay(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: STAYS_KEY });
      const previous = qc.getQueryData<OwnerStayDTO[]>(STAYS_KEY);
      if (previous) {
        qc.setQueryData<OwnerStayDTO[]>(
          STAYS_KEY,
          previous.filter((s) => s.id !== id),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(STAYS_KEY, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: STAYS_KEY });
      void qc.invalidateQueries({ queryKey: HISTORY_KEY });
    },
  });
}
