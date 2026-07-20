import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  PARTY_SIZE_MAX,
  type HostingAttrs,
  type SocialAttrs,
  type AttendanceStatus,
} from "@minyanim/shared";
import { authClient } from "../../lib/auth-client";
import { ApiError } from "../../lib/api";
import {
  useRequestSeat,
  useChangePartySize,
  useCancelAttendance,
  useApproveRequest,
  useDeclineRequest,
  type AnyGatheringDTO,
} from "../../lib/events";
import { Avatar } from "../media/Avatar";
import { Gallery } from "../media/Gallery";
import { ImageUploader } from "../media/ImageUploader";
import { deleteImage } from "../../lib/media";
import { Icon } from "../../components/Icon";
import { useMinyanZmanim } from "../../lib/zmanim";
import { useProfile } from "../../lib/profile";
import { ZmanimSection } from "../stays/ZmanimSection";

// ── Tier predicates (gathering) ───────────────────────────────────────────────
type RosterG = Extract<AnyGatheringDTO, { hostContact: unknown }>;
type PrivateG = Extract<AnyGatheringDTO, { addressPrivate: unknown }>;
type OwnerG = Extract<AnyGatheringDTO, { isHost: true }>;

function isOwnerG(g: AnyGatheringDTO): g is OwnerG {
  return (g as OwnerG).isHost === true;
}
function hasPrivateG(g: AnyGatheringDTO): g is PrivateG {
  return "addressPrivate" in g;
}
function hasRosterG(g: AnyGatheringDTO): g is RosterG {
  return "hostContact" in g;
}
function myStatusOf(g: AnyGatheringDTO): AttendanceStatus | null {
  return "myStatus" in g ? (g as RosterG).myStatus : null;
}

function todayUtcMidnight(): number {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}
function waDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Address-free share text for any gathering (generalized from the minyan builder, FR-012). */
export function buildGatheringShareText(g: AnyGatheringDTO, title: string, joinUrl: string): string {
  return `${title} · ${g.city}, ${g.country}\n${joinUrl}`;
}

// ── Seats meter (aria-live) ───────────────────────────────────────────────────
/**
 * Capacity meter. The primary line is category-aware (hosting keeps the "seats at the table" seudah
 * framing; other gatherings use generic "spots open") and the bar/subline show REGISTERED-vs-capacity
 * so an empty event reads as empty (not a full green bar). Text + aria-live carry the state (never
 * colour/width alone) for WCAG-AA.
 */
function SeatsMeter({ g }: { g: AnyGatheringDTO }) {
  const { t } = useTranslation();
  if (g.capacity == null || g.seatsRemaining == null) return null;
  const capacity = g.capacity;
  const remaining = Math.max(0, Math.min(capacity, g.seatsRemaining));
  const taken = capacity - remaining;
  const fillPct = capacity > 0 ? Math.round((taken / capacity) * 100) : 0;
  const hosting = g.category === "hosting";
  const label =
    remaining === 0
      ? hosting ? t("hosting.seatsFull") : t("social.seatsFull")
      : hosting ? t("hosting.seatsLeft", { count: remaining }) : t("social.seatsLeft", { count: remaining });
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-extrabold" aria-live="polite">{label}</span>
        <span className="text-xs opacity-85">{t("rsvp.seatsTaken", { registered: taken, capacity })}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-on-primary transition-[width] duration-700 ease-out" style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  );
}

