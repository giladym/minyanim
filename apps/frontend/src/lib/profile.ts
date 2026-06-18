import { api } from "./api";
import type { Profile, UpdateProfileInput, AddPhoneInput, PhoneNumber } from "@minyanim/shared";

export const getProfile = () => api<Profile>("/me");
export const patchProfile = (input: UpdateProfileInput) =>
  api<Profile>("/me", { method: "PATCH", body: JSON.stringify(input) });
export const addPhone = (input: AddPhoneInput) =>
  api<PhoneNumber>("/me/phones", { method: "POST", body: JSON.stringify(input) });
export const deletePhone = (id: string) =>
  api<null>(`/me/phones/${id}`, { method: "DELETE" });
export const deleteAccount = () =>
  api<{ ok: true }>("/me", { method: "DELETE", body: JSON.stringify({ confirm: true }) });
