import { useQuery } from "@tanstack/react-query";
import type { AdminMetricsDTO } from "@minyanim/shared";
import { api } from "./api";

/** The admin metrics projection (006 US5). Admin-only; 403 → query error (no retry). */
export function useAdminMetrics() {
  return useQuery({
    queryKey: ["admin", "metrics"] as const,
    queryFn: () => api<AdminMetricsDTO>("/admin/metrics"),
    retry: false,
    staleTime: 60 * 1000,
  });
}
