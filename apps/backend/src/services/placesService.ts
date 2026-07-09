import { ERROR_CODES } from "@minyanim/shared";
import type {
  CreateLayerInput,
  CreatePlaceInput,
  LayerDTO,
  PlaceDTO,
  UpdateLayerInput,
  UpdatePlaceInput,
} from "@minyanim/shared";
import type { Db } from "../db/client";
import { AppError, NotFound } from "../lib/errors";
import {
  countPlacesInLayer,
  deleteLayerRow,
  deletePlaceRow,
  insertLayer,
  insertPlace,
  layerExists,
  listLayers,
  listPlaces,
  updateLayerRow,
  updatePlaceRow,
  type LayerRow,
  type PlaceRow,
} from "../repositories/placesRepository";

/** UNIQUE-constraint detector (drizzle wraps the D1 error; the text lives down the cause chain). */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (/UNIQUE constraint failed/i.test(msg)) return true;
    cur = cur instanceof Error ? cur.cause : undefined;
  }
  return false;
}

export function toLayerDTO(r: LayerRow): LayerDTO {
  return { id: r.id, name: r.name, icon: r.icon, displayOrder: r.displayOrder, active: r.active };
}

/** The admin/full projection of a place (source/license stay internal; attribution is public). */
export function toPlaceDTO(r: PlaceRow): PlaceDTO {
  return {
    id: r.id, layerId: r.layerId, name: r.name, description: r.description, lat: r.lat, lng: r.lng,
    address: r.address, phone: r.phone, hours: r.hours, images: r.images ?? [],
    kosherMeta: r.kosherMeta ?? null, attribution: r.attribution,
  };
}

// ── Layers ────────────────────────────────────────────────────────────────
export async function getLayers(db: Db): Promise<LayerDTO[]> {
  return (await listLayers(db)).map(toLayerDTO);
}

export async function createLayer(db: Db, input: CreateLayerInput): Promise<LayerDTO> {
  try {
    const row = await insertLayer(db, {
      name: input.name,
      icon: input.icon ?? null,
      displayOrder: input.displayOrder ?? 0,
    });
    return toLayerDTO(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(400, ERROR_CODES.LAYER_NAME_TAKEN, "name");
    throw err;
  }
}

export async function updateLayer(db: Db, id: string, input: UpdateLayerInput): Promise<LayerDTO> {
  try {
    const row = await updateLayerRow(db, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.icon !== undefined ? { icon: input.icon ?? null } : {}),
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    });
    if (!row) throw NotFound();
    return toLayerDTO(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(400, ERROR_CODES.LAYER_NAME_TAKEN, "name");
    throw err;
  }
}

/** Delete a layer — refused while it still has places (retire it instead). */
export async function deleteLayer(db: Db, id: string): Promise<void> {
  if ((await countPlacesInLayer(db, id)) > 0) throw new AppError(400, ERROR_CODES.LAYER_HAS_PLACES, "id");
  if (!(await deleteLayerRow(db, id))) throw NotFound();
}

// ── Places ──────────────────────────────────────────────────────────────
export async function getPlaces(db: Db, layerId?: string): Promise<PlaceDTO[]> {
  return (await listPlaces(db, layerId)).map(toPlaceDTO);
}

export async function createPlace(db: Db, input: CreatePlaceInput): Promise<PlaceDTO> {
  if (!(await layerExists(db, input.layerId))) throw new AppError(400, ERROR_CODES.RESOURCE_NOT_FOUND, "layerId");
  const row = await insertPlace(db, {
    layerId: input.layerId, name: input.name, description: input.description ?? null,
    lat: input.lat, lng: input.lng, address: input.address ?? null, phone: input.phone ?? null,
    hours: input.hours ?? null, images: input.images ?? null, kosherMeta: input.kosherMeta ?? null,
  });
  return toPlaceDTO(row);
}

export async function updatePlace(db: Db, id: string, input: UpdatePlaceInput): Promise<PlaceDTO> {
  if (input.layerId !== undefined && !(await layerExists(db, input.layerId))) {
    throw new AppError(400, ERROR_CODES.RESOURCE_NOT_FOUND, "layerId");
  }
  const patch: Parameters<typeof updatePlaceRow>[2] = {};
  if (input.layerId !== undefined) patch.layerId = input.layerId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.lat !== undefined) patch.lat = input.lat;
  if (input.lng !== undefined) patch.lng = input.lng;
  if (input.address !== undefined) patch.address = input.address ?? null;
  if (input.phone !== undefined) patch.phone = input.phone ?? null;
  if (input.hours !== undefined) patch.hours = input.hours ?? null;
  if (input.images !== undefined) patch.images = input.images ?? null;
  if (input.kosherMeta !== undefined) patch.kosherMeta = input.kosherMeta ?? null;
  const row = await updatePlaceRow(db, id, patch);
  if (!row) throw NotFound();
  return toPlaceDTO(row);
}

export async function deletePlace(db: Db, id: string): Promise<void> {
  if (!(await deletePlaceRow(db, id))) throw NotFound();
}
