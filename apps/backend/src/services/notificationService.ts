import { QUORUM, NEAR_QUORUM, type NotificationKind } from "@minyanim/shared";
import type { Ctx } from "../lib/context";
import { committedMenByEvent, hostedEventIds } from "../repositories/eventRepository";
import { pendingRequestsForEvent } from "../repositories/attendanceRepository";
import { resendEmailSender, notificationEmail } from "../lib/notification-email";
import * as repo from "../repositories/notificationRepository";

interface NotifyInfo {
  city: string;
  country: string;
  hostUserId: string;
  /** Behavior class — drives the type-aware deep link (`/minyan/:id` vs `/event/:id`). */
  type?: string;
}

/** Type-aware deep link (T023): gatherings live at `/event/:id`, minyanim at `/minyan/:id`. */
function eventUrl(base: string, type: string | undefined, eventId: string): string {
  const path = type === "gathering" ? "event" : "minyan";
  return `${base}/${path}/${eventId}`;
}

/**
 * Notify people with an active location near a newly-hosted minyan (in-app only — no email, to
 * avoid unsolicited mail). Best-effort: errors are logged, never thrown (the host already succeeded).
 */
export async function onMinyanCreated(ctx: Ctx, eventId: string, recipientUserIds: string[]): Promise<void> {
  if (recipientUserIds.length === 0) return;
  try {
    await repo.insertNotifications(ctx.db, eventId, "minyan_nearby", recipientUserIds);
    ctx.log.info("notification.fanout", { eventId, kind: "minyan_nearby", recipientCount: recipientUserIds.length });
  } catch (e) {
    ctx.log.warn("notification.nearby_failed", { eventId, err: String(e) });
  }
}

/**
 * Fan out a notification: write in-app rows SYNCHRONOUSLY (the source of truth), then defer the
 * emails past the response via `ctx.defer` (R8). Each email is isolated in try/catch so one bad
 * address never aborts the batch; failures are logged, not thrown.
 */
function fanOut(ctx: Ctx, eventId: string, kind: NotificationKind, recipients: repo.Recipient[], info: NotifyInfo): Promise<void> {
  if (recipients.length === 0) return Promise.resolve();
  const url = eventUrl(ctx.env.APP_BASE_URL ?? "", info.type, eventId);
  const sender = resendEmailSender(ctx.env);
  return repo.insertNotifications(ctx.db, eventId, kind, recipients.map((r) => r.userId)).then(() => {
    ctx.log.info("notification.fanout", { eventId, kind, recipientCount: recipients.length });
    ctx.defer(
      Promise.all(
        recipients.map(async (r) => {
          try {
            const lang = r.language === "en" ? "en" : "he";
            const { subject, html } = notificationEmail(kind, lang, { city: info.city, country: info.country, url });
            await sender.send({ to: r.email, subject, html, lang, kind });
          } catch (e) {
            ctx.log.warn("notification.email_failed", { recipient: r.userId, err: String(e) });
          }
        }),
      ),
    );
  });
}

/**
 * Recompute quorum crossings after a commitment change and fire the matching notification exactly
 * once (R8/R9). Quorum-reached → host + all participants; near-quorum (8) and quorum-lost →
 * host only. The near-quorum log persists across the quorum cycle (cleared only below 8) so a
 * 10→9 dip doesn't re-fire it.
 */
export async function onQuorumChange(ctx: Ctx, eventId: string): Promise<void> {
  const info = await repo.eventNotifyContext(ctx.db, eventId);
  if (!info) return;
  const men = (await committedMenByEvent(ctx.db, [eventId])).get(eventId) ?? 0;
  const recipients = await repo.recipientsForEvent(ctx.db, eventId);
  const host = recipients.filter((r) => r.userId === info.hostUserId);

  if (men >= QUORUM) {
    if (await repo.claimCrossing(ctx.db, eventId, "quorum_reached", QUORUM)) {
      await fanOut(ctx, eventId, "quorum_reached", recipients, info);
    } else {
      ctx.log.info("notification.idempotent_skip", { eventId, kind: "quorum_reached" });
    }
  } else if (await repo.clearCrossing(ctx.db, eventId, "quorum_reached", QUORUM)) {
    await fanOut(ctx, eventId, "quorum_lost", host, info);
  }

  if (men >= NEAR_QUORUM && men < QUORUM) {
    if (await repo.claimCrossing(ctx.db, eventId, "near_quorum", NEAR_QUORUM)) {
      await fanOut(ctx, eventId, "near_quorum", host, info);
    }
  } else if (men < NEAR_QUORUM) {
    await repo.clearCrossing(ctx.db, eventId, "near_quorum", NEAR_QUORUM);
  }
}

