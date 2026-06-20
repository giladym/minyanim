import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, Link } from "@tanstack/react-router";
import type { MinyanStatus, ParticipantMinyanDTO, OwnerMinyanDTO } from "@minyanim/shared";
import { ApiError } from "../../lib/api";
import type { EventRole, PublicMinyanDTO } from "@minyanim/shared";
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

const STATUS_CLS: Record<MinyanStatus, string> = {
  ready: "text-teal-ink",
  "quorum-reached": "text-teal-ink",
  forming: "text-clay-ink",
  completed: "text-muted",
  cancelled: "text-muted",
};

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
  const commit = useCommit(id);
  const change = useChangeCommitment(id);
  const withdraw = useWithdraw(id);

  const { data: session } = authClient.useSession();
  if (isOwner(m)) return null; // host is auto-committed; uses host controls

  const committed = hasPrivate(m); // participant view ⇒ already joined
  const fieldCls = "w-24 rounded-xl border border-line2 bg-surface px-3 py-2.5 text-ink outline-none focus:border-clay";

  // Signed-out visitor (e.g. arriving via a WhatsApp join link): show a sign-in CTA that returns
  // here after auth (D13/R11) — works for Google or email/password.
  if (!session && !committed) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink">{t("commit.signInToJoin")}</p>
        <Link to="/sign-in" search={{ redirect: `/minyan/${id}` }} className="self-start rounded-xl bg-clay px-5 py-2.5 font-extrabold text-on-clay">
          {t("commit.signIn")}
        </Link>
      </div>
    );
  }

  if (committed) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-extrabold text-ink">{t("commit.youreIn")}</h2>
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={50} className={fieldCls} value={numMen} aria-label={t("commit.partySize")} onChange={(e) => setNumMen(Number(e.target.value))} />
          <button type="button" className="rounded-xl border border-clay px-4 py-2.5 font-bold text-clay disabled:opacity-60" disabled={change.isPending} onClick={() => change.mutate(numMen)}>
            {t("commit.updateSize")}
          </button>
          <button type="button" className="rounded-xl px-3 py-2.5 font-bold text-clay-ink disabled:opacity-60" disabled={withdraw.isPending} onClick={() => withdraw.mutate()}>
            {t("commit.withdraw")}
          </button>
        </div>
      </div>
    );
  }

  async function join() {
    try {
      const r = await commit.mutateAsync(numMen);
      setConflict(r.conflict);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        void navigate({ to: "/sign-in", search: { redirect: `/minyan/${id}` } });
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-extrabold text-ink">{t("commit.joinTitle")}</h2>
      <div className="flex items-center gap-2">
        <input type="number" min={1} max={50} className={fieldCls} value={numMen} aria-label={t("commit.partySize")} onChange={(e) => setNumMen(Number(e.target.value))} />
        <button type="button" className="rounded-xl bg-clay px-5 py-2.5 font-extrabold text-on-clay disabled:opacity-60" disabled={commit.isPending} onClick={join}>
          {t("commit.join")}
        </button>
      </div>
      {conflict && <p role="alert" className="text-sm font-semibold text-clay-ink">{t("commit.conflictWarning")}</p>}
    </div>
  );
}

/** Minyan detail page (US2). Server returns the viewer-appropriate shape; this renders public,
 * committed-participant (address + participants), and host (cancel / Sefer-Torah toggle) views. */
export function MinyanDetail() {
  const { t } = useTranslation();
  const { id } = useParams({ from: "/minyan/$id" });
  const { data: m, isLoading } = useMinyan(id);
  const cancel = useCancelMinyan(id);
  const update = useUpdateMinyan(id);

  if (isLoading) return <p className="p-6 text-muted" dir="rtl">{t("discovery.loading")}</p>;
  if (!m) return <p className="p-6 text-muted" dir="rtl">{t("stays.loadError")}</p>;

  const tefillot = m.services.map((s) => t(`tefilla.${s.tefilla}`) + (s.time ? ` ${s.time}` : "")).join(" · ");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 p-6" dir="rtl">
      <Link to="/discovery" className="text-sm font-bold text-clay">{t("minyanDetail.back")}</Link>

      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-ink">{m.city}, {m.country}</h1>
          <span className={`text-sm font-bold ${STATUS_CLS[m.status]}`}>{t(`minyanStatus.${m.status}`)}</span>
        </div>
        <p className="text-ink">{t(`nusach.${m.nusach}`)} · {tefillot}</p>
        <p className="text-sm font-semibold text-ink">
          {t("discovery.committed", { count: m.committedMen })}
          {m.missingForReady.menShort > 0 && ` — ${t("discovery.moreNeeded", { count: m.missingForReady.menShort })}`}
        </p>
        {(m.missingForReady.seferTorah || m.missingForReady.baalKorei) && (
          <p className="text-sm text-clay-ink">
            {t("discovery.missing")}: {[m.missingForReady.seferTorah && t("discovery.seferTorah"), m.missingForReady.baalKorei && t("roles.baal_korei")].filter(Boolean).join(", ")}
          </p>
        )}
        {m.notes && <p className="text-sm text-muted">{m.notes}</p>}
        <a
          href={whatsAppHref(buildShareText(m, `${window.location.origin}/minyan/${m.id}`, (tf) => t(`tefilla.${tf}`)))}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 self-start rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white"
        >
          {t("minyanDetail.shareWhatsApp")}
        </a>
      </div>

      {m.status !== "cancelled" && m.status !== "completed" && <CommitSection id={id} m={m} />}

      {hasPrivate(m) && m.status !== "cancelled" && m.status !== "completed" && <RolesSection id={id} m={m} />}

      {hasPrivate(m) ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-extrabold text-ink">{t("minyanDetail.details")}</h2>
          {m.addressPrivate && <p className="text-ink">{t("minyanDetail.address")}: {m.addressPrivate}</p>}
          {m.addressNotes && <p className="text-sm text-ink">{t("minyanDetail.addressNotes")}: {m.addressNotes}</p>}
          <p className="text-sm text-muted">{t("minyanDetail.host")}: {m.hostContact.name}{m.hostContact.phone ? ` · ${m.hostContact.phone}` : ""}</p>
          <p className="text-sm text-muted">{t("minyanDetail.participants", { count: m.participants.length })}</p>
        </div>
      ) : (
        <p className="text-xs text-muted">{t("minyanDetail.commitToSeeAddress")}</p>
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
