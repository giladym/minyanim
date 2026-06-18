import { z } from "zod";
import { languageSchema, themeSchema, e164 } from "./common";

export const addPhoneSchema = z.object({
  e164,
  label: z.string().max(60).nullish(),
});
export type AddPhoneInput = z.infer<typeof addPhoneSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1, "name.required").max(120).optional(),
  language: languageSchema.optional(),
  theme: themeSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface PhoneNumber {
  id: string;
  e164: string;
  label: string | null;
}

/** GET /api/me response. */
export interface Profile {
  id: string;
  name: string;
  email: string;
  language: string;
  theme: string;
  phones: PhoneNumber[];
}
