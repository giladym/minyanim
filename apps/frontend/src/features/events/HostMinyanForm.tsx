import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CreateEventInput, type Nusach, type Tefilla } from "@minyanim/shared";
import { LocationPicker, type LocationValue } from "../stays/LocationPicker";
import { useHostMinyan } from "../../lib/events";
import { getStay } from "../../lib/stays";
import { ApiError } from "../../lib/api";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The first Saturday (UTC civil weekday 6) within a stay's date range, as "YYYY-MM-DD", or "". */
function firstShabbat(arrival: number, departure: number): string {
  for (let t = arrival; t <= departure; t += DAY_MS) {
    if (new Date(t).getUTCDay() === 6) return new Date(t).toISOString().slice(0, 10);
  }
  return "";
}

const fieldCls =
  "w-full rounded-xl border border-line2 bg-surface px-3.5 py-3 text-ink outline-none transition focus:border-clay";
const labelCls = "mb-1.5 block text-sm font-bold text-ink";
const errCls = "mt-1 block text-sm font-semibold text-clay-ink";

const NUSACHIM: Nusach[] = ["any", "ashkenaz", "sefard", "chabad", "mizrachi"];
const TEFILLOT: Tefilla[] = ["shacharit", "mincha", "maariv"];

interface ServiceRow {
  tefilla: Tefilla;
  time: string;
}

function dateToEpoch(v: string): number {
  return v ? Date.parse(`${v}T00:00:00.000Z`) : Number.NaN;
}

/** Host-a-Minyan form (US2/FR-002): location + date + a set of tefillot (each optional time) +
 * nusach + Sefer Torah + notes + party size. On success routes to the new Minyan's detail page. */
