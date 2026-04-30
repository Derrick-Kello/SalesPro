-- Add optional createdBy audit fields across core tables

ALTER TABLE "branches" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "warehouses" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "tags" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "products" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "customers" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "suppliers" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "expense_categories" ADD COLUMN "createdById" INTEGER;
DO $$
BEGIN
  IF to_regclass('public.settings') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'settings'
        AND column_name = 'createdById'
    ) THEN
      ALTER TABLE "settings" ADD COLUMN "createdById" INTEGER;
    END IF;
  END IF;
END $$;
ALTER TABLE "expenses" ADD COLUMN "createdById" INTEGER;

ALTER TABLE "branches"
ADD CONSTRAINT "branches_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouses"
ADD CONSTRAINT "warehouses_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tags"
ADD CONSTRAINT "tags_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "products"
ADD CONSTRAINT "products_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customers"
ADD CONSTRAINT "customers_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "suppliers"
ADD CONSTRAINT "suppliers_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_categories"
ADD CONSTRAINT "expense_categories_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF to_regclass('public.settings') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'settings_createdById_fkey'
    ) THEN
      ALTER TABLE "settings"
      ADD CONSTRAINT "settings_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
