import { useQuery } from "@tanstack/react-query";
import type { ZmanimResponse } from "@minyanim/shared";
import { api } from "./api";

/** GET /api/stays/{id}/zmanim — per-Shabbat times for an owned Stay (detail-scoped, 005 D5). */
export const getStayZmanim = (id: string) => api<ZmanimResponse>(`/stays/${id}/zmanim`);

/** GET /api/events/{id}/zmanim — public Shabbat times for a hosted Minyan. */
export const getMinyanZmanim = (id: string) => api<ZmanimResponse>(`/events/${id}/zmanim`);

/** Lazy Stay-zmanim query — only fetches once `enabled` (e.g. the card section is expanded). */
export function useStayZmanim(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["zmanim", "stay", id],
    queryFn: () => getStayZmanim(id),
    enabled,
    staleTime: 60 * 60 * 1000, // times are date-stable; cache for the session
  });
}

/** Minyan-zmanim query (public detail). */
export function useMinyanZmanim(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["zmanim", "minyan", id],
    queryFn: () => getMinyanZmanim(id),
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}
