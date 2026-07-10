import { useTranslation } from "react-i18next";

/**
 * Shared photo gallery (012). Renders image refs as thumbnails with alt text derived from the item
 * name (FR-012). When `onRemove` is given (owner/admin), each thumb gets a remove button. Best-effort:
 * a broken/missing image simply doesn't render its tile.
 */
export function Gallery({
  images,
  itemName,
  onRemove,
}: {
  images: string[] | null | undefined;
  itemName: string;
  onRemove?: (ref: string) => void;
}) {
  const { t } = useTranslation();
  const refs = images ?? [];
  if (refs.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t("media.photos")}>
      {refs.map((ref, i) => (
        <li key={ref} className="relative">
          <img
            src={ref}
            alt={t("media.photoAlt", { name: itemName, n: i + 1 })}
            loading="lazy"
            className="h-24 w-24 rounded-lg border border-line object-cover"
          />
          {onRemove && (
            <button
              type="button"
              aria-label={t("media.remove")}
              className="absolute end-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-sm font-bold text-clay-ink shadow"
              onClick={() => onRemove(ref)}
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
