import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import type { FolderDTO, OwnerStayDTO } from "@minyanim/shared";
import { Icon } from "../../components/Icon";
import { useStayZmanim } from "../../lib/zmanim";
import { useProfile } from "../../lib/profile";
import { SceneHeader } from "./SceneHeader";
import { pickHeaderImage } from "./headerImages";
import { ZmanimSection } from "./ZmanimSection";

/** Today at UTC midnight — Stay dates are stored as UTC-midnight civil dates. */
function todayUtc(): number {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/** Format a stored UTC-midnight epoch as a localized civil date (no time-of-day). */
function formatDate(epoch: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(epoch));
}

/** The discovery pre-fill for this Stay (location + date range) — the target of every minyan CTA. */
function discoverySearch(stay: OwnerStayDTO) {
  return {
    lat: stay.lat ?? undefined,
    lng: stay.lng ?? undefined,
    city: stay.city,
    country: stay.country,
    from: stay.arrivalDate,
    to: stay.departureDate,
  };
}

/**
 * A single Stay summary card (Heritage Voyage). Header = a MapTiler thumbnail of the actual place
 * (falls back to a token gradient), with the country + city overlaid. The body carries the dates,
 * an optional folder chip, a `⋮` actions menu, and ONE minyan-status line whose state + CTA depend
 * on the caller's relationship: registered → view · minyanim nearby → join · none → search/organize.
 * A Stay whose dates cover today is emphasized ("here now"). Shabbat times sit in a collapsible
 * panel. Past stays are de-emphasized and action-free.
 */
