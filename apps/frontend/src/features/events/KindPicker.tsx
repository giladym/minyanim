import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { EVENT_KINDS, type EventKind } from "@minyanim/shared";
import { Icon, type IconName } from "../../components/Icon";

/** The prefill passed through from a Stay/discovery context (kept when advancing to a form). */
export interface PickerContext {
  fromStay?: string;
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
  date?: string;
}

/**
 * Host: kind picker (014, Screen 1). Three large radio cards — מניין first (the flagship, NO
 * "recommended" badge), then אירוח, then מפגש — driven by the shared `EVENT_KINDS` map. Choosing a
 * card advances to the kind-specific form: minyan deep-links to `/minyan/new` (the flagship one-tap
 * flow is preserved), gatherings to `/event/new?kind=`.
 */
export function KindPicker({ ctx }: { ctx: PickerContext }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function pick(kind: EventKind) {
    if (kind === "minyan") {
      void navigate({ to: "/minyan/new", search: ctx });
    } else {
      void navigate({ to: "/event/new", search: { ...ctx, kind } });
    }
  }

  const kinds = Object.keys(EVENT_KINDS) as EventKind[];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5" dir="rtl">
      <h1 className="text-2xl font-extrabold text-ink">{t("eventKind.pickerTitle")}</h1>
      <div role="radiogroup" aria-label={t("eventKind.pickerTitle")} className="flex flex-col gap-3">
        {kinds.map((kind, i) => {
          const meta = EVENT_KINDS[kind];
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={false}
              tabIndex={i === 0 ? 0 : -1}
              onClick={() => pick(kind)}
              className="mn-fadeup flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 text-start shadow-card transition hover:border-primary focus:border-primary focus:outline-none"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-ink">
                <Icon name={meta.icon as IconName} size={26} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-lg font-extrabold text-ink">{t(`eventKind.${kind}`)}</span>
                <span className="text-sm text-muted">{t(`eventKind.${kind}Purpose`)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
