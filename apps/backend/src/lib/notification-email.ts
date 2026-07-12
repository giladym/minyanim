import type { Env } from "../env";
import { sendEmail } from "./email";
import type { NotificationKind } from "@minyanim/shared";

/**
 * Injectable email transport so the notification fan-out is testable (the test passes a capturing
 * fake; production uses Resend via {@link resendEmailSender}). See R8 / tasks T011/T036.
 */
export interface EmailSender {
  send(opts: { to: string; subject: string; html: string; lang: "he" | "en"; kind: NotificationKind }): Promise<void>;
}

/** Default sender: localized template → existing Resend transport (`lib/email.ts`). */
export function resendEmailSender(env: Env): EmailSender {
  return {
    async send(opts) {
      await sendEmail(env, { to: opts.to, subject: opts.subject, html: opts.html });
    },
  };
}

/** Minimal public context for a notification email (never private fields). */
export interface NotificationEmailContext {
  city: string;
  country: string;
  /** Direct join/detail link (type-aware: `/minyan/:id` for a minyan, `/event/:id` for a gathering). */
  url: string;
}

type Lang = "he" | "en";

const COPY: Record<NotificationKind, Record<Lang, { subject: string; heading: string; body: (c: NotificationEmailContext) => string; cta: string }>> = {
  quorum_reached: {
    he: { subject: "מניין הושלם! · מניין", heading: "יש מניין!", body: (c) => `המניין ב${c.city}, ${c.country} הגיע ל-10 גברים.`, cta: "לצפייה במניין" },
    en: { subject: "Quorum reached! · Minyan", heading: "You have a minyan!", body: (c) => `The minyan in ${c.city}, ${c.country} has reached 10 men.`, cta: "View the minyan" },
  },
  near_quorum: {
    he: { subject: "קרוב למניין · מניין", heading: "כמעט מניין", body: (c) => `למניין ב${c.city} חסרים עוד מעט גברים. שתפו כדי להשלים.`, cta: "לצפייה ושיתוף" },
    en: { subject: "Almost a minyan · Minyan", heading: "Almost there", body: (c) => `The minyan in ${c.city} is a few men short. Share to complete it.`, cta: "View & share" },
  },
  quorum_lost: {
    he: { subject: "המניין ירד מ-10 · מניין", heading: "המניין כבר לא מלא", body: (c) => `המניין ב${c.city} ירד מתחת ל-10 גברים.`, cta: "לצפייה במניין" },
    en: { subject: "Quorum lost · Minyan", heading: "Quorum no longer met", body: (c) => `The minyan in ${c.city} dropped below 10 men.`, cta: "View the minyan" },
  },
  cancelled: {
    he: { subject: "המניין בוטל · מניין", heading: "המניין בוטל", body: (c) => `המניין ב${c.city}, ${c.country} בוטל על ידי המארח.`, cta: "לגילוי מניינים נוספים" },
    en: { subject: "Minyan cancelled · Minyan", heading: "The minyan was cancelled", body: (c) => `The minyan in ${c.city}, ${c.country} was cancelled by its host.`, cta: "Discover other minyanim" },
  },
  // In-app only today (no email is sent for this kind) — present so the COPY map covers every kind.
  minyan_nearby: {
    he: { subject: "מניין חדש באזור · מניין", heading: "מניין חדש באזור", body: (c) => `נפתח מניין חדש ב${c.city}, ${c.country} בתאריך שאתם שוהים שם.`, cta: "לצפייה והצטרפות" },
    en: { subject: "New minyan nearby · Minyan", heading: "A new minyan nearby", body: (c) => `A new minyan was created in ${c.city}, ${c.country} while you have a location there.`, cta: "View & join" },
  },
  host_changed: {
    he: { subject: "המארגן של המניין התחלף · מניין", heading: "המארגן התחלף", body: (c) => `המניין ב${c.city}, ${c.country} קיבל מארגן חדש.`, cta: "לצפייה במניין" },
    en: { subject: "The minyan's host changed · Minyan", heading: "The host changed", body: (c) => `The minyan in ${c.city}, ${c.country} has a new host.`, cta: "View the minyan" },
  },
  // 014 — hosting/gathering RSVP flows (R8/T031b). Each deep-links to the event (type-aware URL is
  // built by the fan-out — `/event/:id` for a gathering).
  seat_requested: {
    he: { subject: "בקשת הצטרפות חדשה · אירוע", heading: "התקבלה בקשה חדשה", body: (c) => `מישהו ביקש להצטרף לאירוע שלכם ב${c.city}, ${c.country}. אפשר לאשר או לדחות את הבקשה מדף האירוע.`, cta: "לאישור הבקשה" },
    en: { subject: "New seat request · Event", heading: "A new request to join", body: (c) => `Someone asked to join your event in ${c.city}, ${c.country}. You can approve or decline the request from the event page.`, cta: "Review the request" },
  },
  request_approved: {
    he: { subject: "הבקשה שלכם אושרה · אירוע", heading: "אושרתם — נתראה!", body: (c) => `בקשתכם להצטרף לאירוע ב${c.city}, ${c.country} אושרה. פרטי הכתובת המדויקים זמינים כעת בדף האירוע.`, cta: "לצפייה בכתובת ובפרטים" },
    en: { subject: "Your request was approved · Event", heading: "You're in!", body: (c) => `Your request to join the event in ${c.city}, ${c.country} was approved. The exact address is now available on the event page.`, cta: "View the address & details" },
  },
  request_declined: {
    he: { subject: "הבקשה שלכם נדחתה · אירוע", heading: "הבקשה לא אושרה", body: (c) => `לצערנו בקשתכם להצטרף לאירוע ב${c.city}, ${c.country} לא אושרה הפעם. אפשר לגלות אירועים נוספים באזור.`, cta: "לגילוי אירועים נוספים" },
    en: { subject: "Your request was declined · Event", heading: "Request not approved", body: (c) => `Unfortunately your request to join the event in ${c.city}, ${c.country} was not approved this time. You can discover other events nearby.`, cta: "Discover other events" },
  },
  waitlist_promoted: {
    he: { subject: "התפנה מקום · אירוע", heading: "התפנה לכם מקום", body: (c) => `התפנה מקום ואתם עכשיו מאושרים לאירוע ב${c.city}, ${c.country}.`, cta: "לצפייה בפרטים" },
    en: { subject: "A seat opened · Event", heading: "A seat opened up", body: (c) => `A seat freed up and you're now confirmed for the event in ${c.city}, ${c.country}.`, cta: "View the details" },
  },
};

