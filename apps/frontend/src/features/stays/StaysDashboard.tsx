import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { useStays, useCancelStay, useUpdateStay } from "../../lib/stays";
import { useFolders } from "../../lib/folders";
import { useNearStayCounts } from "../../lib/discovery";
import { FolderFilter, type FolderFilterValue } from "../folders/FolderFilter";
import { FolderManager } from "../folders/FolderManager";
import { StayCard } from "./StayCard";

/**
 * My-Stays dashboard (US2 + 004 US1). Lists the caller's active Stays nearest-first, browsable by
 * folder (incl. an Unfiled group) or flat (FR-004). A just-saved/edited Stay is briefly highlighted.
 * Cancel is confirm-guarded; a per-card "move to folder" reassigns a Stay (D6).
 */
export function StaysDashboard() {
  const { t } = useTranslation();
  const { data: stays, isLoading, isError } = useStays();
  const { data: folders } = useFolders();
  const { data: nearbyCounts } = useNearStayCounts();
  const cancel = useCancelStay();
  const move = useUpdateStay();
  const search = useSearch({ from: "/authed/stays" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string>("");
  const [filter, setFilter] = useState<FolderFilterValue>("all");
  const [managing, setManaging] = useState(false);

  // Brief success message after a create/edit redirect; clears the highlight after a moment.
  useEffect(() => {
    if (search.flash) {
      setFlash(search.flash === "updated" ? t("stays.updated") : t("stays.saved"));
      const handle = setTimeout(() => setFlash(""), 3000);
      return () => clearTimeout(handle);
    }
  }, [search.flash, t]);

  const all = useMemo(() => stays ?? [], [stays]);
  const list = useMemo(() => {
    if (filter === "all") return all;
    if (filter === "unfiled") return all.filter((s) => s.folderId == null);
    return all.filter((s) => s.folderId === filter);
  }, [all, filter]);

  if (isLoading) {
    return <p className="py-20 text-center text-muted">{t("stays.loading")}</p>;
  }
  if (isError) {
    return <p role="alert" className="py-20 text-center text-clay-ink">{t("stays.loadError")}</p>;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">{t("stays.title")}</h1>
        <div className="flex items-center gap-3">
          <Link to="/stays/history" className="text-sm font-bold text-clay">
            {t("history.title")}
          </Link>
          {all.length > 0 && (
            <Link
              to="/stays/new"
              className="rounded-lg bg-clay px-4 py-2 text-sm font-extrabold text-on-clay"
            >
              {t("stays.addCta")}
            </Link>
          )}
        </div>
      </div>

      {all.length > 0 && (
        <FolderFilter
          folders={folders ?? []}
          value={filter}
          onChange={setFilter}
          onManage={() => setManaging(true)}
        />
      )}

      {flash && (
        <p role="status" className="rounded-xl bg-teal-soft px-4 py-3 text-sm font-bold text-teal-ink">
          {flash}
        </p>
      )}

      {all.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-16 text-center">
          <h2 className="text-xl font-extrabold text-ink">{t("stays.empty.title")}</h2>
          <p className="max-w-md text-muted">{t("stays.empty.body")}</p>
          <Link
            to="/stays/new"
            className="rounded-[14px] bg-clay px-6 py-3 font-extrabold text-on-clay"
          >
            {t("stays.addCta")}
          </Link>
        </section>
      ) : list.length === 0 ? (
        <p className="py-12 text-center text-muted">{t("folders.emptyGroup")}</p>
      ) : (
        <ul className="flex flex-col gap-4" aria-live="polite">
          {list.map((s) => (
            <li key={s.id}>
              <StayCard
                stay={s}
                highlighted={search.highlight === s.id}
                onCancel={setConfirmingId}
                onMove={(folderId) => move.mutate({ id: s.id, input: { folderId } })}
                folders={folders ?? []}
                nearbyMinyanim={nearbyCounts?.[s.id]}
              />
            </li>
          ))}
        </ul>
      )}

      {managing && <FolderManager onClose={() => setManaging(false)} />}

      {confirmingId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("stays.cancelTitle")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-2 text-lg font-extrabold text-clay-ink">{t("stays.cancelTitle")}</h2>
            <p className="mb-4 text-sm text-muted">{t("stays.cancelWarn")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-clay-ink px-4 py-2 text-sm font-extrabold text-on-clay"
                onClick={() => {
                  cancel.mutate(confirmingId);
                  setConfirmingId(null);
                }}
              >
                {t("stays.cancelConfirm")}
              </button>
              <button
                type="button"
                className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink"
                onClick={() => setConfirmingId(null)}
              >
                {t("stays.cancelDismiss")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
