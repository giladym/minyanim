import { api } from "./api";
import type { Profile, UpdateProfileInput } from "@minyanim/shared";

export const getProfile = () => api<Profile>("/me");
export const patchProfile = (input: UpdateProfileInput) =>
  api<Profile>("/me", { method: "PATCH", body: JSON.stringify(input) });
