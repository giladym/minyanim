import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CreateEventInput,
  EVENT_KINDS,
  type EventKind,
  type MealType,
  type Kashrut,
  type SocialSubcategory,
  type Occasion,
  type RsvpMode,
  type Visibility,
} from "@minyanim/shared";
import { LocationPicker, type LocationValue } from "../stays/LocationPicker";
import { getStay } from "../../lib/stays";
import { useHostEvent } from "../../lib/events";
import { ApiError } from "../../lib/api";
import { Icon } from "../../components/Icon";
import { KindPicker, type PickerContext } from "./KindPicker";

const fieldCls =
  "w-full rounded-xl border border-line2 bg-surface px-3.5 py-3 text-ink outline-none transition focus:border-primary";
const labelCls = "mb-1.5 block text-sm font-bold text-ink";
const errCls = "mt-1 block text-sm font-semibold text-clay-ink";

const MEAL_TYPES: MealType[] = ["shabbat_dinner", "shabbat_lunch", "seudah_shlishit", "holiday_meal", "weekday"];
const KASHRUT: Kashrut[] = ["glatt", "kosher", "dairy", "vegetarian", "other"];
const DIETARY = ["vegetarian", "vegan", "gluten_free", "nut_free", "dairy_free"] as const;
const SUBCATS: SocialSubcategory[] = ["party", "kiddush", "farbrengen", "meetup", "other"];
const OCCASIONS: Occasion[] = ["none", "shabbat", "rosh_hashanah", "yom_kippur", "sukkot", "pesach", "shavuot", "chanukah", "purim"];
/** Occasions whose start time benefits from a candle-lighting-ish default (Shabbat + the festivals). */
const YOM_TOV = new Set<Occasion>(["shabbat", "rosh_hashanah", "yom_kippur", "sukkot", "pesach", "shavuot"]);

function dateToEpoch(v: string): number {
  return v ? Date.parse(`${v}T00:00:00.000Z`) : Number.NaN;
}

/**
 * Host-an-event form (014, T027) — the hosting + social branches (the minyan branch keeps its own
 * `HostMinyanForm`). Above the fold: title / mealType / date+time / seats / location; a collapsed
 * "פרטים נוספים" holds the secondary fields (SC-001 < 3 min). Publishes via `POST /api/events`.
 */
