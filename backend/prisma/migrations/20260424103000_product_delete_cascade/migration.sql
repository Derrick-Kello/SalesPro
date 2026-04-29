-- Allow deleting a product row from the DB/tools: cascade child stock & transfer rows.
-- Sale line items remain RESTRICT — products that appear on sales cannot be removed without wider handling.

-- inventory
ALTER TABLE "inventory" DROP CONSTRAINT "inventory_productId_fkey";
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- branch_inventory
ALTER TABLE "branch_inventory" DROP CONSTRAINT "branch_inventory_productId_fkey";
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- stock_transfers (history rows tied to product)
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_productId_fkey";
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
