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
