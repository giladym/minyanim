import { z } from "zod";

/** E.164 international phone format. */
export const e164 = z.string().regex(/^\+[1-9]\d{1,14}$/, "phone.invalid_e164");
export const languageSchema = z.enum(["he", "en"]);
export const themeSchema = z.string().min(1); // extensible identifier (light|dark|system|…)
/** Which end-of-Shabbat opinion a user sees for Havdalah (005 D4); `both` shows both, labeled. */
export const havdalahOpinionSchema = z.enum(["geonim", "rabbeinu_tam", "both"]);

export type Language = z.infer<typeof languageSchema>;
export type HavdalahOpinion = z.infer<typeof havdalahOpinionSchema>;
