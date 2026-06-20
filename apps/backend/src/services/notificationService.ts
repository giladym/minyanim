import { QUORUM, NEAR_QUORUM, type NotificationKind } from "@minyanim/shared";
import type { Ctx } from "../lib/context";
import { committedMenByEvent } from "../repositories/eventRepository";
import { resendEmailSender, notificationEmail } from "../lib/notification-email";
import * as repo from "../repositories/notificationRepository";

interface NotifyInfo {
  city: string;
  country: string;
  hostUserId: string;
}

/**
 * Fan out a notification: write in-app rows SYNCHRONOUSLY (the source of truth), then defer the
 * emails past the response via `ctx.defer` (R8). Each email is isolated in try/catch so one bad
 * address never aborts the batch; failures are logged, not thrown.
 */
function fanOut(ctx: Ctx, eventId: string, kind: NotificationKind, recipients: repo.Recipient[], info: NotifyInfo): Promise<void> {
  if (recipients.length === 0) return Promise.resolve();
  const url = `${ctx.env.APP_BASE_URL ?? ""}/minyan/${eventId}`;
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
