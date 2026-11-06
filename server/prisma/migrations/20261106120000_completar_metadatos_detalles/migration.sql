BEGIN;

UPDATE "FacturaDetalle" d
SET "TipoDocumento" = COALESCE(d."TipoDocumento", h."TipoDocumento"),
    "numero" = COALESCE(d."numero", h."numero"),
    "CodigoProducto" = COALESCE(d."CodigoProducto", p."Codigo"),
    "NombreProducto" = COALESCE(d."NombreProducto", p."Nombre"),
    "Unidad" = COALESCE(d."Unidad", CASE WHEN p."Id" IS NOT NULL THEN COALESCE(u."Abreviatura", 'UND') END),
    "fecha" = COALESCE(d."fecha", h."fecha"),
    "usuario" = COALESCE(d."usuario", h."Usuario")
FROM "FacturaOperacion" o
JOIN "Factura" h ON (h."CompaniaCodigo", h."CentroOperacionCodigo", h."TipoDocumento", h."numero") =
  (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero")
LEFT JOIN "FacturaDetalle" fuente ON fuente."FacturaId" = o."Id"
LEFT JOIN "Producto" p ON p."Id" = fuente."ProductoId"
LEFT JOIN "UnidadesMedida" u ON u."Id" = p."UnidadId"
WHERE d."Id" = fuente."Id"
  AND (d."TipoDocumento" IS NULL OR d."numero" IS NULL OR d."CodigoProducto" IS NULL
    OR d."NombreProducto" IS NULL OR d."Unidad" IS NULL OR d."fecha" IS NULL OR d."usuario" IS NULL);

UPDATE "FacturaVentaDetalle" d
SET "TipoDocumento" = COALESCE(d."TipoDocumento", h."TipoDocumento"),
    "numero" = COALESCE(d."numero", h."numero"),
    "CodigoProducto" = COALESCE(d."CodigoProducto", p."Codigo"),
    "NombreProducto" = COALESCE(d."NombreProducto", p."Nombre"),
    "Unidad" = COALESCE(d."Unidad", CASE WHEN p."Id" IS NOT NULL THEN COALESCE(u."Abreviatura", 'UND') END),
    "fecha" = COALESCE(d."fecha", h."fecha"),
    "usuario" = COALESCE(d."usuario", h."Usuario")
FROM "FacturaVentaOperacion" o
JOIN "FacturaVenta" h ON (h."CompaniaCodigo", h."CentroOperacionCodigo", h."TipoDocumento", h."numero") =
  (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero")
LEFT JOIN "FacturaVentaDetalle" fuente ON fuente."FacturaVentaId" = o."Id"
LEFT JOIN "Producto" p ON p."Id" = fuente."ProductoId"
LEFT JOIN "UnidadesMedida" u ON u."Id" = p."UnidadId"
WHERE d."Id" = fuente."Id"
  AND (d."TipoDocumento" IS NULL OR d."numero" IS NULL OR d."CodigoProducto" IS NULL
    OR d."NombreProducto" IS NULL OR d."Unidad" IS NULL OR d."fecha" IS NULL OR d."usuario" IS NULL);

COMMIT;