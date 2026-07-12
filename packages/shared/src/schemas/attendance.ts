import { z } from "zod";
import { PARTY_SIZE_MAX } from "../config";

/**
 * Generalized attendance/RSVP contracts (014, R2 Option A). Replaces the 003 `commitment` schemas.
 * One attendance per user per event, with a status; a minyan reads `partySize` as men (FR-003). The
 * shipped `/commit` alias sends these too (minyan → always `confirmed`). "confirmed" is the single
 * predicate the address-reveal gate keys on (SC-003) — a pending/waitlisted viewer is NOT committed.
 */

/** Per-attendee status. Approval mode uses `pending` as the ordered queue (no `waitlisted`); open
 * mode uses `confirmed`/`waitlisted`. `cancelled`/`declined` are soft-terminal (R14). */
export const AttendanceStatusSchema = z.enum([
  "pending",
  "confirmed",
  "waitlisted",
  "declined",
  "cancelled",
]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

/** Join / request a seat (D3). Independent of any Stay; `stayId` optional (reconciliation, D12). */
export const CreateAttendanceInput = z.object({
  partySize: z.number().int().min(1, "party_size.invalid").max(PARTY_SIZE_MAX, "party_size.invalid"),
  stayId: z.string().nullish(),
});
export type CreateAttendanceInputType = z.infer<typeof CreateAttendanceInput>;

/** Change own party size (PATCH). Increasing a confirmed row is rejected if it no longer fits (A2). */
export const UpdateAttendanceInput = z.object({
  partySize: z.number().int().min(1, "party_size.invalid").max(PARTY_SIZE_MAX, "party_size.invalid"),
});
export type UpdateAttendanceInputType = z.infer<typeof UpdateAttendanceInput>;

/** A viewer's own attendance summary (surfaced on the event DTO / My-events). */
export interface AttendanceDTO {
  eventId: string;
  status: AttendanceStatus;
  partySize: number;
  requestedAt: number;
  createdAt: number;
  updatedAt: number;
}

// ── Back-compat aliases (003 `commitment` names) so shipped `/commit` code keeps compiling ────────
/** @deprecated use CreateAttendanceInput; kept so the `/commit` minyan alias compiles. */
export const CreateCommitmentInput = z.object({
  numMen: z.number().int().min(1, "party_size.invalid").max(PARTY_SIZE_MAX, "party_size.invalid"),
  stayId: z.string().nullish(),
});
export type CreateCommitmentInputType = z.infer<typeof CreateCommitmentInput>;
/** @deprecated use UpdateAttendanceInput. */
export const UpdateCommitmentInput = z.object({
  numMen: z.number().int().min(1, "party_size.invalid").max(PARTY_SIZE_MAX, "party_size.invalid"),
});
export type UpdateCommitmentInputType = z.infer<typeof UpdateCommitmentInput>;
