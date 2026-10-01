BEGIN;

DO $$
DECLARE
  tipos_coincidentes INTEGER;
  facturas_objetivo BIGINT;
BEGIN
  SELECT COUNT(*) INTO tipos_coincidentes
  FROM "TiposDocumento"
  WHERE "Clase" = 'FACTURA DE VENTA (NO ELECTRONICA)'
    AND "EsElectronico" = FALSE
    AND "Prefijo" = 'FAV'
    AND "CompaniaCodigo" = '006'
    AND "CentroOperacionCodigo" = '606';

  IF tipos_coincidentes <> 1 THEN
    RAISE EXCEPTION 'Se esperaba un tipo FAV configurado para compañía 006 y centro 606; encontrados: %', tipos_coincidentes;
  END IF;

  SELECT COUNT(*) INTO facturas_objetivo
  FROM "FacturaVenta"
  WHERE "EstadoDIAN" = 'NO_APLICA' AND "Prefijo" = 'FAV';

  IF facturas_objetivo <> 181 THEN
    RAISE EXCEPTION 'Se esperaban 181 facturas FAV no electrónicas; encontradas: %', facturas_objetivo;
  END IF;
END $$;

ALTER TABLE "Factura" ADD COLUMN "TipoDocumentoId" UUID;
ALTER TABLE "Factura" ADD COLUMN "CompaniaCodigo" VARCHAR(3);
ALTER TABLE "Factura" ADD COLUMN "CentroOperacionCodigo" VARCHAR(10);

ALTER TABLE "FacturaVenta" ADD COLUMN "TipoDocumentoId" UUID;
ALTER TABLE "FacturaVenta" ADD COLUMN "CompaniaCodigo" VARCHAR(3);
ALTER TABLE "FacturaVenta" ADD COLUMN "CentroOperacionCodigo" VARCHAR(10);

UPDATE "FacturaVenta" f
SET "TipoDocumentoId" = td."Id",
    "CompaniaCodigo" = td."CompaniaCodigo",
    "CentroOperacionCodigo" = td."CentroOperacionCodigo"
FROM "TiposDocumento" td
WHERE f."EstadoDIAN" = 'NO_APLICA'
  AND f."Prefijo" = 'FAV'
  AND td."Clase" = 'FACTURA DE VENTA (NO ELECTRONICA)'
  AND td."EsElectronico" = FALSE
  AND td."CompaniaCodigo" = '006'
  AND td."CentroOperacionCodigo" = '606'
  AND td."Prefijo" = f."Prefijo";

ALTER TABLE "Factura" ADD CONSTRAINT "Factura_TipoDocumentoId_fkey"
  FOREIGN KEY ("TipoDocumentoId") REFERENCES "TiposDocumento"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_CompaniaCodigo_fkey"
  FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_CentroOperacionCodigo_fkey"
  FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FacturaVenta" ADD CONSTRAINT "FacturaVenta_TipoDocumentoId_fkey"
  FOREIGN KEY ("TipoDocumentoId") REFERENCES "TiposDocumento"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacturaVenta" ADD CONSTRAINT "FacturaVenta_CompaniaCodigo_fkey"
  FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacturaVenta" ADD CONSTRAINT "FacturaVenta_CentroOperacionCodigo_fkey"
  FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
