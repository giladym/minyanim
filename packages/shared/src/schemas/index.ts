/** Shared Zod contracts (request/response payloads). Fleshed out in task T012. */
import { z } from "zod";

/** E.164 international phone format. */
export const e164 = z.string().regex(/^\+[1-9]\d{1,14}$/, "phone.invalid_e164");

export const languageSchema = z.enum(["he", "en"]);
export const themeSchema = z.string().min(1); // extensible identifier (light|dark|system|…)

export type Language = z.infer<typeof languageSchema>;
