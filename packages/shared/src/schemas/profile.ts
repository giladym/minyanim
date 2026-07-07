import { z } from "zod";
import { languageSchema, themeSchema, havdalahOpinionSchema, e164 } from "./common";

export const addPhoneSchema = z.object({
  e164,
  label: z.string().max(60).nullish(),
});
export type AddPhoneInput = z.infer<typeof addPhoneSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1, "name.required").max(120).optional(),
  language: languageSchema.optional(),
  theme: themeSchema.optional(),
  havdalahOpinion: havdalahOpinionSchema.optional(),
  sharePhone: z.boolean().optional(),
  acceptMessages: z.boolean().optional(),
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
  havdalahOpinion: string;
  /** Whether the user shares their phone with others (minyan roster + travelers list). */
  sharePhone: boolean;
  /** Whether the user accepts in-app messages from others (008). */
  acceptMessages: boolean;
  phones: PhoneNumber[];
}
