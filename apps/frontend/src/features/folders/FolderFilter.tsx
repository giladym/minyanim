import { useTranslation } from "react-i18next";
import type { FolderDTO } from "@minyanim/shared";

/** The active folder filter: all Stays, one folder, or the virtual Unfiled group (D4). */
export type FolderFilterValue = "all" | "unfiled" | string;

const chip = (active: boolean) =>
  "rounded-full px-3.5 py-1.5 text-sm font-bold transition min-h-[36px] " +
  (active ? "bg-clay text-on-clay" : "bg-chip text-ink");

/**
 * Browse-by-folder filter chips for the dashboard (FR-004): All / each folder / Unfiled, plus a
 * "manage folders" affordance. Selection is owner-only; strings i18n, colors tokens-only.
 */
export function FolderFilter({
  folders,
  value,
  onChange,
  onManage,
}: {
  folders: FolderDTO[];
  value: FolderFilterValue;
  onChange: (v: FolderFilterValue) => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("folders.filterLabel")}>
      <button type="button" className={chip(value === "all")} aria-pressed={value === "all"} onClick={() => onChange("all")}>
        {t("folders.all")}
      </button>
      {folders.map((f) => (
        <button
          key={f.id}
          type="button"
          className={chip(value === f.id)}
          aria-pressed={value === f.id}
          onClick={() => onChange(f.id)}
        >
          {f.name}
        </button>
      ))}
      <button type="button" className={chip(value === "unfiled")} aria-pressed={value === "unfiled"} onClick={() => onChange("unfiled")}>
        {t("folders.unfiled")}
      </button>
      <button
        type="button"
        className="ms-auto rounded-full border border-line px-3.5 py-1.5 text-sm font-bold text-clay min-h-[36px]"
        onClick={onManage}
      >
        {t("folders.manage")}
      </button>
    </div>
  );
}
