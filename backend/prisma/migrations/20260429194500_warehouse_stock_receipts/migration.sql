-- Audit log for warehouse intake / purchase receipts
CREATE TABLE "warehouse_stock_receipts" (
    "id" SERIAL NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineValueTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplier" TEXT,
    "note" TEXT,
    "receivedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_stock_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "warehouse_stock_receipts_warehouseId_createdAt_idx" ON "warehouse_stock_receipts"("warehouseId", "createdAt");

ALTER TABLE "warehouse_stock_receipts" ADD CONSTRAINT "warehouse_stock_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_stock_receipts" ADD CONSTRAINT "warehouse_stock_receipts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_stock_receipts" ADD CONSTRAINT "warehouse_stock_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
