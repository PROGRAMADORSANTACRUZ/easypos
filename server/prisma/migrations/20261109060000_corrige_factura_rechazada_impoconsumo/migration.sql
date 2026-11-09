BEGIN;

LOCK TABLE "Factura", "FacturaOperacion", "FacturaDetalle" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  operacion_id UUID;
  subtotal_actual DOUBLE PRECISION;
  impuesto_pct_actual DOUBLE PRECISION;
  impuesto_actual DOUBLE PRECISION;
  total_actual DOUBLE PRECISION;
  propina_actual DOUBLE PRECISION;
  estado_actual TEXT;
  cufe_actual TEXT;
  numero_factus_actual TEXT;
  lineas_producto INTEGER;
BEGIN
  SELECT o."Id", f."Subtotal", f."impuestoPct", f."IVA", f."Total", f."Propina",
    f."EstadoDIAN", f."CUFE", f."NumeroFactus"
  INTO operacion_id, subtotal_actual, impuesto_pct_actual, impuesto_actual, total_actual,
    propina_actual, estado_actual, cufe_actual, numero_factus_actual
  FROM "Factura" f
  JOIN "FacturaOperacion" o USING ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero")
  WHERE f."CompaniaCodigo" = '004'
    AND f."CentroOperacionCodigo" = '420'
    AND f."TipoDocumento" = 'FEV'
    AND f."Prefijo" = 'RM1C'
    AND f."numero" = 10
  FOR UPDATE OF f, o;

  IF operacion_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la operación RM1C10 para corregir';
  END IF;

  IF estado_actual <> 'ERROR' OR cufe_actual IS NOT NULL OR numero_factus_actual IS NOT NULL
    OR total_actual <> 8000 OR propina_actual <> 800 THEN
    RAISE EXCEPTION 'RM1C10 cambió de estado o tiene datos fiscales inesperados; se cancela la corrección';
  END IF;

  SELECT count(*)::INTEGER INTO lineas_producto
  FROM "FacturaDetalle"
  WHERE "FacturaId" = operacion_id
    AND "CodigoProducto" = '0004'
    AND "NombreProducto" = 'CHUZO DE CHORIZO'
    AND "Cantidad" = 1
    AND "Total" = 8000;

  IF subtotal_actual = 7360 AND impuesto_actual = 640 THEN
    IF lineas_producto <> 1 OR NOT EXISTS (
      SELECT 1 FROM "FacturaDetalle"
      WHERE "FacturaId" = operacion_id
        AND "CodigoProducto" = '0004'
        AND "NombreProducto" = 'CHUZO DE CHORIZO'
        AND "Cantidad" = 1
        AND "PrecioUnitario" = 7360
        AND "IVA" = 640
        AND "Total" = 8000
    ) THEN
      RAISE EXCEPTION 'El detalle RM1C10 no coincide con los importes esperados; se cancela la corrección';
    END IF;

    UPDATE "FacturaDetalle"
    SET "PrecioUnitario" = 7407.41,
        "IVA" = 592.59
    WHERE "FacturaId" = operacion_id
      AND "CodigoProducto" = '0004'
      AND "NombreProducto" = 'CHUZO DE CHORIZO'
      AND "Cantidad" = 1
      AND "PrecioUnitario" = 7360
      AND "IVA" = 640
      AND "Total" = 8000;

    UPDATE "Factura"
    SET "Subtotal" = 7407.41,
        "impuestoPct" = 8,
        "IVA" = 592.59
    WHERE "CompaniaCodigo" = '004'
      AND "CentroOperacionCodigo" = '420'
      AND "TipoDocumento" = 'FEV'
      AND "Prefijo" = 'RM1C'
      AND "numero" = 10
      AND "Subtotal" = 7360
      AND "IVA" = 640;
  ELSIF subtotal_actual = 7407.41 AND impuesto_actual = 592.59 AND impuesto_pct_actual = 8 THEN
    IF lineas_producto <> 1 OR NOT EXISTS (
      SELECT 1 FROM "FacturaDetalle"
      WHERE "FacturaId" = operacion_id
        AND "CodigoProducto" = '0004'
        AND "NombreProducto" = 'CHUZO DE CHORIZO'
        AND "Cantidad" = 1
        AND "PrecioUnitario" = 7407.41
        AND "IVA" = 592.59
        AND "Total" = 8000
    ) THEN
      RAISE EXCEPTION 'RM1C10 está parcialmente corregida; se cancela la migración';
    END IF;
  ELSE
    RAISE EXCEPTION 'Importes actuales de RM1C10 no coinciden con la corrección aprobada';
  END IF;
END $$;

COMMIT;