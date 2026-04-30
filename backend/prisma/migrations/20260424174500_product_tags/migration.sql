-- Tags + optional per-tag qty; receipts & sale lines can reference a tag.
-- Drops products_name_variant_key so catalogue can use flexible tags instead of duplicate product rows.

CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

CREATE TABLE "product_tags" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "quantity" INTEGER,
    CONSTRAINT "product_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_tags_productId_tagId_key" ON "product_tags"("productId", "tagId");

ALTER TABLE "product_tags"
  ADD CONSTRAINT "product_tags_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_tags"
  ADD CONSTRAINT "product_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_items" ADD COLUMN "tagId" INTEGER;
ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF to_regclass('public.warehouse_stock_receipts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'warehouse_stock_receipts'
        AND column_name = 'tagId'
    ) THEN
      ALTER TABLE "warehouse_stock_receipts" ADD COLUMN "tagId" INTEGER;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'warehouse_stock_receipts_tagId_fkey'
    ) THEN
      ALTER TABLE "warehouse_stock_receipts"
        ADD CONSTRAINT "warehouse_stock_receipts_tagId_fkey"
        FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS "products_name_variant_key";
