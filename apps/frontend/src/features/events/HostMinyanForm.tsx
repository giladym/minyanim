import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CreateEventInput, UpdateEventInput, type Nusach, type Tefilla, type OwnerMinyanDTO } from "@minyanim/shared";
import { LocationPicker, type LocationValue } from "../stays/LocationPicker";
import { useHostMinyan, useUpdateEvent } from "../../lib/events";
import { useDiscovery } from "../../lib/discovery";
import { getStay } from "../../lib/stays";
import { Icon } from "../../components/Icon";
import { ApiError } from "../../lib/api";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The first Saturday (UTC civil weekday 6) within a stay's date range, as "YYYY-MM-DD", or "". */
function firstShabbat(arrival: number, departure: number): string {
  for (let t = arrival; t <= departure; t += DAY_MS) {
    if (new Date(t).getUTCDay() === 6) return new Date(t).toISOString().slice(0, 10);
  }
  return "";
}
/** Today at UTC midnight (epoch-ms), matching the date-only storage convention. */
function todayUtcMidnight(): number {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

const fieldCls =
  "w-full rounded-xl border border-line2 bg-surface px-3.5 py-3 text-ink outline-none transition focus:border-primary";
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
export function HostMinyanForm({ editEvent }: { editEvent?: OwnerMinyanDTO } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const host = useHostMinyan();
  const isEdit = Boolean(editEvent);
  const editId = editEvent?.id ?? "";
  const update = useUpdateEvent(editId);

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

  // Pre-fill the host form. Two sources, both once-guarded:
  //  • ?fromStay=<id> — the post-save "host a minyan" promotion (#4): location + first Shabbat.
  //  • lat/lng/city/country/date/nearby — the discovery "organize a minyan here" button: the
  //    searched location + that Shabbat, plus how many nearby people will be notified on save.
  // `strict: false` so this hook is safe on BOTH the create route (`/minyan/new`, where these params
  // are set) and the edit route (`/event/$id/edit`, which reuses this form with `editEvent`). In edit
  // mode the search-driven prefill effect below no-ops.
  const search = useSearch({ strict: false }) as {
    fromStay?: string; lat?: number; lng?: number; city?: string; country?: string; date?: string; nearby?: number;
  };
  const { fromStay, lat, lng, city, country, date, nearby } = search;

  // Edit mode (014): seed every editable field from the loaded minyan — exactly ONCE (ref-guarded).
  // Location + date are immutable in v1 (not in UpdateEventInput) and shown read-only below.
  const seeded = useRef(false);
  useEffect(() => {
    if (!editEvent || seeded.current) return;
    seeded.current = true;
    const m = editEvent;
    setLocation({ city: m.city, country: m.country, lat: m.lat, lng: m.lng });
    setEventDate(new Date(m.eventDate).toISOString().slice(0, 10));
    setNusach(m.nusach);
    setSeferTorah(m.seferTorah);
    setNotes(m.notes ?? "");
    setAddressPrivate(m.addressPrivate ?? "");
    setAddressNotes(m.addressNotes ?? "");
    setServices(m.services.map((s) => ({ tefilla: s.tefilla, time: s.time ?? "" })));
  }, [editEvent]);

  const prefilled = useRef(false);
  useEffect(() => {
    if (isEdit || prefilled.current) return;
    if (fromStay) {
      prefilled.current = true;
      getStay(fromStay)
        .then((s) => {
          setLocation({ city: s.city, country: s.country, lat: s.lat, lng: s.lng });
          // Default to the first Shabbat that isn't already in the past: scan from max(arrival,
          // today) so a stay that has already started prefills the next upcoming Shabbat, not a
          // gone one. The server remains authoritative for the timezone-correct past check.
          const shabbat = firstShabbat(Math.max(s.arrivalDate, todayUtcMidnight()), s.departureDate);
          if (shabbat) setEventDate(shabbat);
          if (typeof s.numMen === "number") setHostNumMen(Math.min(50, Math.max(1, s.numMen)));
        })
        .catch(() => {});
    } else if (lat != null && lng != null) {
      prefilled.current = true;
      setLocation({ city: city ?? "", country: country ?? "", lat, lng });
      if (date) setEventDate(date);
    }
  }, [fromStay, lat, lng, city, country, date]);

  // When arrived from discovery (a point + a Shabbat), fetch the travelers in the area for that
  // date so the organizer sees WHO they're forming the minyan with (name · men · contact for
  // sharers) — not just a count. Reuses the discovery `travelers` projection (from=to=that date).
  const travelersParams =
    lat != null && lng != null && date
      ? { lat, lng, city: city ?? undefined, country: country ?? undefined, from: dateToEpoch(date), to: dateToEpoch(date) }
      : null;
  const { data: disc } = useDiscovery(travelersParams);
  const travelers = disc?.potential.find((b) => b.shabbat === date)?.travelers ?? [];

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

    // ── Edit (PATCH) ─────────────────────────────────────────────────────────
    // Location + date are immutable in v1 (absent from UpdateEventInput); the minyan detail + notes
    // are editable. Party size (hostNumMen) is create-only.
    if (isEdit) {
      const editPayload = {
        addressPrivate: addressPrivate || null,
        addressNotes: addressNotes || null,
        notes: notes || null,
        nusach,
        seferTorah,
        services: services.map((s) => ({ tefilla: s.tefilla, time: s.time || null })),
      };
      const parsedEdit = UpdateEventInput.safeParse(editPayload);
      if (!parsedEdit.success) {
        const next: Record<string, string> = {};
        for (const issue of parsedEdit.error.issues) next[issue.path.join(".") || "form"] = issue.message;
        setErrors(next);
        return;
      }
      setErrors({});
      try {
        const dto = await update.mutateAsync(parsedEdit.data);
        void navigate({ to: "/minyan/$id", params: { id: dto.id } });
      } catch (err) {
        if (err instanceof ApiError && Array.isArray(err.body.errors) && err.body.errors.length) {
          const next: Record<string, string> = {};
          for (const e2 of err.body.errors) if (e2.field) next[e2.field] = e2.code;
          setErrors(next);
          const nonField = err.body.errors.find((e2) => !e2.field);
          if (nonField) setSubmitError(nonField.code.startsWith("user.") ? t(`errors.${nonField.code}`) : t("auth.error"));
        } else setSubmitError(t("auth.error"));
      }
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
      stayId: fromStay ?? null, // link the minyan back to the originating Stay (013)
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
        // Enforcement codes (banned/suspended) get a specific message (FR-005); else the generic notice.
        const nonField = err.body.errors.find((e2) => !e2.field);
        if (nonField) setSubmitError(nonField.code.startsWith("user.") ? t(`errors.${nonField.code}`) : t("auth.error"));
      } else setSubmitError(t("auth.error"));
    }
  }

  const fieldError = (name: string) => (errors[name] ? <span className={errCls}>{t(`errors.${errors[name]}`)}</span> : null);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5" dir="rtl">
      <h1 className="text-2xl font-extrabold text-ink">{isEdit ? t("host.editTitle") : t("host.title")}</h1>
      {travelers.length > 0 ? (
        <TravelersPanel travelers={travelers} nearby={nearby} />
      ) : (
        nearby != null && nearby > 0 && (
          <p role="status" className="rounded-xl bg-teal-soft px-4 py-3 text-sm font-semibold text-teal-ink">
            {t("host.nearbyNotice", { count: nearby })}
          </p>
        )
      )}
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <section className="rounded-2xl border border-line bg-surface p-5">
          {location.city && (
            <p className="mb-3 flex items-center gap-2 text-lg font-extrabold text-ink">
              <Icon name="map-pin" size={18} className="text-primary-ink" />
              {location.city}{location.country ? `, ${location.country}` : ""}
            </p>
          )}
          {/* Location is immutable in v1 (not in UpdateEventInput) — read-only when editing. */}
          {isEdit ? (
            <p className="text-xs text-muted">{t("host.locationLocked")}</p>
          ) : (
            <>
              <LocationPicker value={location} onChange={setLocation} invalid={!!errors.city} precise />
              {fieldError("city")}
            </>
          )}
          <label className="mt-4 block">
            <span className={labelCls}>{t("host.addressPrivate")}<CommittedPill /></span>
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
            <span className={labelCls}>{t("host.addressNotes")}<CommittedPill /></span>
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
            <input type="date" className={fieldCls + (isEdit ? " opacity-60" : "")} value={eventDate} aria-label={t("host.date")} aria-invalid={!!errors.eventDate} disabled={isEdit} onChange={(e) => setEventDate(e.target.value)} />
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
          {/* Party size seeds the host's self-commitment on CREATE only — not part of an edit. */}
          {!isEdit && (
            <label className="block">
              <span className={labelCls}>{t("host.numMen")}</span>
              <input type="number" min={1} max={50} className={fieldCls} value={hostNumMen} aria-label={t("host.numMen")} aria-invalid={!!errors.hostNumMen} onChange={(e) => setHostNumMen(Math.min(50, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
              {fieldError("hostNumMen")}
            </label>
          )}
          <label className="block">
            <span className={labelCls}>{t("host.notes")}</span>
            <textarea className={fieldCls} rows={2} value={notes} aria-label={t("host.notes")} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </section>

        {submitError && <p role="alert" className="text-sm font-bold text-clay-ink">{submitError}</p>}
        <button type="submit" disabled={host.isPending || update.isPending} className="w-full rounded-[14px] bg-primary px-4 py-[15px] font-extrabold text-on-primary transition disabled:opacity-60">
          {host.isPending || update.isPending ? t("auth.submitting") : isEdit ? t("host.saveChanges") : t("host.submit")}
        </button>
      </form>
    </div>
  );
}

/** "Shown only to those who join" pill — on the private-address / entry-notes fields (D4). */
function CommittedPill() {
  const { t } = useTranslation();
  return (
    <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 align-middle text-[11px] font-bold text-muted">
      <Icon name="check" size={11} />
      {t("host.committedOnly")}
    </span>
  );
}

/** Nearby travelers for the chosen Shabbat — name · men · contact (phone only for sharers), so the
 * organizer can reach people directly; a footer reminds they're also notified on save. */
function TravelersPanel({ travelers, nearby }: { travelers: { name: string; phone: string | null; numMen: number }[]; nearby?: number }) {
  const { t } = useTranslation();
  const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line bg-primary-soft px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-extrabold text-primary-ink">
          <Icon name="users" size={18} />
          {t("host.travelersTitle")}
        </p>
      </div>
      <ul>
        {travelers.map((tr, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0">
            <span className="text-sm font-bold text-ink">
              {tr.name} <span className="font-semibold text-muted">· {t("stays.men", { count: tr.numMen })}</span>
            </span>
            {tr.phone ? (
              <span className="flex gap-2">
                <a className="inline-flex items-center gap-1 rounded-lg bg-whatsapp px-3 py-1.5 text-xs font-bold text-on-whatsapp" href={wa(tr.phone)} target="_blank" rel="noopener noreferrer" aria-label={`${t("minyanDetail.contactWhatsapp")} — ${tr.name}`}>
                  {t("minyanDetail.contactWhatsapp")}
                </a>
                <a className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink" dir="ltr" href={`tel:${tr.phone}`} aria-label={`${t("minyanDetail.contactCall")} — ${tr.name}`}>
                  {tr.phone}
                </a>
              </span>
            ) : (
              <span className="text-xs text-faint">{t("minyanDetail.noContact")}</span>
            )}
          </li>
        ))}
      </ul>
      {nearby != null && nearby > 0 && (
        <p className="bg-chip px-4 py-2.5 text-xs font-semibold text-muted">{t("host.nearbyNotice", { count: nearby })}</p>
      )}
    </div>
  );
}
