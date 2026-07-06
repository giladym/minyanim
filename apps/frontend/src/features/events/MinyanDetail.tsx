import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, Link } from "@tanstack/react-router";
import type { RosterMinyanDTO, ParticipantMinyanDTO, OwnerMinyanDTO } from "@minyanim/shared";
import { ApiError } from "../../lib/api";
import type { EventRole, ParticipantInfo, PublicMinyanDTO } from "@minyanim/shared";
import { authClient } from "../../lib/auth-client";
import {
  useMinyan,
  useCancelMinyan,
  useUpdateMinyan,
  useCommit,
  useChangeCommitment,
  useWithdraw,
  useClaimRole,
  useReleaseRole,
  useFlagMinyan,
  type AnyMinyanDTO,
} from "../../lib/events";
import { useMinyanZmanim } from "../../lib/zmanim";
import { useProfile } from "../../lib/profile";
import { ZmanimSection } from "../stays/ZmanimSection";

/** Roster + contact are present for any signed-in viewer (roster/participant/owner tiers). */
function hasRoster(m: AnyMinyanDTO): m is RosterMinyanDTO | ParticipantMinyanDTO | OwnerMinyanDTO {
  return "participants" in m;
}
/** The private address + entry notes are present only for committed participants + the host. */
function hasPrivate(m: AnyMinyanDTO): m is ParticipantMinyanDTO | OwnerMinyanDTO {
  return "addressPrivate" in m;
}
function isOwner(m: AnyMinyanDTO): m is OwnerMinyanDTO {
  return (m as OwnerMinyanDTO).isHost === true;
}

/**
 * Build the WhatsApp share text from PUBLIC fields only — city/tefillot/count + join link, NEVER
 * the private address (SC-005/FR-012). Pure + exported so it's unit-testable.
 */
export function buildShareText(m: PublicMinyanDTO, joinUrl: string, tefillaLabel: (tf: string) => string): string {
  const tefillot = m.services.map((s) => tefillaLabel(s.tefilla) + (s.time ? ` ${s.time}` : "")).join(", ");
  return `${m.city}, ${m.country} · ${tefillot} · ${m.committedMen}/10\n${joinUrl}`;
}

export function whatsAppHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Role slots (US4): a committed participant claims/releases Ba'al Tefila / Ba'al Korei. Open slots
 * are clearly indicated; the viewer's own slots show a release action. */
