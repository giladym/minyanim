-- Chabad houses — dev seed (011). Seeds the generic `place` model under the admin-managed
-- "Chabad houses" layer (layer_chabad_houses, created by migration 0010) — the legacy beit_chabad_pin
-- table was retired in 0012. A small, source-agnostic starter set until the Chabad.org import
-- licensing is cleared (ROADMAP open item); maintained by admins thereafter via /admin/places.
-- Apply: pnpm db:seed:beit-chabad:local  (or :remote).
-- Idempotent: stable ids + provenance (source, source_id) matched by ON CONFLICT DO NOTHING against
-- the place_source_uidx unique index (a re-run inserts nothing new).
-- created_at/updated_at are Unix SECONDS (Drizzle `integer mode:'timestamp'`); value is display-irrelevant.
-- Addresses/phones below are illustrative DEV placeholders (real data awaits the Chabad.org import).
INSERT INTO place (id, layer_id, name, lat, lng, address, phone, source, source_id, license, created_at, updated_at) VALUES
  ('place_bcp_seed_770',    'layer_chabad_houses', 'Chabad Lubavitch World HQ (770)', 40.6694, -73.9422, '770 Eastern Parkway, Brooklyn', '+1 718-774-4000', 'beit_chabad_seed', 'bcp_seed_770',    'internal', 1750000000, 1750000000),
  ('place_bcp_seed_london', 'layer_chabad_houses', 'Chabad Lubavitch UK',             51.5722, -0.1953, '107-115 Golders Green Rd',      '+44 20 8800 0000', 'beit_chabad_seed', 'bcp_seed_london', 'internal', 1750000000, 1750000000),
  ('place_bcp_seed_paris',  'layer_chabad_houses', 'Beth Loubavitch Paris',           48.8720,  2.3470, '8 Rue Lamartine',               '+33 1 45 26 87 60', 'beit_chabad_seed', 'bcp_seed_paris',  'internal', 1750000000, 1750000000),
  ('place_bcp_seed_warsaw', 'layer_chabad_houses', 'Chabad of Poland (Warsaw)',       52.2297, 21.0122, 'ul. Słomińskiego 19',           '+48 22 000 0000',  'beit_chabad_seed', 'bcp_seed_warsaw', 'internal', 1750000000, 1750000000),
  ('place_bcp_seed_zakop',  'layer_chabad_houses', 'Chabad of Zakopane',              49.2992, 19.9496, 'ul. Kościeliska 4',             '+48 18 000 0000',  'beit_chabad_seed', 'bcp_seed_zakop',  'internal', 1750000000, 1750000000)
ON CONFLICT(source, source_id) DO NOTHING;
