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

/** One moderation-queue entry — flags aggregated per content item (US3). */
export interface ModerationQueueEntryDTO {
  contentType: ModeratedContentType;
  contentId: string;
  reporterCount: number;
  reasons: FlagReason[];
  /** true ⇒ auto-hidden (≥3) or admin-removed — needs review. */
  hidden: boolean;
  /** The content owner (the sanction target); null if unknowable. */
  reportedUserId: string | null;
  /** A light recognizer for the admin. */
  content: { city: string; country: string; title?: string };
  /** Earliest flag (age/urgency). Epoch-ms. */
  createdAt: number;
}

export interface ModerationQueueResponse {
  entries: ModerationQueueEntryDTO[];
}

/** Body for a user sanction — only `suspendDays` (suspend). The action comes from the route. */
export const sanctionSchema = z.object({
  suspendDays: z.number().int().positive().max(365).optional(),
});
export type SanctionInput = z.infer<typeof sanctionSchema>;
