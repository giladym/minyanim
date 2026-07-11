import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { LinkedMinyanDTO } from "@minyanim/shared";
import { useMinyan, useTransferHost } from "../../lib/events";

/**
 * 013 location-change guard. Shown when the user edits a Stay's location and minyanim are linked to
 * it. No silent cascade — the user chooses: duplicate to a new destination (keeps the originals),
 * reassign host then save (host-owned minyanim), keep the minyanim but unlink them, change anyway
 * (links preserved), or cancel. `onProceed` performs the actual Stay update; `unlink` asks it to
 * clear the links first.
 *
 * @param stayId The Stay being edited.
 * @param linked The minyanim linked to it (from useLinkedMinyanim).
 * @param onCancel Abort the edit (close the dialog, don't save).
 * @param onProceed Save the location change; when `unlink` is true, clear the links first.
 */
export function LocationChangeGuard({
  stayId,
  linked,
  onCancel,
  onProceed,
}: {
  stayId: string;
  linked: LinkedMinyanDTO[];
  onCancel: () => void;
  onProceed: (opts: { unlink: boolean }) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reassigning, setReassigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const hosted = linked.filter((m) => m.isHost);

  const btn = "w-full rounded-xl px-4 py-3 text-sm font-bold text-start transition";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={t("stays.guard.title")}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-card" dir="rtl">
        <div>
          <h2 className="font-display text-lg font-extrabold text-ink">{t("stays.guard.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("stays.guard.body", { count: linked.length })}</p>
        </div>

        <ul className="flex flex-col gap-1.5">
          {linked.map((m) => (
            <li key={m.eventId} className="flex items-center justify-between gap-2 rounded-xl bg-chip px-3 py-2 text-sm">
              <span className="font-bold text-ink">{m.city}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-muted">
                {m.isHost ? t("stays.guard.asHost") : t("stays.guard.asParticipant")}
              </span>
            </li>
          ))}
        </ul>

        {reassigning ? (
          <ReassignStep hosted={hosted} busy={busy} setBusy={setBusy} onDone={() => onProceed({ unlink: true })} onBack={() => setReassigning(false)} />
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={`${btn} bg-primary text-on-primary`}
              onClick={() => void navigate({ to: "/stays/new", search: { from: stayId } })}
            >
              {t("stays.guard.duplicate")}
            </button>
            {hosted.length > 0 && (
              <button type="button" disabled={busy} className={`${btn} border border-line2 text-ink disabled:opacity-60`} onClick={() => setReassigning(true)}>
                {t("stays.guard.reassign")}
              </button>
            )}
            <button type="button" disabled={busy} className={`${btn} border border-line2 text-ink disabled:opacity-60`} onClick={() => onProceed({ unlink: true })}>
              {t("stays.guard.unlink")}
            </button>
            <button type="button" disabled={busy} className={`${btn} border border-line2 text-ink disabled:opacity-60`} onClick={() => onProceed({ unlink: false })}>
              {t("stays.guard.changeAnyway")}
            </button>
            <button type="button" disabled={busy} className={`${btn} text-clay-ink`} onClick={onCancel}>
              {t("stays.guard.cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Reassign-host sub-step: pick a new host for each hosted minyan, then transfer + proceed. */
function ReassignStep({
  hosted,
  busy,
  setBusy,
  onDone,
  onBack,
}: {
  hosted: LinkedMinyanDTO[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const transfer = useTransferHost();
  const [picks, setPicks] = useState<Record<string, string>>({});
  const ready = hosted.every((m) => picks[m.eventId]);

  async function confirm() {
    setBusy(true);
    try {
      for (const m of hosted) {
        await transfer.mutateAsync({ eventId: m.eventId, newHostUserId: picks[m.eventId]! });
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {hosted.map((m) => (
        <HostedMinyanPicker key={m.eventId} eventId={m.eventId} city={m.city} value={picks[m.eventId] ?? ""} onPick={(uid) => setPicks((p) => ({ ...p, [m.eventId]: uid }))} />
      ))}
      <div className="flex gap-2">
        <button type="button" disabled={!ready || busy} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-on-primary disabled:opacity-60" onClick={() => void confirm()}>
          {t("stays.guard.reassignConfirm")}
        </button>
        <button type="button" disabled={busy} className="rounded-xl border border-line2 px-4 py-2.5 text-sm font-bold text-ink" onClick={onBack}>
          {t("stays.location.close")}
        </button>
      </div>
    </div>
  );
}

/** One hosted minyan's new-host picker (its committed participants, excluding the current host). */
function HostedMinyanPicker({ eventId, city, value, onPick }: { eventId: string; city: string; value: string; onPick: (uid: string) => void }) {
  const { t } = useTranslation();
  const { data: m } = useMinyan(eventId);
  const candidates = (m && "participants" in m ? m.participants : []).filter((p) => !p.isHost);
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink">{t("stays.guard.reassignPick", { city })}</span>
      {candidates.length === 0 ? (
        <span className="block text-xs text-clay-ink">{t("stays.guard.noParticipants")}</span>
      ) : (
        <select className="w-full rounded-xl border border-line2 bg-surface px-3 py-2.5 text-ink" value={value} aria-label={t("stays.guard.reassignPick", { city })} onChange={(e) => onPick(e.target.value)}>
          <option value="">—</option>
          {candidates.map((p) => (
            <option key={p.userId} value={p.userId}>{p.name}</option>
          ))}
        </select>
      )}
    </label>
  );
}
