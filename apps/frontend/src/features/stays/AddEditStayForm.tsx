import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  CreateStayInput,
  type CreateStayInputType,
  type PrayerNeeds as PrayerNeedsValue,
} from "@minyanim/shared";
import { getProfile } from "../../lib/profile";
import { getStay, useCreateStay, useUpdateStay } from "../../lib/stays";
import { ApiError } from "../../lib/api";
import { LocationPicker, type LocationValue } from "./LocationPicker";
import { PrayerNeeds } from "./PrayerNeeds";

const fieldCls =
  "w-full rounded-xl border border-line2 bg-surface px-3.5 py-3 text-ink outline-none transition focus:border-clay";
const labelCls = "mb-1.5 block text-sm font-bold text-ink";
const errCls = "mt-1 block text-sm font-semibold text-clay-ink";

/** Convert a native date input value ("YYYY-MM-DD") to epoch-ms at UTC midnight of that civil
 * date (D4). Empty string yields NaN so the schema flags the missing field. */
function dateInputToEpoch(v: string): number {
  if (!v) return Number.NaN;
  return Date.parse(`${v}T00:00:00.000Z`);
}

/** Convert a stored UTC-midnight epoch back to a native date input value ("YYYY-MM-DD"). */
function epochToDateInput(epoch: number): string {
  if (!Number.isFinite(epoch)) return "";
  return new Date(epoch).toISOString().slice(0, 10);
}

/**
 * Whether the civil-date range ["YYYY-MM-DD", "YYYY-MM-DD"] overlaps a Friday or Saturday — the
 * client-side mirror of the server's coversShabbat heuristic (D7). Dates are treated as civil and
 * parsed at UTC midnight, so `getUTCDay() ∈ {5, 6}` is the civil weekday. Returns false until
 * both dates are valid and ordered. */
function rangeCoversShabbat(arrival: string, departure: string): boolean {
  const start = dateInputToEpoch(arrival);
  const end = dateInputToEpoch(departure);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (let t = start; t <= end; t += DAY_MS) {
    const day = new Date(t).getUTCDay();
    if (day === 5 || day === 6) return true;
  }
  return false;
}

const emptyPrayerNeeds: PrayerNeedsValue = {
  weekday: { shacharit: false, mincha: false, maariv: false },
};

/** Field-keyed validation errors (code strings rendered via t(`errors.${code}`)). */
type FieldErrors = Record<string, string>;

/**
 * Create/Edit Stay form (FR-001/FR-006). Required fields: location (via LocationPicker),
 * arrival/departure dates, number of men. Smart defaults pre-fill contact from the profile and
 * num_men=1. Optional fields are collapsed behind a "more details" disclosure. Validates on
 * submit against the shared CreateStayInput; Zod issue messages are error codes rendered as
 * Hebrew text. On success returns to the dashboard with the affected Stay highlighted.
 *
 * @param stayId When present, the form edits an existing Stay (PATCH); otherwise it creates one.
 */
