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
export function PhoneInput({ onChange, defaultIso = "IL", autoFocus = false }: { onChange: (e164: string) => void; defaultIso?: string; autoFocus?: boolean }) {
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

  // dir="ltr": phone numbers read left→right, so the row is always country (left) → number
  // (right), even on the RTL Hebrew page. min-w-0 lets the number field shrink instead of
  // overflowing the card on narrow screens.
  return (
    <div dir="ltr" className="flex min-w-0 flex-1 items-stretch gap-2">
      <select
        className={`${fieldCls} w-32 shrink-0 truncate`}
        value={iso}
        aria-label={t("profile.country")}
        onChange={(e) => { setIso(e.target.value); emit(e.target.value, national); }}
      >
        {countries.map((c) => (
          <option key={c.iso} value={c.iso}>+{c.dial} {c.name}</option>
        ))}
      </select>
      <input
        className={`${fieldCls} min-w-0 flex-1`}
        type="tel"
        inputMode="tel"
        // Intentional focus: the onboarding nudge lands the user here specifically to add a phone.
        autoFocus={autoFocus}
        value={national}
        aria-label={t("profile.phoneNumber")}
        placeholder={t("profile.phoneNumberPlaceholder")}
        onChange={(e) => { setNational(e.target.value); emit(iso, e.target.value); }}
      />
    </div>
  );
}
