import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

interface Today {
  hebrew: { formatted_he: string };
  upcomingHoliday: { nameHe: string; nameEn: string; inDays: number } | null;
}

/** Header widget: current Hebrew date + upcoming-holiday chip. Degrades to nothing on error. */
export function HeaderCalendar() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Today | null>(null);

  useEffect(() => {
    const localDate = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the user's tz
    api<Today>(`/calendar/today?date=${localDate}`)
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  const he = i18n.resolvedLanguage === "he";
  const holiday = data.upcomingHoliday;

  return (
    <div data-testid="hebrew-date" className="hidden items-center gap-2 sm:flex">
      <span className="text-sm font-bold text-ink">{data.hebrew.formatted_he}</span>
      {holiday && (
        <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-bold text-gold">
          {(he ? holiday.nameHe : holiday.nameEn) + (holiday.inDays > 0 ? ` · ${t("calendar.inDays", { n: holiday.inDays })}` : "")}
        </span>
      )}
    </div>
  );
}
