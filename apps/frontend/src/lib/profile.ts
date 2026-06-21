import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Profile, UpdateProfileInput, AddPhoneInput, PhoneNumber } from "@minyanim/shared";

/** Query key for the caller's profile. */
export const PROFILE_KEY = ["profile"] as const;

export const getProfile = () => api<Profile>("/me");
export const patchProfile = (input: UpdateProfileInput) =>
  api<Profile>("/me", { method: "PATCH", body: JSON.stringify(input) });

/** TanStack Query hook for the profile (used for the havdalah preference + the profile page). */
export function useProfile() {
  return useQuery({ queryKey: PROFILE_KEY, queryFn: getProfile });
}

/** Update mutation; refreshes the cached profile on settle. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchProfile,
    onSuccess: (p) => qc.setQueryData(PROFILE_KEY, p),
  });
}
export const addPhone = (input: AddPhoneInput) =>
  api<PhoneNumber>("/me/phones", { method: "POST", body: JSON.stringify(input) });
export const deletePhone = (id: string) =>
  api<null>(`/me/phones/${id}`, { method: "DELETE" });
export const deleteAccount = () =>
  api<{ ok: true }>("/me", { method: "DELETE", body: JSON.stringify({ confirm: true }) });
