import { z } from "zod";

/** Why a reporter flagged a piece of content. */
export const flagReasonSchema = z.enum(["spam", "inappropriate", "fake", "other"]);
export type FlagReason = z.infer<typeof flagReasonSchema>;

/** Flag body. `contentType` is derived from the route (not the body — the client can't spoof it). */
export const flagContentSchema = z.object({
  reason: flagReasonSchema,
  /** Also attach a user-level report against the content owner (US1.3). Never sanctions on its own. */
  reportUser: z.boolean().optional(),
});
export type FlagContentInput = z.infer<typeof flagContentSchema>;

/** A user's moderation status. Only the sanction service writes it (never signup/profile). */
export const userStatusSchema = z.enum(["active", "suspended", "banned"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

/** The content kinds that can be flagged/moderated. */
export type ModeratedContentType = "stay" | "event";
