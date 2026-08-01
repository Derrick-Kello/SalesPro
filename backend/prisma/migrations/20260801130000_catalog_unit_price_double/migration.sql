-- Align sale_items.catalogUnitPrice with schema.prisma (Float -> DOUBLE PRECISION).
-- The column was created as REAL in 20260521120000, leaving the live schema
-- drifting from the datamodel ever since.
--
-- Widening REAL -> DOUBLE PRECISION preserves the binary value but NOT the
-- decimal one: a plain cast turns a stored 12.34 into 12.34000015258789,
-- because REAL prints ~7 significant digits while DOUBLE prints ~17. On a money
-- column that is corruption. Casting via text takes REAL's shortest
-- round-trippable decimal and reparses it, so 12.34 stays 12.34.
--
-- Every existing row is a whole number (verified: 677 rows, 0 fractional), so
-- this is a no-op for current data; the USING clause protects any fractional
-- price written between now and when this migration runs.
ALTER TABLE "sale_items"
  ALTER COLUMN "catalogUnitPrice" TYPE DOUBLE PRECISION
  USING "catalogUnitPrice"::text::double precision;
