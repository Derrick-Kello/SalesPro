-- Variant SKUs + on-hand qty (pieces). Costs/prices aligned to your CP/SP spreadsheet.
-- Idempotent upsert by (name, variant); sets global inventory.quantity.
-- Run: cd backend && npx prisma db execute --file scripts/import-variant-stock-counts.sql

BEGIN;

CREATE TEMP TABLE _vc_rows(name TEXT NOT NULL, variant TEXT NOT NULL, category TEXT NOT NULL, qty INTEGER NOT NULL, cp DOUBLE PRECISION NOT NULL, sp DOUBLE PRECISION NOT NULL);

INSERT INTO _vc_rows VALUES
  ('Plain Shirt',                  'Black',         'Apparel', 38,   70, 150),
  ('Plain Shirt',                  'White',         'Apparel', 30,   70, 150),
  ('Plain Shirt',                  'Other Colour',  'Apparel', 145,  70, 150),
  ('Dinner Shirts',                'Standard',      'Apparel', 5,    80, 180),
  ('Kaftan',                       'Standard',      'Apparel', 18,   120, 500),
  ('Turtle Neck',                  'Standard',      'Apparel', 21,   40, 150),
  ('Woolen Shorts',                'Standard',      'Apparel', 7,    60, 150),
  ('Vest',                         'Standard',      'Apparel', 1,    30, 150),
  ('Sweater & Hoodie',             'Standard',      'Apparel', 22,   70, 235),
  ('Material Trousers',            'Black',         'Apparel', 14,   60, 180),
  ('Material Trousers',            'Blue-Black',    'Apparel', 15,   60, 180),
  ('Material Trousers',            'Ash',           'Apparel', 6,    60, 180),
  ('Joggers',                      'Standard',      'Apparel', 13,   60, 180),
  ('Jeans',                        'Black',         'Apparel', 51,   100, 180),
  ('Jeans',                        'Other Colour',  'Apparel', 222,  100, 180),
  ('Khaki',                        'Black',         'Apparel', 35,   75, 150),
  ('Khaki',                        'Other Colour',  'Apparel', 141,  75, 150),
  ('Check Trousers',               'Standard',      'Apparel', 14,   60, 180),
  ('Short Sleeves',                'Standard',      'Apparel', 107,  60, 150),
  ('Long Sleeves',                 'Standard',      'Apparel', 109,  60, 150),
  ('Summer Shorts',                'Standard',      'Apparel', 41,   40, 80),
  ('Net Shirts',                   'Standard',      'Apparel', 6,    50, 150),
  ('Vintage',                      'Standard',      'Apparel', 8,    60, 150),
  ('R/T',                          'Standard',      'Apparel', 143,  50, 150),
  ('SCT',                          'Standard',      'Apparel', 72,   70, 180),
  ('CT',                           'Standard',      'Apparel', 34,   50, 150);

INSERT INTO products (
  name,
  variant,
  category,
  price,
  "costPrice",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  r.name,
  r.variant,
  r.category,
  r.sp,
  r.cp,
  true,
  NOW(),
  NOW()
FROM _vc_rows r
ON CONFLICT (name, variant) DO UPDATE SET
  category    = EXCLUDED.category,
  price       = EXCLUDED.price,
  "costPrice" = EXCLUDED."costPrice",
  "updatedAt" = NOW();

INSERT INTO inventory ("productId", quantity, "lowStockAlert", "updatedAt")
SELECT p.id, r.qty, 10, NOW()
FROM _vc_rows r
JOIN products p ON p.name = r.name AND p.variant = r.variant
ON CONFLICT ("productId") DO UPDATE SET
  quantity    = EXCLUDED.quantity,
  "updatedAt" = NOW();

COMMIT;
