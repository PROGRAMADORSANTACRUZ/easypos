-- Unidades: UND -> U y KILOS -> KG.
UPDATE "UnidadesMedida" SET "Abreviatura" = 'U' WHERE upper("Abreviatura") IN ('UND', 'UNIDAD');
UPDATE "UnidadesMedida" SET "Abreviatura" = 'KG' WHERE upper("Nombre") IN ('KILOS', 'KILO', 'KILOGRAMO', 'KILOGRAMOS');
UPDATE "InventarioItem" SET "unidad" = 'U' WHERE upper("unidad") IN ('UND', 'UNIDAD', 'UNIDADES');
UPDATE "InventarioItem" SET "unidad" = 'KG' WHERE upper("unidad") IN ('KILOS', 'KILO', 'KILOGRAMO', 'KILOGRAMOS');
UPDATE "FacturaDetalle" SET "Unidad" = 'U' WHERE upper("Unidad") IN ('UND', 'UNIDAD', 'UNIDADES');
UPDATE "FacturaDetalle" SET "Unidad" = 'KG' WHERE upper("Unidad") IN ('KILOS', 'KILO', 'KILOGRAMO', 'KILOGRAMOS');
UPDATE "FacturaVentaDetalle" SET "Unidad" = 'U' WHERE upper("Unidad") IN ('UND', 'UNIDAD', 'UNIDADES');
UPDATE "FacturaVentaDetalle" SET "Unidad" = 'KG' WHERE upper("Unidad") IN ('KILOS', 'KILO', 'KILOGRAMO', 'KILOGRAMOS');

-- Impuesto de cada linea en pesos enteros (el total de la linea no cambia) y precio unitario sin decimales.
UPDATE "FacturaDetalle" SET
  "IVA" = CASE WHEN "IVA" <> 0 AND "Total" - "IVA" <> 0
    THEN ROUND(("Total" * ROUND(("IVA" / ("Total" - "IVA") * 100)::numeric) / (100 + ROUND(("IVA" / ("Total" - "IVA") * 100)::numeric)))::numeric)
    ELSE ROUND("IVA"::numeric) END,
  "PrecioUnitario" = ROUND("PrecioUnitario"::numeric);
UPDATE "FacturaVentaDetalle" SET
  "IVA" = CASE WHEN "IVA" <> 0 AND "Total" - "IVA" <> 0
    THEN ROUND(("Total" * ROUND(("IVA" / ("Total" - "IVA") * 100)::numeric) / (100 + ROUND(("IVA" / ("Total" - "IVA") * 100)::numeric)))::numeric)
    ELSE ROUND("IVA"::numeric) END,
  "PrecioUnitario" = ROUND("PrecioUnitario"::numeric);

-- Cabeceras: impuesto = suma de sus lineas y base = total - impuesto.
UPDATE "Factura" f SET "IVA" = s.iva, "Subtotal" = f."TotalConsumo" - s.iva
FROM (
  SELECT "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", SUM("IVA") AS iva
  FROM "FacturaDetalle" WHERE "numero" IS NOT NULL GROUP BY 1, 2, 3, 4
) s
WHERE f."CompaniaCodigo" = s."CompaniaCodigo" AND f."CentroOperacionCodigo" = s."CentroOperacionCodigo"
  AND f."TipoDocumento" = s."TipoDocumento" AND f."numero" = s."numero";
UPDATE "FacturaVenta" f SET "IVA" = s.iva, "Subtotal" = f."TotalConsumo" - s.iva
FROM (
  SELECT "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", SUM("IVA") AS iva
  FROM "FacturaVentaDetalle" WHERE "numero" IS NOT NULL GROUP BY 1, 2, 3, 4
) s
WHERE f."CompaniaCodigo" = s."CompaniaCodigo" AND f."CentroOperacionCodigo" = s."CentroOperacionCodigo"
  AND f."TipoDocumento" = s."TipoDocumento" AND f."numero" = s."numero";