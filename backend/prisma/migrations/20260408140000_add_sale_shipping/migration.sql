-- Shipping fee tracked separately per sale
ALTER TABLE "sales" ADD COLUMN "shipping" DOUBLE PRECISION NOT NULL DEFAULT 0;
