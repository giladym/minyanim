import { z } from "zod";

/** Notification kinds (D6). `minyan_nearby` = a new minyan was hosted near your active location. */
export const NotificationKindSchema = z.enum([
  "quorum_reached",
  "near_quorum",
  "quorum_lost",
  "cancelled",
  "minyan_nearby",
  "host_changed",
  // 014 — hosting/gathering RSVP flows (R8).
  "seat_requested", // → host: a traveler requested a seat
  "request_approved", // → requester: host approved
  "request_declined", // → requester: host declined
  "waitlist_promoted", // → guest: a freed seat promoted them (open mode)
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

/** One in-app notification (inbox row). */
export interface NotificationDTO {
  id: string;
  eventId: string;
  kind: NotificationKind;
  /** Public context for rendering the inbox line (never private fields). */
  city: string;
  country: string;
  eventDate: number;
  read: boolean;
  createdAt: number;
}

/** GET /api/notifications response. */
export interface NotificationListResponse {
  notifications: NotificationDTO[];
  unread: number;
}
