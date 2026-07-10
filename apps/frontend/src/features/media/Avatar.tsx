import { useTranslation } from "react-i18next";

/** First letter of a name for the placeholder (falls back to a neutral glyph). */
function initial(name: string): string {
  const c = name.trim()[0];
  return c ? c.toUpperCase() : "·";
}

/**
 * User avatar (012). Renders the image when present, else a token-colored initials placeholder — so a
 * user with no photo never shows a broken image (FR-009). `size` is the pixel diameter.
 */
export function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const { t } = useTranslation();
  const style = { width: size, height: size } as const;
  if (src) {
    return (
      <img
        src={src}
        alt={t("media.avatarAlt", { name })}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full border border-line object-cover"
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-chip font-bold text-muted"
    >
      {initial(name)}
    </span>
  );
}
