-- Variants: one row per SKU (name + variant). Resolve duplicate imports before UNIQUE.

DO $$
BEGIN
  ALTER TABLE "products" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'Standard';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY name, variant ORDER BY id) AS rn FROM products
)
UPDATE products SET variant = 'Legacy SKU #' || products.id WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

DROP INDEX IF EXISTS "products_name_variant_key";

CREATE UNIQUE INDEX "products_name_variant_key" ON "products" ("name", "variant");