// ── RSVP band (Screen-4 state matrix) ─────────────────────────────────────────
function RsvpBand({ id, g }: { id: string; g: AnyGatheringDTO }) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const [partySize, setPartySize] = useState(1);
  const [actionErr, setActionErr] = useState("");
  const request = useRequestSeat(id);
  const change = useChangePartySize(id);
  const cancel = useCancelAttendance(id);

  if (isOwnerG(g)) return null; // host uses the RequestsPanel, not the RSVP band

  const clamp = (v: string) => Math.min(PARTY_SIZE_MAX, Math.max(1, Math.floor(Number(v)) || 1));
  const codeMsg = (err: unknown) =>
    err instanceof ApiError && err.body.errors[0]?.code ? t(`errors.${err.body.errors[0].code}`) : t("auth.error");
  const run = async (fn: () => Promise<unknown>) => {
    setActionErr("");
    try {
      await fn();
    } catch (err) {
      setActionErr(codeMsg(err));
    }
  };

  const isApproval = g.rsvpMode === "approval";
  const myStatus = myStatusOf(g);
  const eventPassed = g.eventDate < todayUtcMidnight();
  const closed = g.rsvpState === "closed";
  const full = g.seatsRemaining != null && g.seatsRemaining <= 0;

  const sizeStepper = (
    <input
      type="number"
      min={1}
      max={PARTY_SIZE_MAX}
      className="w-20 rounded-xl border border-line2 bg-surface px-3 py-2.5 text-ink outline-none focus:border-primary"
      value={partySize}
      aria-label={t("rsvp.partySize")}
      onChange={(e) => setPartySize(clamp(e.target.value))}
    />
  );
  const errNode = actionErr ? <p role="alert" className="mt-2 text-sm font-semibold text-clay-ink">{actionErr}</p> : null;

  const band = (cls: string, body: React.ReactNode) => (
    <section role="status" aria-live="polite" className={`mn-fadeup flex flex-col gap-2 rounded-2xl p-5 ${cls}`}>
      {body}
    </section>
  );

  // Cancelled — any kind.
  if (g.status === "cancelled") {
    return band("border border-line bg-chip", (
      <>
        <p className="font-extrabold text-muted">{t("rsvp.cancelledTitle")}</p>
        <Link to="/discovery" search={{ lat: g.lat, lng: g.lng, city: g.city, country: g.country }} className="self-start text-sm font-bold text-clay-ink">
          {t("rsvp.findOtherArea")}
        </Link>
      </>
    ));
  }

  // Terminal: completed or the event date has passed.
  if (g.status === "completed" || eventPassed) {
    return band("border border-line bg-chip", <p className="font-bold text-muted">{t("rsvp.closedPassed")}</p>);
  }

  // Signed-out visitor.
  if (!session && !myStatus) {
    return band("border border-line bg-surface", (
      <>
        <p className="text-sm text-muted">{isApproval ? t("rsvp.signInToRequest") : t("rsvp.signInToJoin")}</p>
        <Link to="/sign-in" search={{ redirect: `/event/${id}` }} className="mt-1 self-start rounded-xl bg-primary px-6 py-3 font-extrabold text-on-primary">
          {t("commit.signIn")}
        </Link>
      </>
    ));
  }

  if (myStatus === "confirmed") {
    return band("border-[1.5px] border-primary-container bg-primary-soft", (
      <>
        <p className="flex items-center gap-2.5 text-lg font-extrabold text-primary">
          <span className="mn-pop grid h-6 w-6 place-items-center rounded-full bg-primary text-sm text-on-primary">✓</span>
          {g.category === "hosting" ? t("rsvp.confirmedHosting") : t("rsvp.confirmed")}
        </p>
        <div className="mt-2 flex items-center gap-2">
          {hostUserId(g) && (
            <Link to="/messages/$userId" params={{ userId: hostUserId(g) }} className="rounded-xl bg-primary-soft px-4 py-2.5 font-bold text-primary-ink">
              {t("rsvp.messageHost")}
            </Link>
          )}
          <button type="button" className="rounded-xl px-3 py-2.5 font-bold text-clay-ink disabled:opacity-60" disabled={cancel.isPending} onClick={() => void run(() => cancel.mutateAsync())}>
            {t("rsvp.cancelAttendance")}
          </button>
        </div>
        {errNode}
      </>
    ));
  }

  if (myStatus === "pending") {
    const copy = closed ? t("rsvp.pendingClosed") : full ? t("rsvp.pendingFull") : t("rsvp.pending");
    return band("border border-gold bg-gold-soft", (
      <>
        <p className="font-extrabold text-ink">{t("rsvp.pendingTitle")}</p>
        <p className="text-sm text-muted">{copy}</p>
        {full && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm font-bold text-ink">{t("rsvp.reduceToFit", { count: Math.max(0, g.seatsRemaining ?? 0) })}</span>
            {sizeStepper}
            <button type="button" className="rounded-xl border border-line2 px-4 py-2.5 font-bold text-ink disabled:opacity-60" disabled={change.isPending} onClick={() => void run(() => change.mutateAsync(partySize))}>
              {t("commit.updateSize")}
            </button>
          </div>
        )}
        <button type="button" className="mt-1 self-start rounded-xl px-3 py-2.5 font-bold text-clay-ink disabled:opacity-60" disabled={cancel.isPending} onClick={() => void run(() => cancel.mutateAsync())}>
          {t("rsvp.cancelRequest")}
        </button>
        {errNode}
      </>
    ));
  }

  if (myStatus === "waitlisted") {
    return band("border border-sky bg-sky-soft", (
      <>
        <p className="font-extrabold text-sky-ink">{t("rsvp.waitlisted")}</p>
        <button type="button" className="mt-1 self-start rounded-xl px-3 py-2.5 font-bold text-clay-ink disabled:opacity-60" disabled={cancel.isPending} onClick={() => void run(() => cancel.mutateAsync())}>
          {t("rsvp.leaveWaitlist")}
        </button>
        {errNode}
      </>
    ));
  }

  if (myStatus === "declined") {
    return band("border border-line bg-chip", (
      <>
        <p className="font-bold text-muted">{t("rsvp.declined")}</p>
        <Link to="/discovery" search={{ lat: g.lat, lng: g.lng, city: g.city, country: g.country }} className="self-start text-sm font-bold text-clay-ink">
          {t("rsvp.findOther")}
        </Link>
      </>
    ));
  }

  // No active attendance (null or a prior cancelled row) + signed in.
  if (closed) {
    return band("border border-line bg-chip", <p className="font-bold text-muted">{t("rsvp.closed")}</p>);
  }

  // Request / join CTA.
  const cta = isApproval
    ? { label: t("rsvp.requestSeat"), cls: "bg-primary text-on-primary" }
    : full
      ? { label: t("rsvp.joinWaitlist"), cls: "bg-primary-container text-on-primary" }
      : { label: t("rsvp.imComing"), cls: "bg-primary text-on-primary" };

  return band("border border-line bg-surface", (
    <>
      <h2 className="font-extrabold text-ink">{isApproval ? t("rsvp.requestSeat") : t("rsvp.imComing")}</h2>
      <div className="mt-1 flex items-center gap-2">
        {sizeStepper}
        <button
          type="button"
          className={`rounded-xl px-6 py-2.5 font-extrabold disabled:opacity-60 ${cta.cls}`}
          disabled={request.isPending}
          onClick={() => void run(() => request.mutateAsync({ partySize }))}
        >
          {cta.label}
        </button>
      </div>
      {errNode}
    </>
  ));
}

