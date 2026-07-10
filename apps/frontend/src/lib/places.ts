import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateLayerInput,
  CreatePlaceInput,
  LayerDTO,
  PlaceDTO,
  PlacesResponse,
  UpdateLayerInput,
  UpdatePlaceInput,
} from "@minyanim/shared";
import { api } from "./api";

// ── User read path (US1) ──────────────────────────────────────────────────
/** Nearby kosher/Jewish places + active layers around a point. Disabled until coords are known. */
export function usePlaces(lat: number | null, lng: number | null) {
  return useQuery({
    queryKey: ["places", lat, lng] as const,
    queryFn: () => api<PlacesResponse>(`/places?lat=${lat}&lng=${lng}`),
    enabled: lat != null && lng != null,
  });
}

/** Active place layers (for filter chips / entry points) — no coordinates needed. Cached 5 min. */
export function useLayers() {
  return useQuery({
    queryKey: ["layers"] as const,
    queryFn: () => api<{ layers: LayerDTO[] }>("/layers"),
    staleTime: 5 * 60 * 1000,
  });
}

export const ADMIN_ME_KEY = ["admin", "me"] as const;
export const ADMIN_LAYERS_KEY = ["admin", "layers"] as const;
export const adminPlacesKey = (layerId?: string) => ["admin", "places", layerId ?? "all"] as const;

/** Whether the signed-in user is an admin. 403 → not admin (surfaces as query error; no retry). */
export function useAdminMe() {
  return useQuery({
    queryKey: ADMIN_ME_KEY,
    queryFn: () => api<{ isAdmin: boolean }>("/admin/me"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Layers ────────────────────────────────────────────────────────────────
export function useAdminLayers() {
  return useQuery({ queryKey: ADMIN_LAYERS_KEY, queryFn: () => api<{ layers: LayerDTO[] }>("/admin/layers") });
}

export function useCreateLayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLayerInput) => api<LayerDTO>("/admin/layers", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_LAYERS_KEY }),
  });
}

export function useUpdateLayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLayerInput }) =>
      api<LayerDTO>(`/admin/layers/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_LAYERS_KEY }),
  });
}

export function useDeleteLayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/admin/layers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_LAYERS_KEY }),
  });
}

// ── Places ──────────────────────────────────────────────────────────────
export function useAdminPlaces(layerId?: string) {
  return useQuery({
    queryKey: adminPlacesKey(layerId),
    queryFn: () => api<{ places: PlaceDTO[] }>(`/admin/places${layerId ? `?layerId=${encodeURIComponent(layerId)}` : ""}`),
  });
}

export function useCreatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlaceInput) => api<PlaceDTO>("/admin/places", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "places"] }),
  });
}

export function useUpdatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePlaceInput }) =>
      api<PlaceDTO>(`/admin/places/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "places"] }),
  });
}

export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/admin/places/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "places"] }),
  });
}
