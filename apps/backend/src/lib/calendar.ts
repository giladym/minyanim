import { JewishCalendar, HebrewDateFormatter } from "kosher-zmanim";

// Hebrew date + upcoming holiday, computed server-side (kosher-zmanim, LGPL — never shipped to
// the client; legal sign-off pending, research D7). Returns keyed/structured data + both he/en
// holiday names so the frontend localizes (no hard-coded UI strings).

const MONTH_KEYS = ["", "nisan", "iyar", "sivan", "tamuz", "av", "elul", "tishrei", "cheshvan", "kislev", "tevet", "shevat", "adar", "adar2"];

export interface CalendarToday {
  hebrew: { day: number; monthKey: string; year: number; formatted_he: string };
  gregorianDate: string;
  upcomingHoliday: { nameHe: string; nameEn: string; inDays: number } | null;
}

function fmt(hebrew: boolean): HebrewDateFormatter {
  const f = new HebrewDateFormatter();
  f.setHebrewFormat(hebrew);
  return f;
}

function holidayName(jc: JewishCalendar, he: HebrewDateFormatter, en: HebrewDateFormatter): { nameHe: string; nameEn: string } | null {
  if (jc.isYomTov() || jc.isChanukah()) {
    return { nameHe: he.formatYomTov(jc), nameEn: en.formatYomTov(jc) };
  }
  if (jc.isRoshChodesh()) {
    return { nameHe: `ראש חודש ${he.formatMonth(jc)}`, nameEn: `Rosh Chodesh ${en.formatMonth(jc)}` };
  }
  return null;
}

export function computeToday(now: Date): CalendarToday {
  const jc = new JewishCalendar(now);
  const he = fmt(true);
  const en = fmt(false);

  let upcoming: CalendarToday["upcomingHoliday"] = null;
  for (let i = 0; i <= 35; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + i);
    const n = holidayName(new JewishCalendar(d), he, en);
    if (n && n.nameHe) {
      upcoming = { ...n, inDays: i };
      break;
    }
  }

  return {
    hebrew: {
      day: jc.getJewishDayOfMonth(),
      monthKey: MONTH_KEYS[jc.getJewishMonth()] ?? "",
      year: jc.getJewishYear(),
      formatted_he: he.format(jc),
    },
    gregorianDate: now.toISOString().slice(0, 10),
    upcomingHoliday: upcoming,
  };
}
