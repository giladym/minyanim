-- Beit Chabad pins — dev seed (D18). A small, source-agnostic starter set until the Chabad.org
-- import licensing is cleared (ROADMAP open item); maintained by admins thereafter (Feature 006).
-- Apply: pnpm db:seed:beit-chabad:local  (or :remote). Idempotent via stable ids + OR REPLACE.
-- created_at/updated_at are Unix SECONDS (Drizzle `integer mode:'timestamp'`); value is display-irrelevant.
-- Addresses/phones below are illustrative DEV placeholders (real data awaits the Chabad.org import).
INSERT OR REPLACE INTO beit_chabad_pin (id, name, address, phone, city, country, lat, lng, created_at, updated_at) VALUES
  ('bcp_seed_770',     'Chabad Lubavitch World HQ (770)', '770 Eastern Parkway, Brooklyn', '+1 718-774-4000', 'New York',  'USA',     40.6694, -73.9422, 1750000000, 1750000000),
  ('bcp_seed_london',  'Chabad Lubavitch UK',             '107-115 Golders Green Rd',      '+44 20 8800 0000', 'London',    'UK',      51.5722, -0.1953, 1750000000, 1750000000),
  ('bcp_seed_paris',   'Beth Loubavitch Paris',           '8 Rue Lamartine',               '+33 1 45 26 87 60', 'Paris',     'France',  48.8720,  2.3470, 1750000000, 1750000000),
  ('bcp_seed_warsaw',  'Chabad of Poland (Warsaw)',       'ul. Słomińskiego 19',           '+48 22 000 0000',  'Warsaw',    'Poland',  52.2297, 21.0122, 1750000000, 1750000000),
  ('bcp_seed_zakop',   'Chabad of Zakopane',              'ul. Kościeliska 4',             '+48 18 000 0000',  'Zakopane',  'Poland',  49.2992, 19.9496, 1750000000, 1750000000);
