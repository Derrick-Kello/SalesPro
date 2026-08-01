-- Idempotency key for sales rung up offline and replayed by the PWA sync engine.
-- Nullable: online sales never set it. Unique: a replayed sale can only land once.
ALTER TABLE "sales" ADD COLUMN "clientRef" TEXT;

CREATE UNIQUE INDEX "sales_clientRef_key" ON "sales"("clientRef");
