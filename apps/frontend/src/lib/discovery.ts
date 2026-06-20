import { useQuery } from "@tanstack/react-query";
import { POLL_DISCOVERY_MS, type DiscoveryResult, type Nusach } from "@minyanim/shared";
import { api } from "./api";

/** Inputs to a discovery search (the map centre + date window + filters). */
export interface DiscoveryParams {
  lat: number;
  lng: number;
  radiusKm?: number;
  city?: string;
  country?: string;
  from: number;
  to: number;
  nusach?: Nusach;
  seferTorah?: boolean;
}

/** Build the `/api/discovery` query string from params (omitting empty filters). */
function toQuery(p: DiscoveryParams): string {
  const q = new URLSearchParams();
  q.set("lat", String(p.lat));
  q.set("lng", String(p.lng));
  if (p.radiusKm) q.set("radiusKm", String(p.radiusKm));
  if (p.city) q.set("city", p.city);
  if (p.country) q.set("country", p.country);
  q.set("from", String(p.from));
  q.set("to", String(p.to));
  if (p.nusach) q.set("nusach", p.nusach);
  if (p.seferTorah) q.set("seferTorah", "true");
  return q.toString();
}

export const discover = (p: DiscoveryParams) => api<DiscoveryResult>(`/discovery?${toQuery(p)}`);

/**
 * Discovery query hook. Polls every {@link POLL_DISCOVERY_MS} so committed counts stay fresh
 * (SC-002/D5); pauses when the tab is hidden. Disabled until a centre (params) is chosen.
 */
export function useDiscovery(params: DiscoveryParams | null) {
  return useQuery({
    queryKey: ["discovery", params],
    queryFn: () => discover(params!),
    enabled: params !== null,
    refetchInterval: POLL_DISCOVERY_MS,
    refetchIntervalInBackground: false,
  });
}

/** Batched nearby-minyan counts per stay for the My-Stays dashboard (FR-019). */
export function useNearStayCounts() {
  return useQuery({
    queryKey: ["near-stay-counts"],
    queryFn: () => api<{ counts: Record<string, number> }>("/discovery/near-stay-counts").then((r) => r.counts),
  });
}
