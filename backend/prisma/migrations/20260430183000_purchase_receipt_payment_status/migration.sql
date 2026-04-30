-- Add payment status fields to warehouse purchase receipts
ALTER TABLE "warehouse_stock_receipts"
ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paidAt" TIMESTAMP(3);

