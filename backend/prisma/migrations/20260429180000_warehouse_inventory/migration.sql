-- CreateTable
CREATE TABLE "warehouse_inventory" (
    "id" SERIAL NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockAlert" INTEGER NOT NULL DEFAULT 10,
    "supplier" TEXT,

    CONSTRAINT "warehouse_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_inventory_warehouseId_productId_key" ON "warehouse_inventory"("warehouseId", "productId");

-- AddForeignKey
ALTER TABLE "warehouse_inventory" ADD CONSTRAINT "warehouse_inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_inventory" ADD CONSTRAINT "warehouse_inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
