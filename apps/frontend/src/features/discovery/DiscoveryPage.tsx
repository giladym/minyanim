import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch, useNavigate, Link } from "@tanstack/react-router";
import type { GeoResult, Nusach, PublicMinyanDTO, MinyanStatus } from "@minyanim/shared";
import { searchPlaces } from "../../lib/geo";
import { useDiscovery, type DiscoveryParams } from "../../lib/discovery";
import { DiscoveryMap } from "./DiscoveryMap";

/** Epoch-ms → "YYYY-MM-DD" for seeding the date inputs (UTC, matching the date convention). */
function epochToInput(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

const fieldCls =
  "w-full rounded-xl border border-line2 bg-surface px-3.5 py-3 text-ink outline-none transition focus:border-clay";
const labelCls = "mb-1.5 block text-sm font-bold text-ink";

const NUSACHIM: Nusach[] = ["any", "ashkenaz", "sefard", "chabad", "mizrachi"];

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
 * Discovery screen (FR-001, US1): search a city + date range → per-Shabbat potential and the
 * hosted Minyanim in the area, with nusach / Sefer-Torah filters. Requires no Stay of the user's
 * own (D22). The list is the keyboard/parity surface; counts announce via `aria-live`.
 */
export function DiscoveryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.resolvedLanguage === "en" ? "en" : "he";
  // Optional pre-fill from a "Minyanim near this stay" link (FR-019).
  const seed = useSearch({ from: "/authed/discovery" });

  const [query, setQuery] = useState(seed.city ?? "");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number; city: string; country: string } | null>(
    seed.lat != null && seed.lng != null ? { lat: seed.lat, lng: seed.lng, city: seed.city ?? "", country: seed.country ?? "" } : null,
  );
  const [from, setFrom] = useState(seed.from ? epochToInput(seed.from) : "");
  const [to, setTo] = useState(seed.to ? epochToInput(seed.to) : "");
  const [nusach, setNusach] = useState<Nusach | "">("");
  const [seferTorah, setSeferTorah] = useState(false);

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
    return {
      lat: center.lat,
      lng: center.lng,
      city: center.city,
      country: center.country,
      from: f,
      to: to2,
      nusach: nusach || undefined,
      seferTorah: seferTorah || undefined,
    };
  }, [center, from, to, nusach, seferTorah]);

  const { data, isFetching } = useDiscovery(params);

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>{t("discovery.nusach")}</span>
            <select className={fieldCls} value={nusach} aria-label={t("discovery.nusach")} onChange={(e) => setNusach(e.target.value as Nusach | "")}>
              <option value="">{t("discovery.nusachAll")}</option>
              {NUSACHIM.map((n) => (
                <option key={n} value={n}>{t(`nusach.${n}`)}</option>
              ))}
            </select>
          </label>
          <label className="mt-7 flex min-h-[44px] items-center gap-3 text-ink">
            <input type="checkbox" className="h-5 w-5" checked={seferTorah} aria-label={t("discovery.seferTorahFilter")} onChange={(e) => setSeferTorah(e.target.checked)} />
            {t("discovery.seferTorahFilter")}
          </label>
        </div>
      </section>

      {center && !params && (
        <p role="status" className="rounded-xl bg-chip px-4 py-3 text-sm font-semibold text-ink">
          {t("discovery.pickDatesHint")}
        </p>
      )}

      {params && (
        <>
          <section aria-live="polite" className="flex flex-col gap-3">
            <h2 className="text-lg font-extrabold text-ink">{t("discovery.potentialTitle")}</h2>
            {data && data.potential.length === 0 && <p className="text-sm text-muted">{t("discovery.potentialEmpty")}</p>}
            {data?.potential.map((b) => (
              <div key={b.shabbat} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <span className="font-semibold text-ink" dir="ltr">{b.shabbat}</span>
                <span className="text-ink">{t("discovery.potentialMen", { count: b.menCount })}</span>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-extrabold text-ink">{t("discovery.minyanimTitle")}</h2>
            {data && (
              <DiscoveryMap
                center={{ lat: params.lat, lng: params.lng }}
                minyanim={data.minyanim}
                beitChabad={data.beitChabad}
                onSelectMinyan={(id) => void navigate({ to: "/minyan/$id", params: { id } })}
              />
            )}
            {data && data.minyanim.length === 0 && <p className="text-sm text-muted">{t("discovery.minyanimEmpty")}</p>}
            {data?.minyanim.map((m) => <MinyanRow key={m.id} m={m} />)}
            {isFetching && !data && <p className="text-sm text-muted">{t("discovery.loading")}</p>}
          </section>
        </>
      )}
    </div>
  );
}

function MinyanRow({ m }: { m: PublicMinyanDTO }) {
  const { t } = useTranslation();
  const tefillot = m.services.map((s) => t(`tefilla.${s.tefilla}`) + (s.time ? ` ${s.time}` : "")).join(" · ");
  return (
    <Link to="/minyan/$id" params={{ id: m.id }} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 transition hover:border-clay">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-ink">{m.city}, {m.country}</h3>
        <span className={`text-sm font-bold ${STATUS_CLS[m.status]}`}>{t(`minyanStatus.${m.status}`)}</span>
      </div>
      <p className="text-sm text-muted">{t(`nusach.${m.nusach}`)} · {tefillot}</p>
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
