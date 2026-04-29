-- Allow sales with an unpaid balance (partial payment checkout / layaway style)
-- Safe if PARTIALLY_PAID was already added manually or by a drifted schema.
DO $$
BEGIN
  ALTER TYPE "SaleStatus" ADD VALUE 'PARTIALLY_PAID';
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END;
$$;
