import { useTranslation } from "react-i18next";
import type { PrayerNeeds as PrayerNeedsValue } from "@minyanim/shared";

/**
 * Prayer-needs editor. Shabbat tefillot are an always-on note (not user-toggled, D6); only the
 * weekday services (Shacharit / Mincha / Maariv) are selectable booleans applying to the whole
 * stay. The Shabbat note is shown only when the entered date range covers a Shabbat (FR-009/AS5).
 *
 * @param value Current prayer-needs selection.
 * @param onChange Called with the updated selection.
 * @param coversShabbat Whether the entered [arrival, departure] range overlaps a Fri/Sat.
 */
export function PrayerNeeds({
  value,
  onChange,
  coversShabbat = false,
}: {
  value: PrayerNeedsValue;
  onChange: (v: PrayerNeedsValue) => void;
  coversShabbat?: boolean;
}) {
  const { t } = useTranslation();
  const weekday = value.weekday;

  function toggle(key: keyof PrayerNeedsValue["weekday"]) {
    onChange({ weekday: { ...weekday, [key]: !weekday[key] } });
  }

  const rows: Array<{ key: keyof PrayerNeedsValue["weekday"]; label: string }> = [
    { key: "shacharit", label: t("stays.shacharit") },
    { key: "mincha", label: t("stays.mincha") },
    { key: "maariv", label: t("stays.maariv") },
  ];

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-bold text-ink">{t("stays.prayerNeedsTitle")}</legend>
      {coversShabbat && (
        <p className="text-sm font-semibold text-teal-ink">{t("stays.shabbatNote")}</p>
      )}
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <label key={r.key} className="flex min-h-[44px] items-center gap-3 text-ink">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={weekday[r.key]}
              aria-label={r.label}
              onChange={() => toggle(r.key)}
            />
            {r.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