export function HostMinyanForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const host = useHostMinyan();

  const [location, setLocation] = useState<LocationValue>({ city: "", country: "", lat: null, lng: null });
  const [addressPrivate, setAddressPrivate] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [services, setServices] = useState<ServiceRow[]>([{ tefilla: "shacharit", time: "" }]);
  const [nusach, setNusach] = useState<Nusach>("any");
  const [seferTorah, setSeferTorah] = useState(false);
  const [notes, setNotes] = useState("");
  const [hostNumMen, setHostNumMen] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // Pre-fill from a saved location when arrived via the post-save "host a minyan" promotion (#4):
  // seed the location (city/coords) + the first Shabbat in the stay's range. Once-guarded.
  const { fromStay } = useSearch({ from: "/authed/minyan/new" });
  const prefilled = useRef(false);
  useEffect(() => {
    if (!fromStay || prefilled.current) return;
    prefilled.current = true;
    getStay(fromStay)
      .then((s) => {
        setLocation({ city: s.city, country: s.country, lat: s.lat, lng: s.lng });
        const shabbat = firstShabbat(s.arrivalDate, s.departureDate);
        if (shabbat) setEventDate(shabbat);
        if (s.bringsSeferTorah) setSeferTorah(true);
      })
      .catch(() => {});
  }, [fromStay]);

  function setService(i: number, patch: Partial<ServiceRow>) {
    setServices((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (location.lat == null || location.lng == null) {
      setErrors({ city: "location.required" });
      return;
    }
    const payload = {
      type: "minyan" as const,
      city: location.city,
      country: location.country,
      lat: location.lat,
      lng: location.lng,
      addressPrivate: addressPrivate || null,
      addressNotes: addressNotes || null,
      eventDate: dateToEpoch(eventDate),
      notes: notes || null,
      minyan: {
        nusach,
        seferTorah,
        services: services.map((s) => ({ tefilla: s.tefilla, time: s.time || null })),
      },
      hostNumMen,
    };
    const parsed = CreateEventInput.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".") || "form"] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      const dto = await host.mutateAsync(parsed.data);
      void navigate({ to: "/minyan/$id", params: { id: dto.id } });
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.body.errors) && err.body.errors.length) {
        // Map ALL field errors (not just the first), matching the Stay form.
        const next: Record<string, string> = {};
        for (const e2 of err.body.errors) if (e2.field) next[e2.field] = e2.code;
        setErrors(next);
        if (err.body.errors.some((e2) => !e2.field)) setSubmitError(t("auth.error"));
      } else setSubmitError(t("auth.error"));
    }
  }

  const fieldError = (name: string) => (errors[name] ? <span className={errCls}>{t(`errors.${errors[name]}`)}</span> : null);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5" dir="rtl">
      <h1 className="text-2xl font-extrabold text-ink">{t("host.title")}</h1>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <LocationPicker value={location} onChange={setLocation} invalid={!!errors.city} precise />
          {fieldError("city")}
          <label className="mt-4 block">
            <span className={labelCls}>{t("host.addressPrivate")}</span>
            <input
              className={fieldCls}
              value={addressPrivate}
              aria-label={t("host.addressPrivate")}
              placeholder={t("host.addressPlaceholder")}
              onChange={(e) => setAddressPrivate(e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">{t("host.addressHint")}</span>
          </label>
          <label className="mt-4 block">
            <span className={labelCls}>{t("host.addressNotes")}</span>
            <textarea
              className={fieldCls}
              rows={2}
              value={addressNotes}
              aria-label={t("host.addressNotes")}
              placeholder={t("host.addressNotesPlaceholder")}
              onChange={(e) => setAddressNotes(e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">{t("host.addressNotesHint")}</span>
          </label>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <label className="block">
            <span className={labelCls}>{t("host.date")}</span>
            <input type="date" className={fieldCls} value={eventDate} aria-label={t("host.date")} aria-invalid={!!errors.eventDate} onChange={(e) => setEventDate(e.target.value)} />
            {fieldError("eventDate")}
          </label>

          <fieldset className="mt-4">
            <legend className={labelCls}>{t("host.services")}</legend>
            <div className="flex flex-col gap-3">
              {services.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className={fieldCls} value={s.tefilla} aria-label={t("host.tefilla")} onChange={(e) => setService(i, { tefilla: e.target.value as Tefilla })}>
                    {TEFILLOT.map((tf) => <option key={tf} value={tf}>{t(`tefilla.${tf}`)}</option>)}
                  </select>
                  <input type="time" className={fieldCls} value={s.time} aria-label={t("host.time")} onChange={(e) => setService(i, { time: e.target.value })} />
                  {services.length > 1 && (
                    <button type="button" className="shrink-0 px-2 text-clay" aria-label={t("host.removeService")} onClick={() => setServices((r) => r.filter((_, idx) => idx !== i))}>−</button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="mt-2 text-sm font-bold text-clay" onClick={() => setServices((r) => [...r, { tefilla: "mincha", time: "" }])}>
              + {t("host.addService")}
            </button>
            {fieldError("minyan.services")}
          </fieldset>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
          <label className="block">
            <span className={labelCls}>{t("host.nusach")}</span>
            <select className={fieldCls} value={nusach} aria-label={t("host.nusach")} onChange={(e) => setNusach(e.target.value as Nusach)}>
              {NUSACHIM.map((n) => <option key={n} value={n}>{t(`nusach.${n}`)}</option>)}
            </select>
          </label>
          <label className="flex min-h-[44px] items-center gap-3 text-ink">
            <input type="checkbox" className="h-5 w-5" checked={seferTorah} aria-label={t("host.seferTorah")} onChange={(e) => setSeferTorah(e.target.checked)} />
            {t("host.seferTorah")}
          </label>
          <label className="block">
            <span className={labelCls}>{t("host.numMen")}</span>
            <input type="number" min={1} max={50} className={fieldCls} value={hostNumMen} aria-label={t("host.numMen")} aria-invalid={!!errors.hostNumMen} onChange={(e) => setHostNumMen(Math.min(50, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
            {fieldError("hostNumMen")}
          </label>
          <label className="block">
            <span className={labelCls}>{t("host.notes")}</span>
            <textarea className={fieldCls} rows={2} value={notes} aria-label={t("host.notes")} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </section>

        {submitError && <p role="alert" className="text-sm font-bold text-clay-ink">{submitError}</p>}
        <button type="submit" disabled={host.isPending} className="w-full rounded-[14px] bg-clay px-4 py-[15px] font-extrabold text-on-clay transition disabled:opacity-60">
          {host.isPending ? t("auth.submitting") : t("host.submit")}
        </button>
      </form>
    </div>
  );
}