export function StayCard({
  stay,
  highlighted,
  justSaved,
  onCancel,
  onMove,
  folders,
  nearbyMinyanim,
  committedNearby,
}: {
  stay: OwnerStayDTO;
  highlighted: boolean;
  /** True only for the card just created (flash=saved) — shows the "form a minyan here" promo (#4). */
  justSaved?: boolean;
  onCancel: (id: string) => void;
  /** Reassign this Stay to a folder, or to Unfiled when null (D6). */
  onMove?: (folderId: string | null) => void;
  /** The caller's folders, for the move-to-folder control. */
  folders?: FolderDTO[];
  /** Count of hosted minyanim near this stay (FR-019); undefined while loading. */
  nearbyMinyanim?: number;
  /** Whether the user is already committed to a minyan at this stay's place/time. */
  committedNearby?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "he";
  const [showZmanim, setShowZmanim] = useState(false);
  const [promoDismissed, setPromoDismissed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const { data: profile } = useProfile();
  const zmanimQuery = useStayZmanim(stay.id, showZmanim);
  const showPromo = !!justSaved && !promoDismissed && !stay.isPast;
  const isCurrent = !stay.isPast && stay.arrivalDate <= todayUtc() && todayUtc() <= stay.departureDate;
  const folder = folders?.find((f) => f.id === stay.folderId);

  return (
    <article
      data-testid="stay-card"
      data-stay-id={stay.id}
      className={
        // No overflow-hidden here: it would clip the ⋮ actions dropdown. The header image is clipped
        // by HeaderShell's own rounded-t-2xl overflow-hidden instead.
        "rounded-2xl bg-surface shadow-card transition " +
        (isCurrent ? "border-2 border-primary " : "border border-line ") +
        (highlighted ? "ring-2 ring-clay " : "") +
        (stay.isPast ? "opacity-60" : "")
      }
    >
      {/* Header — a curated photo over an on-brand scene fallback; tapping it opens the location.
          The photo is decorative (not the literal place) and picked deterministically per stay;
          if it fails to load, the SceneHeader shows through. */}
      <HeaderShell stay={stay} label={`${stay.city}, ${stay.country}`}>
        <SceneHeader seed={stay.id + stay.city} />
        {!imgFailed && (
          <img
            src={pickHeaderImage(stay.id + stay.city, stay.lat, stay.lng)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
        <span className="absolute top-2.5 start-3 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-extrabold text-primary-ink backdrop-blur">
          <Icon name="map-pin" size={13} />
          {stay.country}
        </span>
        {isCurrent && (
          <span className="absolute bottom-2.5 start-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-on-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-ink" />
            {t("stays.current")}
          </span>
        )}
        {/* Card title as a real heading (accessible landmark for each card); the visible text is the
            city, the accessible name pairs it with the country for screen readers + tests. */}
        <h2 aria-label={`${stay.city}, ${stay.country}`} className="absolute bottom-2.5 end-3.5 text-xl font-extrabold text-white drop-shadow">{stay.city}</h2>
      </HeaderShell>

      <div className="p-4">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm text-muted">
              <Icon name="calendar" size={17} className="text-faint" />
              {formatDate(stay.arrivalDate, locale)} – {formatDate(stay.departureDate, locale)}
            </p>
            {folder && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted">
                {folder.name}
              </span>
            )}
          </div>
          {!stay.isPast && <CardMenu stay={stay} onCancel={onCancel} onMove={onMove} folders={folders} />}
        </div>

        {!stay.isPast && <MinyanStatus stay={stay} nearbyMinyanim={nearbyMinyanim} committedNearby={committedNearby} />}

        {stay.coversShabbat && (
          <div className="mt-4 rounded-xl border border-line bg-chip p-1">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2.5 text-start text-sm font-extrabold text-primary-ink"
              aria-expanded={showZmanim}
              onClick={() => setShowZmanim((v) => !v)}
            >
              {t("stays.shabbatTimes")}
              <span aria-hidden>{showZmanim ? "−" : "+"}</span>
            </button>
            {showZmanim && (
              <div className="px-3 pb-2">
                <ZmanimSection
                  data={zmanimQuery.data}
                  isLoading={zmanimQuery.isLoading}
                  isError={zmanimQuery.isError}
                  havdalahOpinion={profile?.havdalahOpinion ?? "geonim"}
                  addLocationSlot={
                    <Link to="/stays/$id/edit" params={{ id: stay.id }} className="font-bold text-primary-ink">
                      {t("zmanim.addLocationCta")}
                    </Link>
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>

      {showPromo && (
        <div className="mx-4 mb-4 border-t border-dashed border-line2 pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-primary-ink">
            <Icon name="check" size={16} />{t("stays.minyanPromo.saved")}
          </p>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-extrabold text-ink">{t("stays.minyanPromo.q")}</p>
            <button
              type="button"
              className="text-sm font-bold text-muted"
              aria-label={t("stays.minyanPromo.dismiss")}
              onClick={() => setPromoDismissed(true)}
            >
              ×
            </button>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/minyan/new" search={{ fromStay: stay.id }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-on-primary">
              {t("stays.minyanPromo.host")}
            </Link>
            <Link to="/discovery" search={discoverySearch(stay)} className="rounded-xl border border-primary px-4 py-2.5 text-sm font-extrabold text-primary-ink">
              {t("stays.minyanPromo.find")}
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}

/** Card header wrapper: tappable (→ open/edit the location) for active stays; static for past ones.
 * Uses a Link (not a whole-card <a>) so the inner status line / ⋮ menu stay independently clickable
 * without nesting anchors. */
function HeaderShell({ stay, label, children }: { stay: OwnerStayDTO; label: string; children: ReactNode }) {
  const cls = "relative block h-28 w-full overflow-hidden rounded-t-2xl";
  if (stay.isPast) return <div className={cls}>{children}</div>;
  return (
    <Link to="/stays/$id/edit" params={{ id: stay.id }} className={cls} aria-label={label}>
      {children}
    </Link>
  );
}

/** The single minyan-status line: registered → view · nearby → join · none → search/organize. */
function MinyanStatus({ stay, nearbyMinyanim, committedNearby }: { stay: OwnerStayDTO; nearbyMinyanim?: number; committedNearby?: boolean }) {
  const { t } = useTranslation();
  const base = "flex items-center justify-between gap-2.5 rounded-xl px-3.5 py-3 text-sm font-bold";
  const search = discoverySearch(stay);

  if (committedNearby) {
    return (
      <Link to="/discovery" search={search} className={base + " bg-primary-soft text-primary-ink"}>
        <span className="flex items-center gap-2"><Icon name="check" size={17} />{t("stays.registeredHere")}</span>
        <span className="whitespace-nowrap">{t("stays.viewMinyan")} ›</span>
      </Link>
    );
  }
  if (nearbyMinyanim && nearbyMinyanim > 0) {
    return (
      <Link to="/discovery" search={search} className={base + " border border-line bg-chip text-ink"}>
        <span className="flex items-center gap-2 text-primary-ink"><Icon name="users" size={17} />{t("stays.nearbyMinyanim", { count: nearbyMinyanim })}</span>
        <span className="whitespace-nowrap text-primary-ink">{t("stays.joinCta")} ›</span>
      </Link>
    );
  }
  return (
    <Link to="/discovery" search={search} className={base + " justify-center border border-dashed border-line2 text-faint"}>
      <span className="flex items-center gap-2"><Icon name="search" size={17} />{t("stays.noMinyanYet")}</span>
    </Link>
  );
}

/** The card's `⋮` actions menu (native <details> disclosure): edit · search · organize · move · cancel. */
function CardMenu({ stay, onCancel, onMove, folders }: { stay: OwnerStayDTO; onCancel: (id: string) => void; onMove?: (folderId: string | null) => void; folders?: FolderDTO[] }) {
  const { t } = useTranslation();
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start text-sm font-bold text-ink hover:bg-chip";
  return (
    <details className="group relative shrink-0">
      <summary className="flex h-9 w-9 list-none items-center justify-center rounded-[10px] border border-line text-muted [&::-webkit-details-marker]:hidden" aria-label={t("stays.moreActions")}>
        <Icon name="more" size={18} />
      </summary>
      <div className="absolute top-11 end-0 z-20 max-h-[70vh] w-56 max-w-[80vw] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-card">
        <Link to="/stays/$id/edit" params={{ id: stay.id }} className={item}><Icon name="calendar" size={16} className="text-faint" />{t("stays.edit")}</Link>
        <div className="my-1 h-px bg-line" />
        <Link to="/discovery" search={discoverySearch(stay)} className={item}><Icon name="search" size={16} className="text-faint" />{t("stays.findMinyanim")}</Link>
        <Link to="/minyan/new" search={{ fromStay: stay.id }} className={item}><Icon name="users" size={16} className="text-faint" />{t("stays.organizeMinyan")}</Link>
        <Link to="/places" search={{ lat: stay.lat ?? undefined, lng: stay.lng ?? undefined, city: stay.city }} className={item}><Icon name="map-pin" size={16} className="text-faint" />{t("stays.kosherPlaces")}</Link>
        {onMove && folders && folders.length > 0 && (
          <label className={item + " cursor-pointer"}>
            <Icon name="map-pin" size={16} className="text-faint" />
            <select
              className="w-full bg-transparent font-bold text-ink outline-none"
              aria-label={t("folders.moveTo")}
              value={stay.folderId ?? ""}
              onChange={(e) => onMove(e.target.value || null)}
            >
              <option value="">{t("folders.unfiled")}</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}
        <div className="my-1 h-px bg-line" />
        <button type="button" className={item.replace("text-ink", "text-clay-ink")} onClick={() => onCancel(stay.id)}>
          <Icon name="close" size={16} className="text-clay-ink" />{t("stays.cancelStay")}
        </button>
      </div>
    </details>
  );
}
