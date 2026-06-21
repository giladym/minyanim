import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ShabbatZmanim, ZmanimResponse } from "@minyanim/shared";

/** Format a "YYYY-MM-DD" Shabbat date as a localized civil date. */
function formatShabbatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "he-IL", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * Renders Shabbat zmanim (005). Opinion-aware Havdalah (`geonim` | `rabbeinu_tam` | `both`, D4);
 * shows a "cannot compute" note for polar/uncomputable Shabbatot and a Yom-Tov note when Havdalah
 * is deferred (D7/D2); coordless Stays render the `addLocationSlot` CTA (D6). RTL, i18n, tokens.
 */
export function ZmanimSection({
  data,
  isLoading,
  isError,
  havdalahOpinion,
  addLocationSlot,
}: {
  data: ZmanimResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  havdalahOpinion: string;
  /** Rendered (e.g. an edit link) when the Stay has no coordinates. */
  addLocationSlot?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "he";

  if (isLoading) return <p className="py-3 text-sm text-muted">{t("zmanim.loading")}</p>;
  if (isError || !data)
    return <p role="alert" className="py-3 text-sm text-clay-ink">{t("zmanim.loadError")}</p>;

  if (!data.coversShabbat) return null;
  if (!data.hasCoordinates) {
    return (
      <div className="rounded-xl bg-chip px-4 py-3 text-sm text-ink" aria-live="polite">
        <p className="mb-2">{t("zmanim.addLocation")}</p>
        {addLocationSlot}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {data.shabbatot.map((s) => (
        <ShabbatRow key={s.shabbatDate} z={s} locale={locale} opinion={havdalahOpinion} />
      ))}
    </div>
  );
}

function ShabbatRow({ z, locale, opinion }: { z: ShabbatZmanim; locale: string; opinion: string }) {
  const { t } = useTranslation();
  const uncomputable = z.note === "uncomputable" || z.candleLighting === null;

  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <p className="mb-1.5 text-sm font-extrabold text-ink">{formatShabbatDate(z.shabbatDate, locale)}</p>
      {uncomputable ? (
        <p className="text-sm text-muted">{t("zmanim.cannotCompute")}</p>
      ) : (
        <dl className="flex flex-col gap-1 text-sm">
          <Row label={t("zmanim.candleLighting")} value={z.candleLighting} />
          {z.note === "havdalah_yom_tov" ? (
            <p className="text-muted">{t("zmanim.yomTovNote")}</p>
          ) : opinion === "both" ? (
            <>
              <Row label={t("zmanim.havdalahGeonim")} value={z.havdalahGeonim} />
              <Row label={t("zmanim.havdalahRabbeinuTam")} value={z.havdalahRabbeinuTam} />
            </>
          ) : opinion === "rabbeinu_tam" ? (
            <Row label={t("zmanim.havdalah")} value={z.havdalahRabbeinuTam} />
          ) : (
            <Row label={t("zmanim.havdalah")} value={z.havdalahGeonim} />
          )}
        </dl>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold text-ink" dir="ltr">{value ?? "—"}</dd>
    </div>
  );
}
