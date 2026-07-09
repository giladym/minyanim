import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LayerDTO } from "@minyanim/shared";
import { ApiError } from "../../lib/api";
import { useAdminLayers, useCreateLayer, useUpdateLayer, useDeleteLayer } from "../../lib/places";

const field = "w-full rounded-lg border border-line2 bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-primary";
const errMsg = (t: (k: string) => string, e: unknown) =>
  e instanceof ApiError && e.body.errors[0]?.code ? t(`errors.${e.body.errors[0].code}`) : t("auth.error");

/** Admin: manage the map layers (create / rename / reorder / retire / delete). */
export function AdminLayersManager() {
  const { t } = useTranslation();
  const { data, isLoading } = useAdminLayers();
  const create = useCreateLayer();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [err, setErr] = useState("");

  async function add() {
    setErr("");
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), icon: icon.trim() || null });
      setName("");
      setIcon("");
    } catch (e) {
      setErr(errMsg(t, e));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <span className="mb-3 block text-xs font-bold uppercase tracking-wide text-faint">{t("admin.newLayer")}</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={field} value={name} aria-label={t("admin.layerName")} placeholder={t("admin.layerName")} onChange={(e) => setName(e.target.value)} />
          <input className={field + " sm:max-w-[10rem]"} value={icon} aria-label={t("admin.layerIcon")} placeholder={t("admin.layerIcon")} onChange={(e) => setIcon(e.target.value)} />
          <button type="button" className="shrink-0 rounded-lg bg-primary px-5 py-2.5 font-extrabold text-on-primary disabled:opacity-50" disabled={create.isPending || !name.trim()} onClick={() => void add()}>
            {t("admin.add")}
          </button>
        </div>
        {err && <p role="alert" className="mt-2 text-sm font-semibold text-clay-ink">{err}</p>}
      </section>

      {isLoading && <p className="text-sm text-muted">{t("discovery.loading")}</p>}
      {data && data.layers.length === 0 && <p className="text-sm text-muted">{t("admin.noLayers")}</p>}
      <ul className="flex flex-col gap-2">
        {data?.layers.map((l) => <LayerRow key={l.id} layer={l} />)}
      </ul>
    </div>
  );
}

function LayerRow({ layer }: { layer: LayerDTO }) {
  const { t } = useTranslation();
  const update = useUpdateLayer();
  const del = useDeleteLayer();
  const [name, setName] = useState(layer.name);
  const [order, setOrder] = useState(layer.displayOrder);
  const [err, setErr] = useState("");
  const dirty = name.trim() !== layer.name || order !== layer.displayOrder;

  async function run(fn: () => Promise<unknown>) {
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(t, e));
    }
  }

  return (
    <li className={"flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 " + (layer.active ? "" : "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <input className={field + " flex-1"} value={name} aria-label={t("admin.layerName")} onChange={(e) => setName(e.target.value)} />
        <input type="number" min={0} className={field + " w-20"} value={order} aria-label={t("admin.layerOrder")} onChange={(e) => setOrder(Math.max(0, Math.floor(Number(e.target.value)) || 0))} />
        {!layer.active && <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted">{t("admin.retired")}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {dirty && (
          <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-on-primary disabled:opacity-50" disabled={update.isPending || !name.trim()} onClick={() => void run(() => update.mutateAsync({ id: layer.id, input: { name: name.trim(), displayOrder: order } }))}>
            {t("admin.save")}
          </button>
        )}
        <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-muted disabled:opacity-50" disabled={update.isPending} onClick={() => void run(() => update.mutateAsync({ id: layer.id, input: { active: !layer.active } }))}>
          {layer.active ? t("admin.retire") : t("admin.activate")}
        </button>
        <button type="button" className="rounded-lg px-3 py-2 text-sm font-bold text-clay-ink disabled:opacity-50" disabled={del.isPending} onClick={() => void run(() => del.mutateAsync(layer.id))}>
          {t("admin.delete")}
        </button>
      </div>
      {err && <p role="alert" className="text-sm font-semibold text-clay-ink">{err}</p>}
    </li>
  );
}