/** Language-driven email shell (parameterizes `lib/email-templates.ts#shell`'s dir/lang). */
function shell(lang: Lang, subject: string, heading: string, body: string, cta: string, url: string): string {
  const dir = lang === "he" ? "rtl" : "ltr";
  const align = lang === "he" ? "right" : "left";
  return `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f0ece0;font-family:Arial,Helvetica,sans-serif;direction:${dir};text-align:${align};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0ece0"><tr><td align="center" style="padding:40px 16px;">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#fffdf8;border-radius:18px;">
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 14px;font-size:24px;font-weight:800;color:#2b2620;">${heading}</h1>
<p style="margin:0 0 26px;font-size:16px;color:#6f695d;line-height:1.68;">${body}</p>
<table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#a4512e;border-radius:13px;">
<a href="${url}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:16px;font-weight:800;color:#fff;text-decoration:none;">${cta}</a></td></tr></table>
<hr style="border:none;border-top:1px solid #ece2cf;margin:26px 0 18px;"/>
<p style="margin:0;font-size:12px;color:#a89a7e;">© 2026 מניין · Minyan</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** Build the localized subject + HTML for a notification kind. */
export function notificationEmail(kind: NotificationKind, lang: Lang, ctx: NotificationEmailContext): { subject: string; html: string } {
  const t = COPY[kind][lang];
  return { subject: t.subject, html: shell(lang, t.subject, t.heading, t.body(ctx), t.cta, ctx.url) };
}
