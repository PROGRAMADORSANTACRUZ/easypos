BEGIN;

ALTER TABLE "FacturaDetalle"
  ADD COLUMN "CompaniaCodigo" VARCHAR(3),
  ADD COLUMN "CentroOperacionCodigo" VARCHAR(10);
ALTER TABLE "FacturaVentaDetalle"
  ADD COLUMN "CompaniaCodigo" VARCHAR(3),
  ADD COLUMN "CentroOperacionCodigo" VARCHAR(10);

UPDATE "FacturaDetalle" d
SET "CompaniaCodigo" = f."CompaniaCodigo",
    "CentroOperacionCodigo" = f."CentroOperacionCodigo"
FROM "Factura" f
WHERE d."FacturaId" = f."Id";

UPDATE "FacturaVentaDetalle" d
SET "CompaniaCodigo" = f."CompaniaCodigo",
    "CentroOperacionCodigo" = f."CentroOperacionCodigo"
FROM "FacturaVenta" f
WHERE d."FacturaVentaId" = f."Id";

ALTER TABLE "FacturaDetalle"
  ADD CONSTRAINT "FacturaDetalle_CompaniaCodigo_fkey"
    FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FacturaDetalle_CentroOperacionCodigo_fkey"
    FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FacturaVentaDetalle"
  ADD CONSTRAINT "FacturaVentaDetalle_CompaniaCodigo_fkey"
    FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FacturaVentaDetalle_CentroOperacionCodigo_fkey"
    FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
