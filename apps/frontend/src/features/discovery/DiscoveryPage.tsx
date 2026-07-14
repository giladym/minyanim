import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch, useNavigate, Link } from "@tanstack/react-router";
import {
  EVENT_KINDS,
  OccasionSchema,
  type EventKind,
  type GeoResult,
  type Nusach,
  type Occasion,
  type PublicEventDTO,
  type PublicMinyanDTO,
  type PublicGatheringDTO,
  type HostingAttrs,
  type SocialAttrs,
  type MinyanStatus,
} from "@minyanim/shared";
import { searchPlaces } from "../../lib/geo";
import { useDiscovery, type DiscoveryParams } from "../../lib/discovery";
import { DiscoveryMap } from "./DiscoveryMap";
import { KosherPlacesCard } from "../places/KosherPlacesCard";
import { layerLabel, defaultHiddenLayerIds } from "../../lib/layerLabel";
import { Icon, type IconName } from "../../components/Icon";

/** Epoch-ms → "YYYY-MM-DD" for seeding the date inputs (UTC, matching the date convention). */
function epochToInput(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

const fieldCls =
  "w-full rounded-xl border border-line2 bg-surface px-3.5 py-3 text-ink outline-none transition focus:border-primary";
const labelCls = "mb-1.5 block text-sm font-bold text-ink";

const NUSACHIM: Nusach[] = ["any", "ashkenaz", "sefard", "chabad", "mizrachi"];

/** The kind filter selection: "all" (flagship "see everything") or one of the shared event kinds. */
type KindFilter = EventKind | "all";
const KIND_ORDER: KindFilter[] = ["all", "minyan", "hosting", "social"];

/** Per-kind chip chrome — icon + the accent (fill) shown when the chip is active (NOT color-only:
 * each carries its icon). minyan → --primary, hosting → --clay, social → --sky (design/ux Screen 6). */
const KIND_CHIP: Record<EventKind, { icon: IconName; activeCls: string; labelKey: string }> = {
  minyan: { icon: "star-of-david", activeCls: "bg-primary text-on-primary", labelKey: "eventKind.minyan" },
  hosting: { icon: "utensils", activeCls: "bg-clay text-on-clay", labelKey: "eventKind.hostingChip" },
  social: { icon: "sparkles", activeCls: "bg-sky text-on-sky", labelKey: "eventKind.social" },
};

/** Kind-aware results heading + empty-state keys. */
const HEADING_KEY: Record<KindFilter, string> = {
  all: "discovery.eventsTitle",
  minyan: "discovery.minyanimTitle",
  hosting: "discovery.hostingTitle",
  social: "discovery.socialTitle",
};
const EMPTY_KEY: Record<KindFilter, string> = {
  all: "discovery.eventsEmpty",
  minyan: "discovery.minyanimEmpty",
  hosting: "discovery.hostingEmpty",
  social: "discovery.socialEmpty",
};

/** Civil "YYYY-MM-DD" → epoch-ms at UTC midnight (matches the server date convention). */
function dateToEpoch(v: string): number {
  return v ? Date.parse(`${v}T00:00:00.000Z`) : Number.NaN;
}

/** Status → design-token text color. */
const STATUS_CLS: Record<MinyanStatus, string> = {
  ready: "text-teal-ink",
  "quorum-reached": "text-teal-ink",
  forming: "text-clay-ink",
  completed: "text-muted",
  cancelled: "text-muted",
};

/**
 * Discovery screen (FR-001). Generalized in 014 (US2) to surface ALL event kinds — minyanim,
 * hosting (seudah) gatherings and social gatherings — with a **kind filter** (chips) + an
 * **occasion** filter. The nusach / Sefer-Torah sub-filters show only when Minyanim are in scope.
 * Arriving from a minyan-specific entry point (`?kind=minyan`, e.g. a Stay's "search minyanim")
 * pre-applies the Minyanim chip; general discovery defaults to All. Requires no Stay of the user's
 * own (D22). The list is the keyboard/parity surface; counts announce via `aria-live`.
 */
export function DiscoveryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.resolvedLanguage === "en" ? "en" : "he";
  // Optional pre-fill from a "Minyanim near this stay" link (FR-019) + a minyan-context kind hint.
  const seed = useSearch({ from: "/authed/discovery" });

  const [query, setQuery] = useState(seed.city ?? "");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number; city: string; country: string } | null>(
    seed.lat != null && seed.lng != null ? { lat: seed.lat, lng: seed.lng, city: seed.city ?? "", country: seed.country ?? "" } : null,
  );
  const [from, setFrom] = useState(seed.from ? epochToInput(seed.from) : "");
  const [to, setTo] = useState(seed.to ? epochToInput(seed.to) : "");
  // A minyan-specific entry point pre-applies the Minyanim chip (US2 loop decision); else "all".
  const [kind, setKind] = useState<KindFilter>(seed.kind === "minyan" ? "minyan" : "all");
  const [occasion, setOccasion] = useState<Occasion | "">("");
  const [nusach, setNusach] = useState<Nusach | "">("");
  const [seferTorah, setSeferTorah] = useState(false);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set()); // toggled-off place layers

  // Minyan sub-filters (nusach/seferTorah) apply only when minyanim can appear (All or Minyanim).
  const minyanInScope = kind === "all" || kind === "minyan";

  // Debounced city search (reuses the 002 geo proxy).
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchPlaces(query.trim(), lang)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, lang]);

  const params: DiscoveryParams | null = useMemo(() => {
    if (!center) return null;
    const f = dateToEpoch(from);
    const to2 = dateToEpoch(to);
    if (!Number.isFinite(f) || !Number.isFinite(to2)) return null;
    // Map the active kind chip → the shared types/categories params (EVENT_KINDS is the SoT).
    const kindMeta = kind === "all" ? null : EVENT_KINDS[kind];
    return {
      lat: center.lat,
      lng: center.lng,
      city: center.city,
      country: center.country,
      from: f,
      to: to2,
      types: kindMeta ? [kindMeta.type] : undefined,
      categories: kindMeta?.category ? [kindMeta.category] : undefined,
      occasion: occasion || undefined,
      // Minyan-only sub-filters are sent only while minyanim are in scope.
      nusach: minyanInScope ? nusach || undefined : undefined,
      seferTorah: minyanInScope ? seferTorah || undefined : undefined,
    };
  }, [center, from, to, kind, occasion, nusach, seferTorah, minyanInScope]);

  const { data, isFetching } = useDiscovery(params);

  // Seed the place-layer toggles once layers first load: only kosher restaurants + shops start ON;
  // every other layer (Chabad houses, synagogues, mikvehs…) starts OFF. Applied once so the user's
  // later toggles stick.
  const layerDefaultsApplied = useRef(false);
  useEffect(() => {
    const ls = data?.layers ?? [];
    if (layerDefaultsApplied.current || ls.length === 0) return;
    layerDefaultsApplied.current = true;
    setHiddenLayers(defaultHiddenLayerIds(ls));
  }, [data?.layers]);

  // Places (Chabad houses + any other active layer) filtered by the per-layer toggles.
  const visiblePlaces = useMemo(
    () => (data?.places ?? []).filter((p) => !hiddenLayers.has(p.layerId)),
    [data?.places, hiddenLayers],
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5" dir="rtl">
      <h1 className="text-2xl font-extrabold text-ink">{t("discovery.title")}</h1>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
        <label className="block">
          <span className={labelCls}>{t("discovery.searchLabel")}</span>
          <input
            type="search"
            className={fieldCls}
            value={query}
            aria-label={t("discovery.searchLabel")}
            placeholder={t("discovery.searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {results.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-1.5">
            {results.map((r) => (
              <li key={r.label}>
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-3 text-start text-ink hover:bg-chip"
                  onClick={() => {
                    setCenter({ lat: r.lat, lng: r.lng, city: r.city, country: r.country });
                    setQuery(r.label);
                    setResults([]);
                  }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {center && (
          <p className="text-sm font-semibold text-teal-ink">
            {t("discovery.selected")}: {center.city}, {center.country}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>{t("discovery.fromDate")}</span>
            <input type="date" className={fieldCls} value={from} aria-label={t("discovery.fromDate")} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelCls}>{t("discovery.toDate")}</span>
            <input type="date" className={fieldCls} value={to} min={from || undefined} aria-label={t("discovery.toDate")} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        {/* Kind filter (014 US2): chips map to the shared types/categories params. */}
        <div>
          <span className={labelCls}>{t("discovery.kindFilter")}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("discovery.kindFilter")}>
            {KIND_ORDER.map((k) => {
              const on = kind === k;
              const chip = k === "all" ? null : KIND_CHIP[k];
              const label = k === "all" ? t("discovery.kindAll") : t(chip!.labelKey);
              const activeCls = k === "all" ? "bg-ink text-surface" : chip!.activeCls;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  className={"inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold " + (on ? activeCls : "border border-line text-muted")}
                  onClick={() => setKind(k)}
                >
                  {chip && <Icon name={chip.icon} size={16} />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>{t("occasion.label")}</span>
            <select className={fieldCls} value={occasion} aria-label={t("occasion.label")} onChange={(e) => setOccasion(e.target.value as Occasion | "")}>
              <option value="">{t("discovery.occasionAll")}</option>
              {OccasionSchema.options.map((o) => (
                <option key={o} value={o}>{t(`occasion.${o}`)}</option>
              ))}
            </select>
          </label>
          {/* nusach + Sefer-Torah collapse when minyanim are out of scope (minyan-only sub-filters). */}
          {minyanInScope && (
            <label className="block">
              <span className={labelCls}>{t("discovery.nusach")}</span>
              <select className={fieldCls} value={nusach} aria-label={t("discovery.nusach")} onChange={(e) => setNusach(e.target.value as Nusach | "")}>
                <option value="">{t("discovery.nusachAll")}</option>
                {NUSACHIM.map((n) => (
                  <option key={n} value={n}>{t(`nusach.${n}`)}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {minyanInScope && (
          <label className="flex min-h-[44px] items-center gap-3 text-ink">
            <input type="checkbox" className="h-5 w-5" checked={seferTorah} aria-label={t("discovery.seferTorahFilter")} onChange={(e) => setSeferTorah(e.target.checked)} />
            {t("discovery.seferTorahFilter")}
          </label>
        )}
      </section>

      {/* Kosher places are day-to-day (not Shabbat-gated): the moment a location is picked — before
          any dates — offer the prefilled places entry. Once dates load the dated results below, the
          titled "Jewish places in the area" section takes over, so this only shows pre-dates. */}
      {center && !params && (
        <KosherPlacesCard lat={center.lat} lng={center.lng} city={center.city} country={center.country} />
      )}

      {center && !params && (
        <p role="status" className="rounded-xl bg-chip px-4 py-3 text-sm font-semibold text-ink">
          {t("discovery.pickDatesHint")}
        </p>
      )}

      {params && (
        <>
          {/* PRIMARY: events you can join/attend here (clickable → detail). The empty state sits
              directly under the heading so "nothing here yet" is unambiguous — it is NOT swallowed by
              the map or mistaken for the (separately titled) places below. The heading + empty copy
              are kind-aware (All → "happening in the area"; only Minyanim → "Minyanim"). */}
          <section aria-live="polite" className="flex flex-col gap-3">
            <h2 className="text-lg font-extrabold text-ink">{t(HEADING_KEY[kind])}</h2>
            {isFetching && !data && <p className="text-sm text-muted">{t("discovery.loading")}</p>}
            {data && data.events.length === 0 && (
              <p className="text-sm text-muted">{t(EMPTY_KEY[kind])}</p>
            )}
            {data?.events.map((e) => <EventRow key={e.id} e={e} />)}
          </section>

          {/* SECONDARY: Jewish places of interest (synagogues, kosher, cemeteries, Chabad…) — their
              OWN titled section so it's clear the chips + map pins are places, not events. The map
              still overlays event pins for geographic context. */}
          {data && (data.places.length > 0 || data.layers.length > 0) && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-extrabold text-ink">{t("discovery.placesTitle")}</h2>
              {data.layers.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("discovery.placeLayers")}>
                  {data.layers.map((l) => {
                    const on = !hiddenLayers.has(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        aria-pressed={on}
                        className={"rounded-full px-3 py-1.5 text-sm font-bold " + (on ? "bg-primary text-on-primary" : "border border-line text-muted")}
                        onClick={() => setHiddenLayers((s) => { const n = new Set(s); if (on) n.add(l.id); else n.delete(l.id); return n; })}
                      >
                        {layerLabel(l, t)}
                      </button>
                    );
                  })}
                </div>
              )}
              <DiscoveryMap
                center={{ lat: params.lat, lng: params.lng }}
                events={data.events}
                places={visiblePlaces}
                layers={data.layers}
                onSelectEvent={(e) =>
                  void navigate(e.type === "minyan" ? { to: "/minyan/$id", params: { id: e.id } } : { to: "/event/$id", params: { id: e.id } })
                }
              />
            </section>
          )}

          {/* SECONDARY: travelers in the area (potential) — an opportunity to host, not a join list. */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-extrabold text-ink">{t("discovery.potentialTitle")}</h2>
            <p className="text-sm text-muted">{t("discovery.potentialHint")}</p>
            {data && data.potential.length === 0 && <p className="text-sm text-muted">{t("discovery.potentialEmpty")}</p>}
            {data?.potential.map((b) => (
              <div key={b.shabbat} className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink" dir="ltr">{b.shabbat}</span>
                  <span className="text-ink">{t("discovery.potentialMen", { count: b.menCount })}</span>
                  <Link
                    to="/minyan/new"
                    search={{ lat: center!.lat, lng: center!.lng, city: center!.city, country: center!.country, date: b.shabbat, nearby: b.menCount }}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-on-primary"
                  >
                    {t("discovery.hostCta")}
                  </Link>
                </div>
                {b.travelers && b.travelers.length > 0 && (
                  <ul className="flex flex-col gap-2 border-t border-line pt-3">
                    {b.travelers.map((tr, i) => (
                      <li key={`${b.shabbat}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-ink">{tr.name} · {t("stays.men", { count: tr.numMen })}</span>
                        {tr.phone ? (
                          <span className="flex gap-2">
                            <a className="inline-flex items-center rounded-lg bg-whatsapp px-3 py-1.5 text-xs font-bold text-on-whatsapp" href={`https://wa.me/${tr.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" aria-label={`${t("minyanDetail.contactWhatsapp")} — ${tr.name}`}>
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
                )}
              </div>
            ))}
            {data && data.potential.length === 0 && (
              <Link to="/minyan/new" className="self-start rounded-xl border border-clay px-4 py-2.5 text-sm font-bold text-clay">
                {t("discovery.hostCta")}
              </Link>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** One discovery result row — branches on the event's behavior (minyan vs gathering). */
function EventRow({ e }: { e: PublicEventDTO }) {
  return e.type === "minyan" ? <MinyanRow m={e} /> : <GatheringRow g={e} />;
}

function MinyanRow({ m }: { m: PublicMinyanDTO }) {
  const { t } = useTranslation();
  const tefillot = m.services.map((s) => t(`tefilla.${s.tefilla}`) + (s.time ? ` ${s.time}` : "")).join(" · ");
  return (
    <Link to="/minyan/$id" params={{ id: m.id }} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 transition hover:border-clay">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-extrabold text-ink">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink"><Icon name="star-of-david" size={15} /></span>
          {m.city}, {m.country}
          {m.viewerIsHost && (
            <span className="ms-2 rounded-full bg-clay-soft px-2 py-0.5 text-xs font-bold text-clay-ink">{t("discovery.yourMinyan")}</span>
          )}
        </h3>
        <span className={`text-sm font-bold ${STATUS_CLS[m.status]}`}>{t(`minyanStatus.${m.status}`)}</span>
      </div>
      <p className="text-sm text-muted">{t(`nusach.${m.nusach}`)} · {tefillot}</p>
      <span className="text-sm font-bold text-clay">{t(m.viewerIsHost ? "discovery.manageCta" : "discovery.joinCta")} ›</span>
      <p className="text-sm font-semibold text-ink">
        {t("discovery.committed", { count: m.committedMen })}
        {m.missingForReady.menShort > 0 && ` — ${t("discovery.moreNeeded", { count: m.missingForReady.menShort })}`}
      </p>
      {(m.missingForReady.seferTorah || m.missingForReady.baalKorei) && (
        <p className="text-sm text-clay-ink">
          {t("discovery.missing")}: {[m.missingForReady.seferTorah && t("discovery.seferTorah"), m.missingForReady.baalKorei && t("roles.baal_korei")].filter(Boolean).join(", ")}
        </p>
      )}
      {m.notes && <p className="text-sm text-muted">{m.notes}</p>}
    </Link>
  );
}

/** A gathering (hosting / social) row → the generic /event/$id detail. Carries its kind icon+accent,
 * a qualified kind badge (hosting is never bare "אירוח" — it's suffixed with the meal type), an
 * occasion chip, and a per-kind one-liner (hosting: seats at the table; social: subcategory). */
function GatheringRow({ g }: { g: PublicGatheringDTO }) {
  const { t } = useTranslation();
  const isHosting = g.category === "hosting";
  const icon: IconName = isHosting ? "utensils" : "sparkles";
  const iconChip = isHosting ? "bg-clay-soft text-clay-ink" : "bg-sky-soft text-sky-ink";
  const hover = isHosting ? "hover:border-clay" : "hover:border-sky";
  const title = g.title ?? `${g.city}, ${g.country}`;

  // Kind badge — hosting is always qualified with the meal type (ux Screen 6); social = the kind.
  const badge = isHosting
    ? `${t("eventKind.hosting")} · ${t(`hosting.mealType.${(g.attrs as HostingAttrs).mealType}`)}`
    : t("eventKind.social");

  // Per-kind one-liner.
  const oneLiner = isHosting
    ? g.seatsRemaining == null
      ? t("hosting.guestsConfirmed", { count: g.confirmedCount })
      : g.seatsRemaining > 0
        ? t("hosting.seatsLeft", { count: g.seatsRemaining })
        : t("hosting.seatsFull")
    : t(`social.subcategory.${(g.attrs as SocialAttrs).subcategory}`);

  return (
    <Link to="/event/$id" params={{ id: g.id }} className={"flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 transition " + hover}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-extrabold text-ink">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${iconChip}`}><Icon name={icon} size={15} /></span>
          {title}
          {g.viewerIsHost && (
            <span className="ms-2 rounded-full bg-clay-soft px-2 py-0.5 text-xs font-bold text-clay-ink">{t("discovery.yourEvent")}</span>
          )}
        </h3>
        <span className="text-sm font-bold text-muted">{t(`gatheringStatus.${g.status}`)}</span>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="font-bold text-ink">{badge}</span>
        {g.occasion && g.occasion !== "none" && (
          <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-bold text-muted">{t(`occasion.${g.occasion}`)}</span>
        )}
      </p>
      <p className="text-sm font-semibold text-ink">{oneLiner}</p>
      {g.notes && <p className="text-sm text-muted">{g.notes}</p>}
    </Link>
  );
}
