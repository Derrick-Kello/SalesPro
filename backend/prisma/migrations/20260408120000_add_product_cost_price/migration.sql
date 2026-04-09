-- Cost price for COGS / gross profit reporting (required)
ALTER TABLE "products" ADD COLUMN "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
