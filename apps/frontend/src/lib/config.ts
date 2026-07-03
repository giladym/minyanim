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

/**
 * A MapTiler static-map thumbnail URL for a location card header — the "real location image" from
 * the Stay's own coordinates. Returns null when coords or the key are missing (caller shows the
 * token gradient fallback). Uses the public, origin-restricted tile key we already serve.
 */
export function staticMapUrl(
  key: string | undefined,
  lat: number | null,
  lng: number | null,
  opts: { zoom?: number; w?: number; h?: number } = {},
): string | null {
  if (!key || lat == null || lng == null) return null;
  const { zoom = 11, w = 640, h = 260 } = opts;
  return `https://api.maptiler.com/maps/streets-v2/static/${lng},${lat},${zoom}/${w}x${h}@2x.png?key=${key}`;
}
