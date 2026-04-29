-- Shipping fee tracked separately per sale
-- IF NOT EXISTS: column may already exist from legacy server fixup (server.js).
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "shipping" DOUBLE PRECISION NOT NULL DEFAULT 0;