export function HostEventForm({ kind, ctx }: { kind: Exclude<EventKind, "minyan">; ctx: PickerContext }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const host = useHostEvent();
  const isHosting = kind === "hosting";

  const [location, setLocation] = useState<LocationValue>({ city: "", country: "", lat: null, lng: null });
  const [addressPrivate, setAddressPrivate] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [occasion, setOccasion] = useState<Occasion>("none");
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // Hosting-specific
  const [mealType, setMealType] = useState<MealType>("shabbat_dinner");
  const [seats, setSeats] = useState(6);
  const [kashrut, setKashrut] = useState<Kashrut>("kosher");
  const [dietary, setDietary] = useState<string[]>([]);
  const [offering, setOffering] = useState("");
  const [bringItems, setBringItems] = useState("");
  const [alcohol, setAlcohol] = useState(false);
  const [accessibility, setAccessibility] = useState("");
  const [rsvpCutoff, setRsvpCutoff] = useState("");

  // Social-specific
  const [subcategory, setSubcategory] = useState<SocialSubcategory>("kiddush");
  const [capacity, setCapacity] = useState("");

  // Axes with per-kind defaults (CATEGORY_META): hosting→approval, social→open.
  const [rsvpMode, setRsvpMode] = useState<RsvpMode>(isHosting ? "approval" : "open");
  const [visibility, setVisibility] = useState<Visibility>("public");

  // Prefill location + a sensible date from a Stay context.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    if (ctx.fromStay) {
      prefilled.current = true;
      getStay(ctx.fromStay)
        .then((s) => setLocation({ city: s.city, country: s.country, lat: s.lat, lng: s.lng }))
        .catch(() => {});
    } else if (ctx.lat != null && ctx.lng != null) {
      prefilled.current = true;
      setLocation({ city: ctx.city ?? "", country: ctx.country ?? "", lat: ctx.lat, lng: ctx.lng });
      if (ctx.date) setEventDate(ctx.date);
    }
  }, [ctx]);

  // Meal-type ↔ occasion derive (hosting): Shabbat meals pre-select Shabbat; a holiday meal requires
  // an explicit occasion. Only nudges when the user hasn't chosen an occasion yet (editable).
  useEffect(() => {
    if (!isHosting) return;
    if ((mealType === "shabbat_dinner" || mealType === "shabbat_lunch" || mealType === "seudah_shlishit") && occasion === "none") {
      setOccasion("shabbat");
    }
  }, [mealType, isHosting]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zmanim-assisted default start time when the occasion is Shabbat/festival (editable). The client
  // can't compute candle-lighting (the zmanim library is server-only, ADR 0007), so we seed a
  // sensible evening default; the exact time comes from the server's zmanim endpoint on the detail.
  useEffect(() => {
    if (isHosting && YOM_TOV.has(occasion) && !startTime) setStartTime("18:00");
  }, [occasion, isHosting]); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldError = (name: string) => (errors[name] ? <span className={errCls}>{t(`errors.${errors[name]}`)}</span> : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    const next: Record<string, string> = {};
    if (location.lat == null || location.lng == null) next.city = "location.required";
    if (isHosting && !startTime) next.startTime = "event.time_invalid";
    if (isHosting && mealType === "holiday_meal" && (occasion === "none" || !YOM_TOV.has(occasion))) next.occasion = "occasion.invalid";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    const capNum = isHosting ? seats : capacity ? Math.max(1, Math.floor(Number(capacity))) : null;
    const meta = EVENT_KINDS[kind];
    const payload = {
      type: "gathering" as const,
      category: meta.category ?? undefined,
      title: title || null,
      city: location.city,
      country: location.country,
      lat: location.lat,
      lng: location.lng,
      addressPrivate: addressPrivate || null,
      addressNotes: addressNotes || null,
      eventDate: dateToEpoch(eventDate),
      startTime: startTime || null,
      endTime: endTime || null,
      rsvpCutoff: rsvpCutoff ? Date.parse(rsvpCutoff) : null,
      occasion,
      rsvpMode,
      visibility,
      capacity: capNum,
      notes: notes || null,
      gathering: isHosting
        ? { mealType, kashrut, dietary, offering: offering || null, bringItems: bringItems || null, alcohol, accessibility: accessibility || null }
        : { subcategory },
      hostNumMen: 1, // ignored server-side for gatherings (host is not counted), but required by the schema
      stayId: ctx.fromStay ?? null,
    };

    const parsed = CreateEventInput.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) fe[issue.path.join(".") || "form"] = issue.message;
      setErrors(fe);
      return;
    }
    setErrors({});
    try {
      const dto = await host.mutateAsync(parsed.data);
      void navigate({ to: "/event/$id", params: { id: dto.id }, search: visibility === "unlisted" ? { published: "unlisted" } : {} });
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.body.errors) && err.body.errors.length) {
        const fe: Record<string, string> = {};
        for (const e2 of err.body.errors) if (e2.field) fe[e2.field] = e2.code;
        setErrors(fe);
        const nonField = err.body.errors.find((e2) => !e2.field);
        if (nonField) setSubmitError(nonField.code.startsWith("user.") ? t(`errors.${nonField.code}`) : t("auth.error"));
      } else setSubmitError(t("auth.error"));
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5" dir="rtl">
      <h1 className="text-2xl font-extrabold text-ink">{t(`eventKind.${kind}`)}</h1>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {/* Above the fold */}
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
          <label className="block">
            <span className={labelCls}>{t("hostEvent.titleLabel")}</span>
            <input
              className={fieldCls}
              value={title}
              aria-label={t("hostEvent.titleLabel")}
              placeholder={isHosting ? t("hostEvent.titlePlaceholder") : t("hostEvent.socialTitlePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          {isHosting ? (
            <label className="block">
              <span className={labelCls}>{t("hosting.mealTypeLabel")}</span>
              <select className={fieldCls} value={mealType} aria-label={t("hosting.mealTypeLabel")} onChange={(e) => setMealType(e.target.value as MealType)}>
                {MEAL_TYPES.map((mt) => <option key={mt} value={mt}>{t(`hosting.mealType.${mt}`)}</option>)}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className={labelCls}>{t("social.subcategoryLabel")}</span>
              <select className={fieldCls} value={subcategory} aria-label={t("social.subcategoryLabel")} onChange={(e) => setSubcategory(e.target.value as SocialSubcategory)}>
                {SUBCATS.map((s) => <option key={s} value={s}>{t(`social.subcategory.${s}`)}</option>)}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>{t("host.date")}</span>
              <input type="date" className={fieldCls} value={eventDate} aria-label={t("host.date")} aria-invalid={!!errors.eventDate} onChange={(e) => setEventDate(e.target.value)} />
              {fieldError("eventDate")}
            </label>
            <label className="block">
              <span className={labelCls}>{t("rsvp.startTimeLabel")}</span>
              <input type="time" className={fieldCls} value={startTime} aria-label={t("rsvp.startTimeLabel")} aria-invalid={!!errors.startTime} onChange={(e) => setStartTime(e.target.value)} />
              {fieldError("startTime")}
            </label>
          </div>
          {isHosting && YOM_TOV.has(occasion) && <p className="text-xs text-muted">{t("rsvp.startTimeSuggested")}</p>}

          <label className="block">
            <span className={labelCls}>{t("occasion.label")}</span>
            <select className={fieldCls} value={occasion} aria-label={t("occasion.label")} aria-invalid={!!errors.occasion} onChange={(e) => setOccasion(e.target.value as Occasion)}>
              {OCCASIONS.map((o) => <option key={o} value={o}>{t(`occasion.${o}`)}</option>)}
            </select>
            {fieldError("occasion")}
          </label>

          {isHosting ? (
            <label className="block">
              <span className={labelCls}>{t("hosting.seatsLabel")}</span>
              <input type="number" min={1} max={500} className={fieldCls} value={seats} aria-label={t("hosting.seatsLabel")} onChange={(e) => setSeats(Math.max(1, Math.floor(Number(e.target.value)) || 1))} />
              <span className="mt-1 block text-xs text-muted">{t("hosting.seatsHelper")}</span>
            </label>
          ) : (
            <label className="block">
              <span className={labelCls}>{t("social.capacityLabel")}</span>
              <input type="number" min={1} max={500} className={fieldCls} value={capacity} aria-label={t("social.capacityLabel")} onChange={(e) => setCapacity(e.target.value)} />
            </label>
          )}

          <div>
            {location.city && (
              <p className="mb-2 flex items-center gap-2 font-bold text-ink">
                <Icon name="map-pin" size={16} className="text-primary-ink" />
                {location.city}{location.country ? `, ${location.country}` : ""}
              </p>
            )}
            <LocationPicker value={location} onChange={setLocation} invalid={!!errors.city} precise />
            {fieldError("city")}
          </div>
        </section>

        {/* Collapsed "more details" */}
        <section className="rounded-2xl border border-line bg-surface p-5">
          <button type="button" className="flex w-full items-center justify-between text-start font-extrabold text-ink" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {t("hostEvent.moreDetails")}
            <Icon name={expanded ? "close" : "add"} size={18} />
          </button>
          {expanded && (
            <div className="mt-4 flex flex-col gap-4">
              {isHosting && (
                <>
                  <label className="block">
                    <span className={labelCls}>{t("hosting.kashrutLabel")}</span>
                    <select className={fieldCls} value={kashrut} aria-label={t("hosting.kashrutLabel")} onChange={(e) => setKashrut(e.target.value as Kashrut)}>
                      {KASHRUT.map((k) => <option key={k} value={k}>{t(`hosting.kashrut.${k}`)}</option>)}
                    </select>
                  </label>
                  <fieldset>
                    <legend className={labelCls}>{t("hosting.dietaryLabel")}</legend>
                    <div className="flex flex-wrap gap-2">
                      {DIETARY.map((d) => {
                        const on = dietary.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setDietary((xs) => (on ? xs.filter((x) => x !== d) : [...xs, d]))}
                            className={"rounded-full px-3 py-1.5 text-sm font-bold " + (on ? "bg-primary text-on-primary" : "bg-chip text-muted")}
                          >
                            {t(`hosting.dietary.${d}`)}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <label className="block">
                    <span className={labelCls}>{t("hosting.offeringLabel")}</span>
                    <textarea className={fieldCls} rows={2} value={offering} aria-label={t("hosting.offeringLabel")} placeholder={t("hosting.offeringPlaceholder")} onChange={(e) => setOffering(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={labelCls}>{t("hosting.bringLabel")}</span>
                    <input className={fieldCls} value={bringItems} aria-label={t("hosting.bringLabel")} placeholder={t("hosting.bringPlaceholder")} onChange={(e) => setBringItems(e.target.value)} />
                  </label>
                  <label className="flex min-h-[44px] items-center gap-3 text-ink">
                    <input type="checkbox" className="h-5 w-5" checked={alcohol} aria-label={t("hosting.alcoholLabel")} onChange={(e) => setAlcohol(e.target.checked)} />
                    {t("hosting.alcoholLabel")}
                  </label>
                  <label className="block">
                    <span className={labelCls}>{t("hosting.accessibilityLabel")}</span>
                    <input className={fieldCls} value={accessibility} aria-label={t("hosting.accessibilityLabel")} placeholder={t("hosting.accessibilityPlaceholder")} onChange={(e) => setAccessibility(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={labelCls}>{t("rsvp.cutoffLabel")}</span>
                    <input type="datetime-local" className={fieldCls} value={rsvpCutoff} aria-label={t("rsvp.cutoffLabel")} onChange={(e) => setRsvpCutoff(e.target.value)} />
                    <span className="mt-1 block text-xs text-muted">{t("rsvp.cutoffHint")}</span>
                  </label>
                </>
              )}

              {!isHosting && (
                <label className="block">
                  <span className={labelCls}>{t("hostEvent.descriptionLabel")}</span>
                  <textarea className={fieldCls} rows={3} value={notes} aria-label={t("hostEvent.descriptionLabel")} placeholder={t("hostEvent.descriptionPlaceholder")} onChange={(e) => setNotes(e.target.value)} />
                </label>
              )}

              <label className="block">
                <span className={labelCls}>{t("rsvp.endTimeLabel")}</span>
                <input type="time" className={fieldCls} value={endTime} aria-label={t("rsvp.endTimeLabel")} onChange={(e) => setEndTime(e.target.value)} />
              </label>

              <label className="block">
                <span className={labelCls}>{t("rsvp.modeLabel")}</span>
                <select className={fieldCls} value={rsvpMode} aria-label={t("rsvp.modeLabel")} onChange={(e) => setRsvpMode(e.target.value as RsvpMode)}>
                  <option value="approval">{t("rsvp.modeApproval")}</option>
                  <option value="open">{t("rsvp.modeOpen")}</option>
                </select>
              </label>

              <label className="block">
                <span className={labelCls}>{t("rsvp.visibilityLabel")}</span>
                <select className={fieldCls} value={visibility} aria-label={t("rsvp.visibilityLabel")} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                  <option value="public">{t("rsvp.visibilityPublic")}</option>
                  <option value="unlisted">{t("rsvp.visibilityUnlisted")}</option>
                </select>
              </label>

              <label className="block">
                <span className={labelCls}>{t("host.addressPrivate")}</span>
                <input className={fieldCls} value={addressPrivate} aria-label={t("host.addressPrivate")} placeholder={t("host.addressPlaceholder")} onChange={(e) => setAddressPrivate(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelCls}>{t("host.addressNotes")}</span>
                <textarea className={fieldCls} rows={2} value={addressNotes} aria-label={t("host.addressNotes")} placeholder={t("host.addressNotesPlaceholder")} onChange={(e) => setAddressNotes(e.target.value)} />
              </label>
            </div>
          )}
        </section>

        {submitError && <p role="alert" className="text-sm font-bold text-clay-ink">{submitError}</p>}
        <button type="submit" disabled={host.isPending} className="w-full rounded-[14px] bg-primary px-4 py-[15px] font-extrabold text-on-primary transition disabled:opacity-60">
          {host.isPending ? t("auth.submitting") : t("hostEvent.publish")}
        </button>
      </form>
    </div>
  );
}

/**
 * `/event/new` route entry. No `?kind=` → the kind picker; `?kind=minyan` deep-links to the flagship
 * `/minyan/new` form (skips the picker); `?kind=hosting|social` → the generic host-event form.
 */
export function HostEventPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/authed/event/new" });
  const { kind, fromStay, lat, lng, city, country, date } = search;
  const ctx: PickerContext = { fromStay, lat, lng, city, country, date };

  useEffect(() => {
    if (kind === "minyan") void navigate({ to: "/minyan/new", search: ctx });
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (kind === "hosting" || kind === "social") return <HostEventForm kind={kind} ctx={ctx} />;
  if (kind === "minyan") return null; // redirecting
  return <KindPicker ctx={ctx} />;
}
