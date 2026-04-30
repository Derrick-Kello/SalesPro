-- Add optional createdBy audit fields across core tables

ALTER TABLE "branches" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "warehouses" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "tags" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "products" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "customers" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "suppliers" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "expense_categories" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "settings" ADD COLUMN "createdById" INTEGER;
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

ALTER TABLE "settings"
ADD CONSTRAINT "settings_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
