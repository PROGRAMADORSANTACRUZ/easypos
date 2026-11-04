BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "Factura", "FacturaVenta" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Factura" WHERE NOT credito AND "Total" + "Propina" > 0 AND metodopago1 = '0')
    OR EXISTS (SELECT 1 FROM "FacturaVenta" WHERE NOT credito AND "Total" + "Propina" > 0 AND metodopago1 = '0') THEN
    RAISE EXCEPTION 'No se puede retirar metodoPago: hay facturas cobradas sin separar';
  END IF;
END $$;

ALTER TABLE "Factura" DROP COLUMN "metodoPago";
ALTER TABLE "FacturaVenta" DROP COLUMN "metodoPago";

COMMIT;