export function AddEditStayForm({ stayId }: { stayId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = Boolean(stayId);

  const [location, setLocation] = useState<LocationValue>({
    city: "",
    country: "",
    lat: null,
    lng: null,
  });
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [numMen, setNumMen] = useState(1);
  const [bringsSeferTorah, setBringsSeferTorah] = useState(false);
  const [prayerNeeds, setPrayerNeeds] = useState<PrayerNeedsValue>(emptyPrayerNeeds);
  const [addressPrivate, setAddressPrivate] = useState("");
  const [groupMembers, setGroupMembers] = useState("");
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [showDetails, setShowDetails] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");

  const create = useCreateStay();
  const update = useUpdateStay();
  const busy = create.isPending || update.isPending;

  // Date-driven Shabbat affordance: show the note only when the range covers a Fri/Sat (FR-009).
  const coversShabbat = useMemo(
    () => rangeCoversShabbat(arrival, departure),
    [arrival, departure],
  );

  // Smart defaults: pre-fill contact (name + first phone) from the profile (D12). Create only.
  useEffect(() => {
    if (isEdit) return;
    getProfile()
      .then((p) => {
        setContactName((prev) => prev || p.name);
        setContactPhone((prev) => prev || p.phones[0]?.e164 || "");
      })
      .catch(() => {});
  }, [isEdit]);

  // Edit: seed the form from the existing Stay — exactly ONCE. Guard with a ref so a later
  // re-render that re-runs this effect (e.g. `t` changing identity on a language switch) can't
  // re-fetch and clobber edits the user has already made.
  const seeded = useRef(false);
  useEffect(() => {
    if (!stayId || seeded.current) return;
    seeded.current = true;
    getStay(stayId)
      .then((s) => {
        setLocation({ city: s.city, country: s.country, lat: s.lat, lng: s.lng });
        setArrival(epochToDateInput(s.arrivalDate));
        setDeparture(epochToDateInput(s.departureDate));
        setNumMen(s.numMen);
        setBringsSeferTorah(s.bringsSeferTorah);
        setPrayerNeeds(s.prayerNeeds);
        setAddressPrivate(s.addressPrivate ?? "");
        setGroupMembers(s.groupMembers ?? "");
        setNotes(s.notes ?? "");
        setContactName(s.contactName ?? "");
        setContactPhone(s.contactPhone ?? "");
        setContactEmail(s.contactEmail ?? "");
        if (s.addressPrivate || s.groupMembers || s.notes) setShowDetails(true);
      })
      .catch(() => setSubmitError(t("stays.loadError")));
  }, [stayId, t]);

  const payload: CreateStayInputType = useMemo(
    () => ({
      city: location.city,
      country: location.country,
      lat: location.lat,
      lng: location.lng,
      addressPrivate: addressPrivate || null,
      arrivalDate: dateInputToEpoch(arrival),
      departureDate: dateInputToEpoch(departure),
      numMen,
      bringsSeferTorah,
      prayerNeeds,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      groupMembers: groupMembers || null,
      notes: notes || null,
      folderId: null,
    }),
    [location, addressPrivate, arrival, departure, numMen, bringsSeferTorah, prayerNeeds, contactName, contactPhone, contactEmail, groupMembers, notes],
  );

  function applyApiError(err: unknown) {
    if (err instanceof ApiError && Array.isArray(err.body.errors)) {
      const next: FieldErrors = {};
      for (const e of err.body.errors) if (e.field) next[e.field] = e.code;
      setErrors((prev) => ({ ...prev, ...next }));
      if (err.body.errors.some((e) => !e.field)) setSubmitError(t("auth.error"));
    } else {
      setSubmitError(t("auth.error"));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    // Structural validation against the shared SSOT; Zod message == error code.
    const parsed = CreateStayInput.safeParse(payload);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join(".") || "form"] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      if (isEdit && stayId) {
        const dto = await update.mutateAsync({ id: stayId, input: parsed.data });
        navigateToDashboard(dto.id, "updated");
      } else {
        const dto = await create.mutateAsync(parsed.data);
        navigateToDashboard(dto.id, "saved");
      }
    } catch (err) {
      applyApiError(err);
    }
  }

  function navigateToDashboard(id: string, flash: "saved" | "updated") {
    void navigate({ to: "/stays", search: { highlight: id, flash } });
  }

  const fieldError = (name: string) =>
    errors[name] ? <span className={errCls}>{t(`errors.${errors[name]}`)}</span> : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">
          {isEdit ? t("stays.editTitle") : t("stays.newTitle")}
        </h1>
        <button
          type="button"
          className="text-sm font-bold text-clay"
          onClick={() => void navigate({ to: "/stays" })}
        >
          {t("stays.backToList")}
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Card>
          <LocationPicker value={location} onChange={setLocation} />
          {fieldError("city")}
          {fieldError("country")}
        </Card>

        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>{t("stays.arrivalDate")}</span>
              <input
                type="date"
                className={fieldCls}
                value={arrival}
                aria-label={t("stays.arrivalDate")}
                aria-invalid={!!errors.arrivalDate}
                onChange={(e) => setArrival(e.target.value)}
              />
              {fieldError("arrivalDate")}
            </label>
            <label className="block">
              <span className={labelCls}>{t("stays.departureDate")}</span>
              <input
                type="date"
                className={fieldCls}
                value={departure}
                aria-label={t("stays.departureDate")}
                aria-invalid={!!errors.departureDate}
                onChange={(e) => setDeparture(e.target.value)}
              />
              {fieldError("departureDate")}
            </label>
          </div>
          <label className="mt-4 block">
            <span className={labelCls}>{t("stays.numMen")}</span>
            <input
              type="number"
              min={1}
              className={fieldCls}
              value={numMen}
              aria-label={t("stays.numMen")}
              aria-invalid={!!errors.numMen}
              onChange={(e) => setNumMen(Number(e.target.value))}
            />
            {fieldError("numMen")}
          </label>
        </Card>

        <Card>
          <PrayerNeeds value={prayerNeeds} onChange={setPrayerNeeds} coversShabbat={coversShabbat} />
          <label className="mt-4 flex min-h-[44px] items-center gap-3 text-ink">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={bringsSeferTorah}
              aria-label={t("stays.bringsSeferTorah")}
              onChange={(e) => setBringsSeferTorah(e.target.checked)}
            />
            {t("stays.bringsSeferTorah")}
          </label>
        </Card>

        <Card>
          <button
            type="button"
            className="flex w-full items-center justify-between text-start text-sm font-bold text-clay"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((v) => !v)}
          >
            {t("stays.moreDetails")}
            <span aria-hidden>{showDetails ? "−" : "+"}</span>
          </button>
          {showDetails && (
            <div className="mt-4 flex flex-col gap-4">
              <label className="block">
                <span className={labelCls}>{t("stays.addressPrivate")}</span>
                <input
                  className={fieldCls}
                  value={addressPrivate}
                  aria-label={t("stays.addressPrivate")}
                  onChange={(e) => setAddressPrivate(e.target.value)}
                />
                <span className="mt-1 block text-xs text-muted">{t("stays.addressPrivacy")}</span>
              </label>
              <label className="block">
                <span className={labelCls}>{t("stays.groupMembers")}</span>
                <textarea
                  className={fieldCls}
                  rows={2}
                  value={groupMembers}
                  aria-label={t("stays.groupMembers")}
                  onChange={(e) => setGroupMembers(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{t("stays.notes")}</span>
                <textarea
                  className={fieldCls}
                  rows={2}
                  value={notes}
                  aria-label={t("stays.notes")}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{t("stays.contactName")}</span>
                <input
                  className={fieldCls}
                  value={contactName}
                  aria-label={t("stays.contactName")}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{t("stays.contactPhone")}</span>
                <input
                  className={fieldCls}
                  dir="ltr"
                  value={contactPhone}
                  aria-label={t("stays.contactPhone")}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{t("stays.contactEmail")}</span>
                <input
                  type="email"
                  className={fieldCls}
                  dir="ltr"
                  value={contactEmail}
                  aria-label={t("stays.contactEmail")}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </label>
            </div>
          )}
        </Card>

        <p className="text-xs text-muted">{t("stays.formPrivacy")}</p>

        {submitError && (
          <p role="alert" className="text-sm font-bold text-clay-ink">{submitError}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-[14px] bg-clay px-4 py-[15px] font-extrabold text-on-clay transition disabled:opacity-60"
        >
          {busy ? t("auth.submitting") : isEdit ? t("stays.saveEdit") : t("stays.saveCreate")}
        </button>
      </form>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-line bg-surface p-5">{children}</section>;
}

/** Route entry for `/stays/new` — creates a new Stay. */
export function AddStayPage() {
  return <AddEditStayForm />;
}

/** Route entry for `/stays/$id/edit` — edits the Stay named by the route param. */
export function EditStayPage() {
  const { id } = useParams({ from: "/authed/stays/$id/edit" });
  return <AddEditStayForm stayId={id} />;
}
