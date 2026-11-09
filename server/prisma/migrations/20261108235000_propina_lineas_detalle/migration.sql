BEGIN;

LOCK TABLE "Factura", "FacturaOperacion", "FacturaDetalle",
  "FacturaVenta", "FacturaVentaOperacion", "FacturaVentaDetalle"
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Factura" f
    WHERE f."Propina" > 0
      AND NOT EXISTS (
        SELECT 1 FROM "FacturaOperacion" o
        WHERE (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero") =
          (f."CompaniaCodigo", f."CentroOperacionCodigo", f."TipoDocumento", f."numero")
      )
  ) OR EXISTS (
    SELECT 1
    FROM "FacturaVenta" f
    WHERE f."Propina" > 0
      AND NOT EXISTS (
        SELECT 1 FROM "FacturaVentaOperacion" o
        WHERE (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero") =
          (f."CompaniaCodigo", f."CentroOperacionCodigo", f."TipoDocumento", f."numero")
      )
  ) THEN
    RAISE EXCEPTION 'No se puede asociar una propina a su operación de factura';
  END IF;
END $$;

INSERT INTO "FacturaDetalle" (
  "Id", "FacturaId", "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero",
  "CodigoProducto", "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "fecha", "usuario"
)
SELECT
  gen_random_uuid(), o."Id", f."CompaniaCodigo", f."CentroOperacionCodigo", f."TipoDocumento", f."numero",
  '0000', 'Propina', 1, 'UND', f."Propina", 0, f."Propina", f."fecha", f."Usuario"
FROM "Factura" f
JOIN "FacturaOperacion" o ON (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero") =
  (f."CompaniaCodigo", f."CentroOperacionCodigo", f."TipoDocumento", f."numero")
WHERE f."Propina" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "FacturaDetalle" d
    WHERE d."FacturaId" = o."Id" AND d."CodigoProducto" = '0000' AND upper(d."NombreProducto") = 'PROPINA'
  );

INSERT INTO "FacturaVentaDetalle" (
  "Id", "FacturaVentaId", "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero",
  "CodigoProducto", "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "fecha", "usuario"
)
SELECT
  gen_random_uuid(), o."Id", f."CompaniaCodigo", f."CentroOperacionCodigo", f."TipoDocumento", f."numero",
  '0000', 'Propina', 1, 'UND', f."Propina", 0, f."Propina", f."fecha", f."Usuario"
FROM "FacturaVenta" f
JOIN "FacturaVentaOperacion" o ON (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero") =
  (f."CompaniaCodigo", f."CentroOperacionCodigo", f."TipoDocumento", f."numero")
WHERE f."Propina" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "FacturaVentaDetalle" d
    WHERE d."FacturaVentaId" = o."Id" AND d."CodigoProducto" = '0000' AND upper(d."NombreProducto") = 'PROPINA'
  );

COMMIT;