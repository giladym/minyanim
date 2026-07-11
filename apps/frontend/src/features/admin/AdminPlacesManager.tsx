import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CreatePlaceInput, PlaceDTO } from "@minyanim/shared";
import { ApiError } from "../../lib/api";
import { LocationPicker, type LocationValue } from "../stays/LocationPicker";
import { useAdminLayers, useAdminPlaces, useCreatePlace, useUpdatePlace, useDeletePlace } from "../../lib/places";
import { Gallery } from "../media/Gallery";
import { ImageUploader } from "../media/ImageUploader";
import { deleteImage } from "../../lib/media";

const field = "w-full rounded-lg border border-line2 bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-primary";
const label = "mb-1.5 block text-sm font-bold text-ink";
const emptyLoc: LocationValue = { city: "", country: "", lat: null, lng: null };

/** Admin: add / edit / delete places and assign each to a layer. */
export function AdminPlacesManager() {
  const { t } = useTranslation();
  const layersQ = useAdminLayers();
  const layers = layersQ.data?.layers ?? [];
  const [filter, setFilter] = useState("");
  const placesQ = useAdminPlaces(filter || undefined);
  const create = useCreatePlace();
  const update = useUpdatePlace();
  const del = useDeletePlace();
  const [editImages, setEditImages] = useState<string[]>([]); // 012: photos of the place being edited

  const [editingId, setEditingId] = useState<string | null>(null);
  const [layerId, setLayerId] = useState("");
  const [name, setName] = useState("");
  const [loc, setLoc] = useState<LocationValue>(emptyLoc);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [dietary, setDietary] = useState("");
  const [err, setErr] = useState("");
  const formRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const layerName = (id: string) => layers.find((l) => l.id === id)?.name ?? id;
  function reset() {
    setEditingId(null); setLayerId(""); setName(""); setLoc(emptyLoc); setAddress(""); setPhone(""); setDietary(""); setErr(""); setEditImages([]);
  }
  function edit(p: PlaceDTO) {
    setEditingId(p.id); setLayerId(p.layerId); setName(p.name);
    setLoc({ city: "", country: "", lat: p.lat, lng: p.lng });
    setAddress(p.address ?? ""); setPhone(p.phone ?? ""); setDietary(p.kosherMeta?.dietary ?? ""); setErr(""); setEditImages(p.images ?? []);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      nameRef.current?.focus();
    });
  }

  async function save() {
    setErr("");
    if (!name.trim() || !layerId || loc.lat == null || loc.lng == null) {
      setErr(t("admin.placeIncomplete"));
      return;
    }
    const input: CreatePlaceInput = {
      layerId, name: name.trim(), lat: loc.lat, lng: loc.lng,
      address: address.trim() || null, phone: phone.trim() || null,
      description: null, hours: null,
      kosherMeta: dietary ? { dietary: dietary as "meat" | "dairy" | "parve" } : null,
    };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input });
      else await create.mutateAsync(input);
      reset();
    } catch (e) {
      setErr(e instanceof ApiError && e.body.errors[0]?.code ? t(`errors.${e.body.errors[0].code}`) : t("auth.error"));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section ref={formRef} className="rounded-2xl border border-line bg-surface p-5">
        <span className="mb-3 block text-xs font-bold uppercase tracking-wide text-faint">
          {editingId ? t("admin.editPlace") : t("admin.newPlace")}
        </span>
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className={label}>{t("admin.placeName")}</span>
            <input ref={nameRef} className={field} value={name} aria-label={t("admin.placeName")} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>{t("admin.placeLayer")}</span>
            <select className={field} value={layerId} aria-label={t("admin.placeLayer")} onChange={(e) => setLayerId(e.target.value)}>
              <option value="">{t("admin.chooseLayer")}</option>
              {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <LocationPicker value={loc} onChange={setLoc} precise />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>{t("admin.placeAddress")}</span>
              <input className={field} value={address} aria-label={t("admin.placeAddress")} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className="block">
              <span className={label}>{t("admin.placePhone")}</span>
              <input className={field} dir="ltr" value={phone} aria-label={t("admin.placePhone")} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className={label}>{t("admin.placeDietary")}</span>
            <select className={field + " sm:max-w-[14rem]"} value={dietary} aria-label={t("admin.placeDietary")} onChange={(e) => setDietary(e.target.value)}>
              <option value="">{t("admin.dietaryNone")}</option>
              <option value="meat">{t("admin.dietaryMeat")}</option>
              <option value="dairy">{t("admin.dietaryDairy")}</option>
              <option value="parve">{t("admin.dietaryParve")}</option>
            </select>
          </label>
          {editingId && (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <span className="text-xs font-bold uppercase tracking-wide text-faint">{t("media.photos")}</span>
              <Gallery
                images={editImages}
                itemName={name}
                onRemove={(ref) => { void deleteImage(ref); setEditImages((xs) => xs.filter((r) => r !== ref)); }}
              />
              <ImageUploader kind="place" parentId={editingId} onUploaded={(ref) => setEditImages((xs) => [...xs, ref])} />
            </div>
          )}
          {err && <p role="alert" className="text-sm font-semibold text-clay-ink">{err}</p>}
          <div className="flex gap-2">
            <button type="button" className="rounded-lg bg-primary px-5 py-2.5 font-extrabold text-on-primary disabled:opacity-50" disabled={create.isPending || update.isPending} onClick={() => void save()}>
              {editingId ? t("admin.save") : t("admin.add")}
            </button>
            {editingId && (
              <button type="button" className="rounded-lg border border-line px-4 py-2.5 font-bold text-muted" onClick={reset}>{t("admin.cancelEdit")}</button>
            )}
          </div>
        </div>
      </section>

      <label className="flex items-center gap-2 text-sm">
        <span className="font-bold text-ink">{t("admin.filterLayer")}</span>
        <select className={field + " max-w-[16rem]"} value={filter} aria-label={t("admin.filterLayer")} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{t("admin.allLayers")}</option>
          {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>

      {placesQ.isLoading && <p className="text-sm text-muted">{t("discovery.loading")}</p>}
      {placesQ.data && placesQ.data.places.length === 0 && <p className="text-sm text-muted">{t("admin.noPlaces")}</p>}
      <ul className="flex flex-col gap-2">
        {placesQ.data?.places.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3.5">
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-bold text-ink">{p.name}</span>
              <span className="text-xs text-muted">{layerName(p.layerId)} · <span dir="ltr">{p.lat.toFixed(3)}, {p.lng.toFixed(3)}</span></span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-primary-ink" onClick={() => edit(p)}>{t("admin.edit")}</button>
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-bold text-clay-ink disabled:opacity-50" disabled={del.isPending} onClick={() => void del.mutateAsync(p.id)}>{t("admin.delete")}</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
