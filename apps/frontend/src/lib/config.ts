import { useQuery } from "@tanstack/react-query";
import type { PublicConfig } from "@minyanim/shared";
import { api } from "./api";

/** GET /api/config — public client config (the runtime MapTiler tile key). */
export const getConfig = () => api<PublicConfig>("/config");

/** Cached public config. The tile key rarely changes, so it's held for the session. */
export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Convenience: the runtime MapTiler tile key, or undefined until config loads / when unset. */
export function useMaptilerTileKey(): string | undefined {
  return useConfig().data?.maptilerTileKey || undefined;
}
