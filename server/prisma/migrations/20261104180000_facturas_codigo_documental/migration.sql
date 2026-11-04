BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "Factura", "FacturaVenta", "FacturaOperacion", "FacturaVentaOperacion" IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  nombre_tabla text;
  incoherencias boolean;
BEGIN
  FOREACH nombre_tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    EXECUTE format('SELECT EXISTS (
      SELECT 1 FROM respaldo_tipo_prefijo_20261104."Asignacion" asignacion
      LEFT JOIN public.%I factura ON factura."CompaniaCodigo" = asignacion."CompaniaCodigo"
        AND factura."CentroOperacionCodigo" = asignacion."CentroOperacionCodigo"
        AND factura."TipoDocumento" = asignacion."TipoAnterior" AND factura.numero = asignacion.numero
      WHERE asignacion.tabla = %L AND (factura.numero IS NULL OR factura."Prefijo" IS DISTINCT FROM asignacion."Prefijo"))',
      nombre_tabla, nombre_tabla) INTO incoherencias;
    IF incoherencias THEN RAISE EXCEPTION 'Los documentos de % cambiaron desde la preparacion', nombre_tabla; END IF;
    EXECUTE format('UPDATE public.%I factura SET "TipoDocumento" = asignacion."TipoDocumento"
      FROM respaldo_tipo_prefijo_20261104."Asignacion" asignacion WHERE asignacion.tabla = %L
        AND factura."CompaniaCodigo" = asignacion."CompaniaCodigo"
        AND factura."CentroOperacionCodigo" = asignacion."CentroOperacionCodigo"
        AND factura."TipoDocumento" = asignacion."TipoAnterior" AND factura.numero = asignacion.numero', nombre_tabla, nombre_tabla);
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I operacion JOIN public.%I factura
      USING ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero)
      WHERE operacion."Prefijo" IS DISTINCT FROM factura."Prefijo")', nombre_tabla || 'Operacion', nombre_tabla) INTO incoherencias;
    IF incoherencias THEN RAISE EXCEPTION 'Los prefijos de % no coinciden con sus operaciones', nombre_tabla; END IF;
  END LOOP;
END $$;

COMMIT;