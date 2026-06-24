import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/** Curated country → international dial code list (common Jewish-travel destinations + majors).
 * Names are localized at render via Intl.DisplayNames, so no manual translation is needed. */
const DIALS: ReadonlyArray<readonly [iso: string, dial: string]> = [
  ["IL", "972"], ["US", "1"], ["GB", "44"], ["FR", "33"], ["CA", "1"], ["AU", "61"],
  ["DE", "49"], ["BE", "32"], ["NL", "31"], ["CH", "41"], ["IT", "39"], ["ES", "34"],
  ["AT", "43"], ["PL", "48"], ["HU", "36"], ["CZ", "420"], ["UA", "380"], ["RU", "7"],
  ["AR", "54"], ["BR", "55"], ["MX", "52"], ["ZA", "27"], ["PA", "507"], ["TH", "66"],
  ["IN", "91"], ["GR", "30"], ["PT", "351"], ["SE", "46"], ["NO", "47"], ["DK", "45"],
  ["IE", "353"], ["NZ", "64"], ["TR", "90"], ["GE", "995"], ["MA", "212"], ["UY", "598"],
];

const fieldCls = "rounded-lg border border-line2 bg-surface px-3 py-2.5 text-ink";

/** Strip a national number to digits and drop the trunk "0" (e.g. IL 054… / UK 07…). */
function nationalDigits(input: string): string {
  return input.replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * International phone entry: a country dropdown (dial code) + a national number, combined into a
 * valid E.164 string emitted via `onChange`. Users type their everyday local number ("0541234567")
 * and pick a country — no need to hand-type "+972". Defaults to Israel (the primary audience).
 */
export function PhoneInput({ onChange, defaultIso = "IL" }: { onChange: (e164: string) => void; defaultIso?: string }) {
  const { t, i18n } = useTranslation();
  const [iso, setIso] = useState(defaultIso);
  const [national, setNational] = useState("");
  const locale = i18n.resolvedLanguage ?? "he";

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return DIALS.map(([c, d]) => ({ iso: c, dial: d, name: names.of(c) ?? c })).sort((a, b) =>
      a.name.localeCompare(b.name, locale),
    );
  }, [locale]);

  function emit(nextIso: string, nextNational: string) {
    const dial = DIALS.find(([c]) => c === nextIso)?.[1] ?? "972";
    const digits = nationalDigits(nextNational);
    onChange(digits ? `+${dial}${digits}` : "");
  }

  return (
    <div className="flex flex-1 gap-2">
      <select
        className={`${fieldCls} max-w-[9rem] flex-shrink-0`}
        value={iso}
        aria-label={t("profile.country")}
        onChange={(e) => { setIso(e.target.value); emit(e.target.value, national); }}
      >
        {countries.map((c) => (
          <option key={c.iso} value={c.iso}>{c.name} (+{c.dial})</option>
        ))}
      </select>
      <input
        className={`${fieldCls} flex-1`}
        type="tel"
        inputMode="tel"
        dir="ltr"
        value={national}
        aria-label={t("profile.phoneNumber")}
        placeholder={t("profile.phoneNumberPlaceholder")}
        onChange={(e) => { setNational(e.target.value); emit(iso, e.target.value); }}
      />
    </div>
  );
}