/** The confirmed host's userId (for the "Message host" link). Owner tier lists themselves as host
 * in `attendees`; for a confirmed guest the host is in the roster too. Falls back to "". */
function hostUserId(g: AnyGatheringDTO): string {
  if ("attendees" in g && Array.isArray((g as RosterG).attendees)) {
    const host = (g as RosterG).attendees!.find((a) => a.isHost);
    if (host) return host.userId;
  }
  return "";
}

// ── Host requests / approvals panel (Screen 5) ────────────────────────────────
function RequestsPanel({ id, g }: { id: string; g: OwnerG }) {
  const { t } = useTranslation();
  const approve = useApproveRequest(id);
  const decline = useDeclineRequest(id);
  const busy = approve.isPending || decline.isPending;
  const seats = g.seatsRemaining;
  const pending = g.pendingRequests ?? [];
  const confirmed = (g.attendees ?? []).filter((a) => !a.isHost);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-extrabold text-ink">{t("requests.title")}</h2>
      {pending.length === 0 ? (
        <p className="text-sm text-muted">{t("requests.none")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((r) => {
            const wontFit = seats != null && r.partySize > seats;
            return (
              <li key={r.attendanceId} className="rounded-xl border border-line px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-bold text-ink">
                    <Avatar src={r.image} name={r.name} size={28} />
                    {r.name}
                  </span>
                  <span className="text-xs text-muted">{t("requests.party", { count: r.partySize })}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="min-h-[44px] rounded-xl bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-50"
                    disabled={busy || wontFit}
                    title={wontFit ? t("requests.cantFit") : undefined}
                    aria-label={t("requests.approveNamed", { name: r.name })}
                    onClick={() => approve.mutate(r.attendanceId)}
                  >
                    {t("requests.approve")}
                  </button>
                  <button
                    type="button"
                    className="min-h-[44px] rounded-xl border border-line2 px-4 py-2 font-bold text-clay-ink disabled:opacity-60"
                    disabled={busy}
                    aria-label={t("requests.declineNamed", { name: r.name })}
                    onClick={() => decline.mutate(r.attendanceId)}
                  >
                    {t("requests.decline")}
                  </button>
                  {r.phone && (
                    <a className="min-h-[44px] rounded-xl bg-whatsapp px-3 py-2 text-sm font-bold text-on-whatsapp" href={`https://wa.me/${waDigits(r.phone)}`} target="_blank" rel="noopener noreferrer">
                      {t("minyanDetail.contactWhatsapp")}
                    </a>
                  )}
                  <Link to="/messages/$userId" params={{ userId: r.userId }} className="min-h-[44px] rounded-xl border border-line px-3 py-2 text-sm font-bold text-ink">
                    {t("requests.message")}
                  </Link>
                </div>
                {wontFit && <p className="mt-1.5 text-xs font-semibold text-clay-ink">{t("requests.cantFit")}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <h3 className="mb-2 text-sm font-extrabold text-ink">{t("requests.confirmedTitle")}</h3>
        {confirmed.length === 0 ? (
          <p className="text-sm text-muted">{t("hosting.guestsConfirmed", { count: 0 })}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {confirmed.map((a) => (
              <li key={a.userId} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5">
                <span className="flex items-center gap-2 font-bold text-ink">
                  <Avatar src={a.image} name={a.name} size={24} />
                  {a.name}
                </span>
                <span className="text-xs text-muted">{t("requests.party", { count: a.numMen })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── Seudah / gathering facts ──────────────────────────────────────────────────
function GatheringFacts({ g }: { g: AnyGatheringDTO }) {
  const { t } = useTranslation();
  const secHead = "text-xs font-bold uppercase tracking-wide text-faint";
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-sm font-bold text-ink">{label}</span>
      <span className="text-sm text-muted">{value}</span>
    </div>
  );

  if (g.category === "hosting") {
    const a = g.attrs as HostingAttrs;
    return (
      <section className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-5">
        <h2 className={secHead}>{t("hosting.facts")}</h2>
        {row(t("hosting.mealTypeLabel"), t(`hosting.mealType.${a.mealType}`))}
        {row(t("hosting.kashrutLabel"), t(`hosting.kashrut.${a.kashrut}`))}
        {a.dietary.length > 0 &&
          row(
            t("hosting.dietaryLabel"),
            <span className="flex flex-wrap justify-end gap-1.5">
              {a.dietary.map((d) => (
                <span key={d} className="rounded-full bg-chip px-2 py-0.5 text-xs font-bold text-muted">
                  {t(`hosting.dietary.${d}`, { defaultValue: d })}
                </span>
              ))}
            </span>,
          )}
        {a.offering && row(t("hosting.offeringLabel"), a.offering)}
        {a.bringItems && row(t("hosting.bringLabel"), a.bringItems)}
        {a.accessibility && row(t("hosting.accessibilityLabel"), a.accessibility)}
      </section>
    );
  }
  const a = g.attrs as SocialAttrs;
  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-5">
      <h2 className={secHead}>{t("social.facts")}</h2>
      {row(t("social.subcategoryLabel"), t(`social.subcategory.${a.subcategory}`))}
    </section>
  );
}

// ── Photos ────────────────────────────────────────────────────────────────────
function GatheringPhotos({ id, g }: { id: string; g: AnyGatheringDTO }) {
  const { t } = useTranslation();
  const owner = isOwnerG(g);
  const [refs, setRefs] = useState<string[]>(g.images ?? []);
  if (!owner && refs.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <span className="text-xs font-bold uppercase tracking-wide text-faint">{t("media.photos")}</span>
      {owner && <p className="-mt-1 text-xs text-muted">{t("gatheringOwner.photosHint")}</p>}
      <Gallery
        images={refs}
        itemName={g.title ?? g.city}
        onRemove={owner ? (ref) => { void deleteImage(ref); setRefs((xs) => xs.filter((r) => r !== ref)); } : undefined}
      />
      {owner && <ImageUploader kind="event" parentId={id} onUploaded={(ref) => setRefs((xs) => [...xs, ref])} />}
    </section>
  );
}

// ── Address (tiered) ──────────────────────────────────────────────────────────
function GatheringAddress({ g }: { g: AnyGatheringDTO }) {
  const { t } = useTranslation();
  if (hasPrivateG(g)) {
    // A confirmed viewer / the owner: show the exact address only when there is content — an empty
    // bordered card read as a bug. For the owner with nothing set, offer a purposeful "add address"
    // hint; other confirmed viewers with no address see nothing.
    if (g.addressPrivate || g.addressNotes) {
      return (
        <section className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-5">
          {g.addressPrivate && <p className="text-ink">{t("minyanDetail.address")}: {g.addressPrivate}</p>}
          {g.addressNotes && <p className="text-sm text-ink">{t("minyanDetail.addressNotes")}: {g.addressNotes}</p>}
        </section>
      );
    }
    if (isOwnerG(g)) {
      return (
        <Link
          to="/event/$id/edit"
          params={{ id: g.id }}
          className="flex items-center gap-2 rounded-2xl border border-dashed border-line2 bg-surface p-5 text-sm font-bold text-clay-ink"
        >
          <Icon name="add" size={16} />
          {t("gatheringOwner.addAddress")}
        </Link>
      );
    }
    return null;
  }
  return (
    <p className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-5 text-xs text-muted">
      <Icon name="check" size={14} />
      {t("rsvp.addressLockHint")}
    </p>
  );
}

// ── Owner framing band (Screen-4 host affordance) ─────────────────────────────
/** A compact "this is your event" band for the host of an OPEN gathering — otherwise the page has no
 * RSVP band (owner) and no RequestsPanel (open mode) and reads as sparse. One tasteful band with an
 * edit/manage action; a pending-requests hint surfaces when the owner has an approval queue. */
function OwnerBand({ g }: { g: OwnerG }) {
  const { t } = useTranslation();
  return (
    <section className="mn-fadeup flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-primary-container bg-primary-soft p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-extrabold text-primary">{t("gatheringOwner.yourEvent")}</span>
        <span className="text-xs text-muted">{t("gatheringOwner.yourEventHint")}</span>
      </div>
      <Link to="/event/$id/edit" params={{ id: g.id }} className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-on-primary">
        {t("gatheringOwner.edit")}
      </Link>
    </section>
  );
}

// ── Confirmed-guests summary (privacy-aware) ──────────────────────────────────
function GuestsSummary({ g }: { g: AnyGatheringDTO }) {
  const { t } = useTranslation();
  // Hosting: a non-confirmed viewer sees only the aggregate count (A8). Confirmed viewers see it too;
  // the host's named list lives in the RequestsPanel.
  if (g.category === "hosting") {
    const named = "attendees" in g ? (g as RosterG).attendees : null;
    if (!named) {
      return <p className="rounded-2xl border border-line bg-surface p-5 text-sm font-bold text-ink">{t("hosting.guestsConfirmed", { count: g.confirmedCount })}</p>;
    }
    const guests = named.filter((a) => !a.isHost);
    if (guests.length === 0) return null;
    return (
      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-sm font-extrabold text-ink">{t("hosting.guestsConfirmed", { count: guests.length })}</h3>
        <ul className="flex flex-col gap-2">
          {guests.map((a) => (
            <li key={a.userId} className="flex items-center gap-2 font-bold text-ink">
              <Avatar src={a.image} name={a.name} size={24} /> {a.name}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  // Social gatherings keep an open roster (like a minyan).
  const named = "attendees" in g ? (g as RosterG).attendees : null;
  if (!named || named.filter((a) => !a.isHost).length === 0) return null;
  const guests = named.filter((a) => !a.isHost);
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
      <h3 className="text-sm font-extrabold text-ink">{t("minyanDetail.whoIsComing")}</h3>
      <ul className="flex flex-col gap-2">
        {guests.map((a) => (
          <li key={a.userId} className="flex items-center gap-2 font-bold text-ink">
            <Avatar src={a.image} name={a.name} size={24} /> {a.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Shabbat zmanim (hosting + occasion=shabbat) — reuses the server-side event zmanim (005/T046) ──
function ShabbatZmanim({ id, g }: { id: string; g: AnyGatheringDTO }) {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  // Only a hosting seudah on Shabbat carries candle-lighting/Havdalah (festivals are out of v1). The
  // server computes the correct Shabbat for a Friday-eve dinner or a Saturday lunch (the zmanim
  // library stays server-only — ADR 0007).
  const enabled = g.category === "hosting" && g.occasion === "shabbat";
  const q = useMinyanZmanim(id, enabled);
  if (!enabled) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-xs font-bold uppercase tracking-wide text-faint">{t("zmanim.title")}</h2>
      <ZmanimSection
        data={q.data}
        isLoading={q.isLoading}
        isError={q.isError}
        havdalahOpinion={profile?.havdalahOpinion ?? "geonim"}
      />
    </section>
  );
}

// ── Organizer card ─────────────────────────────────────────────────────────────
function GatheringOrganizer({ g }: { g: AnyGatheringDTO }) {
  const { t } = useTranslation();
  const name = hasRosterG(g) ? g.hostContact.name : g.hostName;
  const contact = hasRosterG(g) ? g.hostContact : null;
  const btn = "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold";
  return (
    <section className="mn-fadeup flex items-start gap-3.5 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <Avatar src={g.hostImage} name={name} size={44} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-clay-ink">{t("minyanDetail.hostTitle")}</span>
        <span className="text-lg font-extrabold text-ink">{name}</span>
        {contact && contact.phone && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            <a className={`${btn} bg-whatsapp text-on-whatsapp`} href={`https://wa.me/${waDigits(contact.phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`${t("minyanDetail.contactWhatsapp")} — ${name}`}>
              {t("minyanDetail.contactWhatsapp")}
            </a>
            <a className={`${btn} border border-line text-ink`} dir="ltr" href={`tel:${contact.phone}`} aria-label={`${t("minyanDetail.contactCall")} — ${name}`}>
              {contact.phone}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

/** Copy-link confirmation shown after publishing an unlisted event (Screen 3). */
function UnlistedNotice() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return (
    <section role="status" className="mn-fadeup flex flex-col gap-2 rounded-2xl border border-gold bg-gold-soft p-5">
      <p className="text-sm font-bold text-ink">{t("rsvp.unlistedNotice")}</p>
      <button
        type="button"
        className="self-start rounded-xl border border-line2 bg-surface px-4 py-2 text-sm font-bold text-ink"
        onClick={() => { void navigator.clipboard?.writeText(url).then(() => setCopied(true)); }}
      >
        {copied ? t("rsvp.copied") : t("rsvp.copyLink")}
      </button>
    </section>
  );
}

/**
 * Gathering detail (014, T028). A green hero shared with the minyan branch, then a kind-driven body:
 * seats meter + seudah/gathering facts + tiered address + kind-aware RSVP band (+ host RequestsPanel).
 */
export function GatheringDetail({ id, g, justPublished }: { id: string; g: AnyGatheringDTO; justPublished?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const kind = g.category === "hosting" ? "hosting" : "social";
  const badgeChip = kind === "hosting" ? "bg-clay-soft text-clay-ink" : "bg-sky-soft text-sky-ink";
  const badgeLabel = kind === "hosting" ? t("eventKind.hostingChip") : t("eventKind.social");
  const badgeIcon = kind === "hosting" ? "utensils" : "sparkles";
  const active = g.status !== "cancelled" && g.status !== "completed";
  const title = g.title ?? (kind === "hosting" ? t("eventKind.hosting") : t("eventKind.social"));
  const dateLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en-GB" : "he-IL", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(g.eventDate));
  const timeLabel = g.startTime ? (g.endTime ? `${g.startTime}–${g.endTime}` : g.startTime) : null;
  const shareText = buildGatheringShareText(g, title, `${window.location.origin}/event/${g.id}`);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6" dir="rtl">
      <button type="button" onClick={() => navigate({ to: "/discovery" })} className="self-start text-sm font-bold text-clay-ink">
        {t("minyanDetail.back")}
      </button>

      {/* HERO */}
      <section className="mn-fadeup relative overflow-hidden rounded-2xl bg-gradient-to-b from-primary to-primary-container p-5 text-on-primary shadow-card">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${badgeChip}`}>
            <Icon name={badgeIcon} size={13} /> {badgeLabel}
          </span>
          <span className="text-xs opacity-85">{dateLabel}{timeLabel ? ` · ${timeLabel}` : ""}</span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-extrabold">{title}</h1>
        <p className="mt-1 text-sm opacity-90">
          {g.city}, {g.country}
          {g.occasion && g.occasion !== "none" ? ` · ${t(`occasion.${g.occasion}`)}` : ""}
        </p>
        <SeatsMeter g={g} />
        {g.notes && <p className="mt-3 text-sm opacity-90">{g.notes}</p>}
        <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-sm font-bold text-primary">
          {t("rsvp.shareWhatsApp")}
        </a>
      </section>

      {justPublished && g.visibility === "unlisted" && <UnlistedNotice />}

      {isOwnerG(g) && active && <OwnerBand g={g} />}

      {active && !isOwnerG(g) && <RsvpBand id={id} g={g} />}

      {isOwnerG(g) && active && g.rsvpMode === "approval" && <RequestsPanel id={id} g={g} />}

      <GatheringFacts g={g} />

      <ShabbatZmanim id={id} g={g} />

      <GatheringAddress g={g} />

      <GuestsSummary g={g} />

      <GatheringPhotos id={id} g={g} />

      {!isOwnerG(g) && <GatheringOrganizer g={g} />}
    </div>
  );
}