function RolesSection({ id, m }: { id: string; m: ParticipantMinyanDTO | OwnerMinyanDTO }) {
  const { t } = useTranslation();
  const claim = useClaimRole(id);
  const release = useReleaseRole(id);
  const ROLES: EventRole[] = ["baal_tefila", "baal_korei"];
  const busy = claim.isPending || release.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-extrabold text-ink">{t("minyanDetail.rolesTitle")}</h2>
      {ROLES.map((role) => {
        const mine = m.myRoles[role === "baal_tefila" ? "baalTefila" : "baalKorei"];
        const filled = m.rolesFilled[role === "baal_tefila" ? "baalTefila" : "baalKorei"];
        return (
          <div key={role} className="flex items-center justify-between">
            <span className="font-semibold text-ink">{t(`roles.${role}`)}</span>
            {mine ? (
              <button type="button" className="text-sm font-bold text-clay-ink disabled:opacity-60" disabled={busy} onClick={() => release.mutate(role)}>
                {t("minyanDetail.release")}
              </button>
            ) : filled ? (
              <span className="text-sm text-muted">{t("minyanDetail.roleFilled")}</span>
            ) : (
              <button type="button" className="text-sm font-bold text-clay disabled:opacity-60" disabled={busy} onClick={() => claim.mutate(role)}>
                {t("minyanDetail.claim")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Commit / change / withdraw UI (US3). Host sees no commit UI (auto-committed). A signed-out
 * visitor who tries to join is routed through sign-in with a redirect back here (D13). */
function CommitSection({ id, m }: { id: string; m: AnyMinyanDTO }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [numMen, setNumMen] = useState(1);
  const [conflict, setConflict] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const commit = useCommit(id);
  const change = useChangeCommitment(id);
  const withdraw = useWithdraw(id);

  const { data: session } = authClient.useSession();
  if (isOwner(m)) return null; // host is auto-committed; uses host controls

  /** Clamp the party-size input to a valid 1–50 integer (no NaN/0/over-max reaching the server). */
  const clampMen = (v: string) => Math.min(50, Math.max(1, Math.floor(Number(v)) || 1));
  const codeMsg = (err: unknown) =>
    err instanceof ApiError && err.body.errors[0]?.code ? t(`errors.${err.body.errors[0].code}`) : t("auth.error");
  async function runChange() {
    setActionErr("");
    try { await change.mutateAsync(numMen); } catch (err) { setActionErr(codeMsg(err)); }
  }
  async function runWithdraw() {
    setActionErr("");
    try { await withdraw.mutateAsync(); } catch (err) { setActionErr(codeMsg(err)); }
  }

  const committed = hasPrivate(m); // participant view ⇒ already joined
  const fieldCls = "w-24 rounded-xl border border-line2 bg-surface px-3 py-2.5 text-ink outline-none focus:border-primary";

  // Signed-out visitor (e.g. arriving via a WhatsApp join link): show a sign-in CTA that returns
  // here after auth (D13/R11) — works for Google or email/password.
  if (!session && !committed) {
    return (
      <section className="mn-fadeup flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-extrabold text-ink">{t("commit.joinTitle")}</h2>
        <p className="text-sm text-muted">{t("commit.signInToJoin")}</p>
        <Link to="/sign-in" search={{ redirect: `/minyan/${id}` }} className="mt-1 self-start rounded-xl bg-primary px-6 py-3 font-extrabold text-on-primary">
          {t("commit.signIn")}
        </Link>
      </section>
    );
  }

  if (committed) {
    return (
      <section className="mn-fadeup rounded-2xl border-[1.5px] border-primary-container bg-primary-soft p-5">
        <p className="flex items-center gap-2.5 text-lg font-extrabold text-primary">
          <span className="mn-pop grid h-6 w-6 place-items-center rounded-full bg-primary text-sm text-on-primary">✓</span>
          {t("commit.youreIn")}
        </p>
        <p className="mt-1.5 text-xs text-muted">{t("minyanDetail.registeredExplain")}</p>
        <div className="mt-3 flex items-center gap-2">
          <input type="number" min={1} max={50} className={fieldCls} value={numMen} aria-label={t("commit.partySize")} onChange={(e) => setNumMen(clampMen(e.target.value))} />
          <button type="button" className="rounded-xl border border-primary-container px-4 py-2.5 font-bold text-primary disabled:opacity-60" disabled={change.isPending} onClick={() => void runChange()}>
            {t("commit.updateSize")}
          </button>
          <button type="button" className="rounded-xl px-3 py-2.5 font-bold text-clay-ink disabled:opacity-60" disabled={withdraw.isPending} onClick={() => void runWithdraw()}>
            {t("commit.withdraw")}
          </button>
        </div>
        {actionErr && <p role="alert" className="mt-2 text-sm font-semibold text-clay-ink">{actionErr}</p>}
      </section>
    );
  }

  async function join() {
    setActionErr("");
    try {
      const r = await commit.mutateAsync(numMen);
      setConflict(r.conflict);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        void navigate({ to: "/sign-in", search: { redirect: `/minyan/${id}` } });
      } else {
        setActionErr(codeMsg(err)); // duplicate / cancelled / completed / party-size — was silent
      }
    }
  }

  return (
    <section className="mn-fadeup flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-extrabold text-ink">{t("commit.joinTitle")}</h2>
      <p className="text-xs text-muted">{t("minyanDetail.registeredExplain")}</p>
      <div className="mt-1 flex items-center gap-2">
        <input type="number" min={1} max={50} className={fieldCls} value={numMen} aria-label={t("commit.partySize")} onChange={(e) => setNumMen(clampMen(e.target.value))} />
        <button type="button" className="rounded-xl bg-primary px-6 py-2.5 font-extrabold text-on-primary disabled:opacity-60" disabled={commit.isPending} onClick={join}>
          {t("commit.join")}
        </button>
      </div>
      {conflict && <p role="alert" className="text-sm font-semibold text-clay-ink">{t("commit.conflictWarning")}</p>}
      {actionErr && <p role="alert" className="text-sm font-semibold text-clay-ink">{actionErr}</p>}
    </section>
  );
}

/** Minyan detail page (US2). Server returns the viewer-appropriate shape; this renders public,
 * committed-participant (address + participants), and host (cancel / Sefer-Torah toggle) views. */
/** Phone (E.164) → bare digits for a wa.me deep link. */
function waDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Contact affordances for a co-participant — WhatsApp (primary), call, email. Committed-only data
 * (the backend never sends contact in the public projection); lets members coordinate the minyan. */
function ContactButtons({ p }: { p: ParticipantInfo }) {
  const { t } = useTranslation();
  const btn = "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold";
  if (!p.phone && !p.email) return <span className="text-xs text-faint">{t("minyanDetail.noContact")}</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {p.phone && (
        <a className={`${btn} bg-whatsapp text-on-whatsapp`} href={`https://wa.me/${waDigits(p.phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`${t("minyanDetail.contactWhatsapp")} — ${p.name}`}>
          {t("minyanDetail.contactWhatsapp")}
        </a>
      )}
      {p.phone && (
        <a className={`${btn} border border-line text-ink`} dir="ltr" href={`tel:${p.phone}`} aria-label={`${t("minyanDetail.contactCall")} — ${p.name}`}>
          {p.phone}
        </a>
      )}
      {p.email && (
        <a className={`${btn} border border-line text-ink`} href={`mailto:${p.email}`} aria-label={`${t("minyanDetail.contactEmail")} — ${p.name}`}>
          {t("minyanDetail.contactEmail")}
        </a>
      )}
    </div>
  );
}

/** The committed roster with per-person contact (host badged "organizer"; no buttons for yourself). */
function ParticipantRoster({ participants, viewerId }: { participants: ParticipantInfo[]; viewerId?: string }) {
  const { t } = useTranslation();
  const sorted = [...participants].sort((a, b) => Number(b.isHost) - Number(a.isHost));
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-extrabold text-ink">{t("minyanDetail.whoIsComing")}</h3>
      <ul className="flex flex-col gap-2.5">
        {sorted.map((p) => {
          const isSelf = p.userId === viewerId;
          return (
            <li key={p.userId} className="rounded-xl border border-line px-3.5 py-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="font-bold text-ink">
                  {p.name}
                  {p.isHost && <span className="ms-2 rounded-full bg-clay-soft px-2 py-0.5 text-xs font-bold text-clay-ink">{t("minyanDetail.organizer")}</span>}
                  {isSelf && <span className="ms-2 text-xs font-normal text-muted">({t("minyanDetail.you")})</span>}
                </span>
                <span className="text-xs text-muted">{t("stays.men", { count: p.numMen })}</span>
              </div>
              {/* Host contact lives in the prominent OrganizerCard above — don't repeat it here. */}
              {!isSelf && !p.isHost && <ContactButtons p={p} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The organizer, given prominence: who runs this minyan + how to reach them. Name shows for every
 * viewer (public tier); WhatsApp / call / email surface only once the viewer is signed in (roster
 * tier carries `hostContact`, phone gated on the host's share preference, email committed-only). */
function OrganizerCard({ m }: { m: AnyMinyanDTO }) {
  const { t } = useTranslation();
  const name = hasRoster(m) ? m.hostContact.name : m.hostName;
  const contact = hasRoster(m) ? m.hostContact : null;
  const initial = name.trim().charAt(0) || "?";
  const btn = "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold";
  return (
    <section className="mn-fadeup flex items-start gap-3.5 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-clay-soft text-lg font-extrabold text-clay-ink">{initial}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-clay-ink">{t("minyanDetail.hostTitle")}</span>
        <span className="text-lg font-extrabold text-ink">{name}</span>
        {contact && (contact.phone || contact.email) ? (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {contact.phone && (
              <a className={`${btn} bg-whatsapp text-on-whatsapp`} href={`https://wa.me/${waDigits(contact.phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`${t("minyanDetail.contactWhatsapp")} — ${name}`}>
                {t("minyanDetail.contactWhatsapp")}
              </a>
            )}
            {contact.phone && (
              <a className={`${btn} border border-line text-ink`} dir="ltr" href={`tel:${contact.phone}`} aria-label={`${t("minyanDetail.contactCall")} — ${name}`}>
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a className={`${btn} border border-line text-ink`} href={`mailto:${contact.email}`} aria-label={`${t("minyanDetail.contactEmail")} — ${name}`}>
                {t("minyanDetail.contactEmail")}
              </a>
            )}
          </div>
        ) : (
          !contact && <span className="text-xs text-muted">{t("commit.signInToJoin")}</span>
        )}
      </div>
    </section>
  );
}

export function MinyanDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams({ from: "/minyan/$id" });
  const { data: m, isLoading } = useMinyan(id);
  const { data: session } = authClient.useSession();
  const cancel = useCancelMinyan(id);
  const update = useUpdateMinyan(id);
  const { data: profile } = useProfile();
  // Shabbat zmanim only for a Saturday-dated minyan (UTC weekday = civil weekday by storage
  // convention); the endpoint also enforces this server-side (D9).
  const isShabbat = !!m && new Date(m.eventDate).getUTCDay() === 6;
  const zmanimQuery = useMinyanZmanim(id, isShabbat);

  // Animate the quorum progress bar from 0 → target on mount (transition on width).
  const pct = m ? Math.min(100, Math.round((m.committedMen / 10) * 100)) : 0;
  const [barW, setBarW] = useState(0);
  useEffect(() => {
    const r = requestAnimationFrame(() => setBarW(pct));
    return () => cancelAnimationFrame(r);
  }, [pct]);

  if (isLoading) return <p className="p-6 text-muted" dir="rtl">{t("discovery.loading")}</p>;
  if (!m) return <p className="p-6 text-muted" dir="rtl">{t("stays.loadError")}</p>;

  const tefillot = m.services.map((s) => t(`tefilla.${s.tefilla}`) + (s.time ? ` ${s.time}` : "")).join(" · ");
  const active = m.status !== "cancelled" && m.status !== "completed";
  const dateLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en-GB" : "he-IL", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(m.eventDate));
  // Readiness checklist: quorum always; Sefer Torah + Ba'al Korei only when it's a Torah-reading
  // Shabbat-Shacharit (otherwise they're not required).
  const ready = [
    { label: t("stays.men", { count: 10 }), ok: m.missingForReady.menShort === 0 },
    ...(m.isShabbatShacharit
      ? [
          { label: t("discovery.seferTorah"), ok: m.seferTorah },
          { label: t("roles.baal_korei"), ok: m.rolesFilled.baalKorei },
        ]
      : []),
  ];
  const secHead = "text-xs font-bold uppercase tracking-wide text-faint";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6" dir="rtl">
      <Link to="/discovery" className="text-sm font-bold text-clay-ink">{t("minyanDetail.back")}</Link>

      {/* HERO — place + live readiness (progress + what's missing). */}
      <section className="mn-fadeup relative overflow-hidden rounded-2xl bg-gradient-to-b from-primary to-primary-container p-5 text-on-primary shadow-card">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-ink" />
            {t(`minyanStatus.${m.status}`)}
          </span>
          <span className="text-xs opacity-85">{dateLabel}</span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-extrabold">{m.city}, {m.country}</h1>
        <p className="mt-1 text-sm opacity-90">{t(`nusach.${m.nusach}`)} · {tefillot}</p>
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-sm font-extrabold"><span>{t("minyanDetail.quorumLabel")}</span><span>{m.committedMen} / 10</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-primary-ink transition-[width] duration-700 ease-out" style={{ width: `${barW}%` }} />
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          {ready.map((r) => (
            <span key={r.label} className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold " + (r.ok ? "bg-white/15" : "mn-glow bg-surface text-clay-ink")}>
              {r.ok ? "✓" : "✗"} {r.label}
            </span>
          ))}
        </div>
        {m.notes && <p className="mt-3 text-sm opacity-90">{m.notes}</p>}
        <a
          href={whatsAppHref(buildShareText(m, `${window.location.origin}/minyan/${m.id}`, (tf) => t(`tefilla.${tf}`)))}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-sm font-bold text-primary"
        >
          {t("minyanDetail.shareWhatsApp")}
        </a>
      </section>

      {active && <CommitSection id={id} m={m} />}

      {!isOwner(m) && <OrganizerCard m={m} />}

      {hasPrivate(m) && active && <RolesSection id={id} m={m} />}

      {hasRoster(m) ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          {hasPrivate(m) ? (
            <>
              {m.addressPrivate && <p className="text-ink">{t("minyanDetail.address")}: {m.addressPrivate}</p>}
              {m.addressNotes && <p className="text-sm text-ink">{t("minyanDetail.addressNotes")}: {m.addressNotes}</p>}
            </>
          ) : (
            <p className="text-xs text-muted">{t("minyanDetail.joinToSeeAddress")}</p>
          )}
          <ParticipantRoster participants={m.participants} viewerId={session?.user?.id} />
        </section>
      ) : (
        <p className="text-xs text-muted">{t("minyanDetail.commitToSeeAddress")}</p>
      )}

      {isShabbat && (
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
          <h2 className={secHead}>{t("zmanim.title")}</h2>
          <ZmanimSection
            data={zmanimQuery.data}
            isLoading={zmanimQuery.isLoading}
            isError={zmanimQuery.isError}
            havdalahOpinion={profile?.havdalahOpinion ?? "geonim"}
          />
        </section>
      )}

      {isOwner(m) && m.status !== "cancelled" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-extrabold text-ink">{t("minyanDetail.hostControls")}</h2>
          <label className="flex min-h-[44px] items-center gap-3 text-ink">
            <input type="checkbox" className="h-5 w-5" checked={m.seferTorah} aria-label={t("host.seferTorah")} onChange={(e) => update.mutate({ seferTorah: e.target.checked })} />
            {t("host.seferTorah")}
          </label>
          <button
            type="button"
            className="self-start rounded-[14px] border border-clay px-4 py-2.5 font-bold text-clay disabled:opacity-60"
            disabled={cancel.isPending}
            onClick={() => { if (window.confirm(t("minyanDetail.cancelConfirm"))) cancel.mutate(); }}
          >
            {t("minyanDetail.cancel")}
          </button>
        </div>
      )}

      {!isOwner(m) && m.status !== "cancelled" && <FlagButton id={id} />}
    </div>
  );
}

/** Discreet "report" affordance (FR-017/D19). Idempotent server-side; the UI just acknowledges. */
function FlagButton({ id }: { id: string }) {
  const { t } = useTranslation();
  const flag = useFlagMinyan(id);
  return (
    <button
      type="button"
      className="self-start text-xs font-bold text-faint disabled:opacity-60"
      disabled={flag.isPending || flag.isSuccess}
      onClick={() => flag.mutate()}
    >
      {flag.isSuccess ? t("minyanDetail.flagged") : t("minyanDetail.flag")}
    </button>
  );
}
