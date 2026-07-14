/**
 * Human label for a place layer. Layer names are stored in the DB in English (seeded by the OSM
 * importer, e.g. "Synagogues"); this maps the known seed layers to localized names via i18n
 * (`layers.<id>`), falling back to the raw DB name for admin-created layers with no translation.
 */
export function layerLabel(
  layer: { id: string; name: string },
  t: (key: string, opts?: { defaultValue: string }) => string,
): string {
  return t(`layers.${layer.id}`, { defaultValue: layer.name });
}

/** Known seed layer ids (010 OSM importer) for the kosher restaurant / shop layers. */
const FOOD_LAYER_IDS = new Set(["lyr_osm_restaurants", "lyr_osm_shops"]);

/** he + en name fragments that mark a layer as kosher restaurants or kosher shops/groceries. */
const FOOD_NAME_RX = /מסעד|מזון|חנוי|חנות|מכולת|סופרמרקט|restaurant|\bshop|grocer|food|deli/i;

/**
 * Whether a place layer is a kosher restaurant / shop (food) layer. Layers are admin-managed and
 * data-driven, so this matches the known seed ids first, then falls back to a he/en name heuristic
 * — robust to newly created layers whose id we don't know.
 */
export function isFoodLayer(layer: { id: string; name: string }): boolean {
  return FOOD_LAYER_IDS.has(layer.id) || FOOD_NAME_RX.test(layer.name);
}

/**
 * The default set of *hidden* layer ids for the places / discovery layer toggles: only kosher
 * restaurants + shops start ON (the day-to-day "where can I eat / buy food" layers); every other
 * layer — synagogues, Chabad houses, mikvehs, cemeteries — starts OFF. A pure default: the user's
 * toggles still add/remove ids afterwards.
 */
export function defaultHiddenLayerIds(layers: { id: string; name: string }[]): Set<string> {
  return new Set(layers.filter((l) => !isFoodLayer(l)).map((l) => l.id));
}
