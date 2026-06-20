import { useTranslation } from "react-i18next";
import { useParams, Link } from "@tanstack/react-router";
import type { MinyanStatus, ParticipantMinyanDTO, OwnerMinyanDTO } from "@minyanim/shared";
import { useMinyan, useCancelMinyan, useUpdateMinyan, type AnyMinyanDTO } from "../../lib/events";

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
      </div>

      {hasPrivate(m) ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-extrabold text-ink">{t("minyanDetail.details")}</h2>
          {m.addressPrivate && <p className="text-ink">{t("minyanDetail.address")}: {m.addressPrivate}</p>}
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
    </div>
  );
}
