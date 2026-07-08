import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useClaimableSeeds, useClaimSeeds } from "../../lib/claims";

/**
 * Post-import claim prompt (F4). When the signed-in user's phone matches one or more imported
 * "seed" people, offer to merge those trips/minyanim into their account. Dismissible; shown on the
 * dashboard since that's where the claimed trips will land. Merges all matches on confirm.
 */
export function ClaimBanner() {
  const { t } = useTranslation();
  const { data } = useClaimableSeeds();
  const claim = useClaimSeeds();
  const [dismissed, setDismissed] = useState(false);

  const seeds = data?.seeds ?? [];
  if (dismissed || seeds.length === 0) return null;

  const stays = seeds.reduce((n, s) => n + s.stays, 0);
  const events = seeds.reduce((n, s) => n + s.events, 0);

  return (
    <section className="mn-fadeup rounded-2xl border-[1.5px] border-primary-container bg-primary-soft p-4">
      <p className="font-extrabold text-primary">{t("claim.title")}</p>
      <p className="mt-1 text-sm text-muted">{t("claim.body", { stays, events })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={claim.isPending}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-on-primary disabled:opacity-60"
          onClick={() => claim.mutate(seeds.map((s) => s.seedUserId))}
        >
          {t("claim.confirm")}
        </button>
        <button type="button" className="rounded-xl px-3 py-2.5 text-sm font-bold text-muted" onClick={() => setDismissed(true)}>
          {t("claim.dismiss")}
        </button>
      </div>
      {claim.isError && <p role="alert" className="mt-2 text-sm font-semibold text-clay-ink">{t("auth.error")}</p>}
    </section>
  );
}