/** Notify committed participants that the host cancelled (recipients captured BEFORE the void). */
export async function onCancelled(ctx: Ctx, eventId: string, recipients: repo.Recipient[], info: NotifyInfo): Promise<void> {
  await fanOut(ctx, eventId, "cancelled", recipients, info);
}

/** Notify committed participants that the minyan's host was reassigned (013 reassign-host action). */
export async function onHostChanged(ctx: Ctx, eventId: string, recipients: repo.Recipient[], info: NotifyInfo): Promise<void> {
  await fanOut(ctx, eventId, "host_changed", recipients, info);
}

/**
 * Best-effort 1:1 fan-out for the 014 RSVP flows (R8). These are single-recipient events (not
 * threshold crossings), so they bypass the idempotency ledger. Failures are logged, never thrown —
 * the RSVP action itself already succeeded; a notify hiccup must not fail the request.
 */
async function notifyOne(ctx: Ctx, eventId: string, kind: NotificationKind, recipientUserId: string): Promise<void> {
  try {
    const info = await repo.eventNotifyContext(ctx.db, eventId);
    if (!info) return;
    const r = await repo.recipientById(ctx.db, recipientUserId);
    if (r) await fanOut(ctx, eventId, kind, [r], info);
  } catch (e) {
    ctx.log.warn("notification.rsvp_failed", { eventId, kind, err: String(e) });
  }
}

/** A guest requested a seat on an approval-mode gathering → notify the host (R8). */
export async function onSeatRequested(ctx: Ctx, eventId: string, hostUserId: string): Promise<void> {
  await notifyOne(ctx, eventId, "seat_requested", hostUserId);
}

/** The host approved a pending request → notify the requester (they now see the address, R6). */
export async function onRequestApproved(ctx: Ctx, eventId: string, requesterUserId: string): Promise<void> {
  await notifyOne(ctx, eventId, "request_approved", requesterUserId);
}

/** The host declined a pending request → notify the requester (R4). */
export async function onRequestDeclined(ctx: Ctx, eventId: string, requesterUserId: string): Promise<void> {
  await notifyOne(ctx, eventId, "request_declined", requesterUserId);
}

/** A freed seat auto-promoted the earliest waitlisted guest (open mode) → notify them (R4/FR-006). */
export async function onWaitlistPromoted(ctx: Ctx, eventId: string, promotedUserId: string): Promise<void> {
  await notifyOne(ctx, eventId, "waitlist_promoted", promotedUserId);
}

/**
 * An event became unavailable to its PENDING requesters (T047): its content was moderation-hidden
 * (auto-hide threshold) or its host was suspended/banned. The request can no longer proceed, so the
 * pending requesters get a `request_declined`-style notification (reusing that flow). Best-effort —
 * errors are logged, never thrown (the moderation/sanction action already succeeded).
 */
export async function onEventUnavailable(ctx: Ctx, eventId: string): Promise<void> {
  try {
    const info = await repo.eventNotifyContext(ctx.db, eventId);
    if (!info) return;
    const pending = await pendingRequestsForEvent(ctx.db, eventId);
    if (pending.length === 0) return;
    const recipients = await repo.recipientsByIds(ctx.db, pending.map((p) => p.userId));
    await fanOut(ctx, eventId, "request_declined", recipients, info);
  } catch (e) {
    ctx.log.warn("notification.event_unavailable_failed", { eventId, err: String(e) });
  }
}

/**
 * A host was suspended/banned (T047): notify the pending requesters of every event they host that
 * their request can no longer proceed. Best-effort per event ({@link onEventUnavailable} no-ops when
 * an event has no pending requesters), never throws.
 */
export async function onHostSanctioned(ctx: Ctx, hostUserId: string): Promise<void> {
  try {
    const ids = await hostedEventIds(ctx.db, hostUserId);
    for (const id of ids) await onEventUnavailable(ctx, id);
  } catch (e) {
    ctx.log.warn("notification.host_sanctioned_failed", { hostUserId, err: String(e) });
  }
}
