import { useTranslation } from "react-i18next";
import type { FolderDTO } from "@minyanim/shared";
import { Icon } from "../../components/Icon";

/** The active folder filter: all Stays, one folder, or the virtual Unfiled group (D4). */
export type FolderFilterValue = "all" | "unfiled" | string;

const chip = (active: boolean) =>
  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-bold transition min-h-[36px] " +
  (active ? "bg-primary text-on-primary" : "bg-chip text-muted");

/**
 * Browse-by-folder filter for the dashboard (FR-004): All / each PINNED folder / Unfiled, in one
 * horizontally-scrolling row so it stays usable across years of trips (unpinned folders are still
 * reachable via "manage folders"). A trailing `⋮` opens folder management. Currently-selected
 * folder is shown even if unpinned, so the filter never appears to "lose" your selection.
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
  const shown = folders.filter((f) => f.pinned || f.id === value);
  return (
    <div className="flex items-center gap-2" role="group" aria-label={t("folders.filterLabel")}>
      <div className="flex flex-1 gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" className={chip(value === "all")} aria-pressed={value === "all"} onClick={() => onChange("all")}>
          {t("folders.all")}
        </button>
        {shown.map((f) => (
          <button key={f.id} type="button" className={chip(value === f.id)} aria-pressed={value === f.id} onClick={() => onChange(f.id)}>
            {f.name}
          </button>
        ))}
        <button type="button" className={chip(value === "unfiled")} aria-pressed={value === "unfiled"} onClick={() => onChange("unfiled")}>
          {t("folders.unfiled")}
        </button>
      </div>
      <button
        type="button"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-muted"
        aria-label={t("folders.manage")}
        onClick={onManage}
      >
        <Icon name="more" size={18} />
      </button>
    </div>
  );
}
