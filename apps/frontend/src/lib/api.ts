import { QueryClient } from "@tanstack/react-query";
import type { ApiErrorResponse } from "@minyanim/shared";

export const queryClient = new QueryClient();

/** Thrown on non-2xx API responses; carries the shared error codes for i18n rendering. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorResponse,
  ) {
    super("api_error");
  }
}

/** Typed fetch against the same-origin API (proxied to the backend Worker). */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data as ApiErrorResponse) ?? { errors: [] });
  return data as T;
}
