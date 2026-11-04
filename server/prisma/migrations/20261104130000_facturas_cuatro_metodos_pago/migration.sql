BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "Factura", "FacturaVenta", "FacturaOperacion", "FacturaVentaOperacion" IN ACCESS EXCLUSIVE MODE;

CREATE SCHEMA respaldo_pagos_20261104;
CREATE TABLE respaldo_pagos_20261104."Factura" AS TABLE "Factura";
CREATE TABLE respaldo_pagos_20261104."FacturaVenta" AS TABLE "FacturaVenta";
CREATE TABLE respaldo_pagos_20261104."FacturaOperacion" AS TABLE "FacturaOperacion";
CREATE TABLE respaldo_pagos_20261104."FacturaVentaOperacion" AS TABLE "FacturaVentaOperacion";

CREATE TEMP TABLE "_pagos_excepciones" ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(COALESCE(NULLIF(current_setting('pos.pagos_conservar_diferencia', true), ''), '[]')::jsonb)
AS excepcion(tabla text, compania text, centro text, tipo text, numero integer, total numeric, propina numeric, metodo text);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "_pagos_excepciones" excepcion WHERE NOT EXISTS (
      SELECT 1 FROM (
        SELECT 'Factura'::text AS tabla, to_jsonb(f) AS datos FROM "Factura" f
        UNION ALL SELECT 'FacturaVenta', to_jsonb(f) FROM "FacturaVenta" f
      ) origen WHERE origen.tabla = excepcion.tabla
        AND origen.datos->>'CompaniaCodigo' = excepcion.compania
        AND origen.datos->>'CentroOperacionCodigo' = excepcion.centro
        AND origen.datos->>'TipoDocumento' = excepcion.tipo
        AND (origen.datos->>'numero')::integer = excepcion.numero
        AND (origen.datos->>'Total')::numeric = excepcion.total
        AND (origen.datos->>'Propina')::numeric = excepcion.propina
        AND origen.datos->>'metodoPago' = excepcion.metodo
        AND (origen.datos->>'credito')::boolean = false
    )
  ) THEN
    RAISE EXCEPTION 'Una excepcion de pagos no coincide exactamente con la factura autorizada';
  END IF;
END $$;

CREATE FUNCTION pg_temp.separar_metodos_pago(metodo_original text, total_factura double precision, propina_factura double precision, es_credito boolean, conservar_diferencia boolean DEFAULT false)
RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE
  resultado text[] := ARRAY['0', '0', '0', '0'];
  medios text[] := ARRAY[]::text[];
  importes numeric[] := ARRAY[]::numeric[];
  partes text[];
  parte text;
  captura text[];
  medio text;
  importe numeric;
  esperado numeric := round((COALESCE(total_factura, 0)::numeric + COALESCE(propina_factura, 0)::numeric), 2);
  propina numeric := round(COALESCE(propina_factura, 0)::numeric, 2);
  total_pagos numeric;
  posicion integer;
BEGIN
  metodo_original := translate(metodo_original, chr(160) || chr(8239), '  ');
  IF es_credito THEN
    esperado := propina;
    IF propina > 0 THEN
      medios := ARRAY['EFECTIVO']; importes := ARRAY[propina];
    ELSE
      RETURN resultado;
    END IF;
  ELSE
    partes := regexp_split_to_array(btrim(COALESCE(metodo_original, '')), '\s+\+\s+');
    FOREACH parte IN ARRAY partes LOOP
      IF cardinality(partes) = 1 AND strpos(parte, '$') = 0 THEN
        medio := upper(btrim(parte)); importe := esperado;
      ELSE
        captura := regexp_match(parte, '^(.+?)\s*\$\s*([0-9][0-9.,]*)$');
        IF captura IS NULL OR captura[2] !~ '^([0-9]{1,3}(\.[0-9]{3})+|[0-9]+)(,[0-9]{1,2})?$' THEN
          RAISE EXCEPTION 'No se puede separar un pago sin medio e importe verificables: %', metodo_original;
        END IF;
        medio := upper(btrim(captura[1]));
        importe := replace(replace(captura[2], '.', ''), ',', '.')::numeric;
      END IF;
      IF medio = '' OR medio = '0' OR importe <= 0 THEN
        RAISE EXCEPTION 'Medio o importe de pago invalido: %', metodo_original;
      END IF;
      posicion := array_position(medios, medio);
      IF posicion IS NULL THEN
        medios := array_append(medios, medio); importes := array_append(importes, importe);
      ELSE
        importes[posicion] := importes[posicion] + importe;
      END IF;
    END LOOP;
    SELECT sum(valor) INTO total_pagos FROM unnest(importes) valor;
    IF propina > 0 AND total_pagos = round(total_factura::numeric, 2) THEN
      posicion := array_position(medios, 'EFECTIVO');
      IF posicion IS NULL THEN
        medios := array_append(medios, 'EFECTIVO'); importes := array_append(importes, propina);
      ELSE
        importes[posicion] := importes[posicion] + propina;
      END IF;
    END IF;
  END IF;
  SELECT sum(valor) INTO total_pagos FROM unnest(importes) valor;
  IF cardinality(medios) > 4 OR (NOT conservar_diferencia AND total_pagos IS DISTINCT FROM esperado) THEN
    RAISE EXCEPTION 'Los pagos no coinciden con el total mas propina o exceden cuatro medios: %', metodo_original;
  END IF;
  FOR posicion IN 1..cardinality(medios) LOOP
    resultado[posicion] := medios[posicion] || ' $' || regexp_replace(regexp_replace(
      translate(to_char(importes[posicion], 'FM999,999,999,999,990.00'), ',.', '.,'), ',00$', ''), '(,[0-9])0$', '\1');
  END LOOP;
  RETURN resultado;
END $$;

DO $$
DECLARE
  tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN metodopago1 text NOT NULL DEFAULT %L,
      ADD COLUMN metodopago2 text NOT NULL DEFAULT %L, ADD COLUMN metodopago3 text NOT NULL DEFAULT %L,
      ADD COLUMN metodopago4 text NOT NULL DEFAULT %L', tabla, '0', '0', '0', '0');
    EXECUTE format('ALTER TABLE %I ADD COLUMN "metodoPago" text NOT NULL DEFAULT %L', tabla || 'Operacion', 'EFECTIVO');
    EXECUTE format('UPDATE %I operacion SET "metodoPago" = cabecera."metodoPago"
      FROM %I cabecera WHERE operacion."CompaniaCodigo" = cabecera."CompaniaCodigo"
        AND operacion."CentroOperacionCodigo" = cabecera."CentroOperacionCodigo"
        AND operacion."TipoDocumento" = cabecera."TipoDocumento" AND operacion.numero = cabecera.numero', tabla || 'Operacion', tabla);
    EXECUTE format('WITH conversion AS MATERIALIZED (
      SELECT f."CompaniaCodigo", f."CentroOperacionCodigo", f."TipoDocumento", f.numero,
        pg_temp.separar_metodos_pago(f."metodoPago", f."Total", f."Propina", f.credito, excepcion.tabla IS NOT NULL) AS pagos
      FROM %I f LEFT JOIN "_pagos_excepciones" excepcion ON excepcion.tabla = %L
        AND f."CompaniaCodigo" = excepcion.compania AND f."CentroOperacionCodigo" = excepcion.centro
        AND f."TipoDocumento" = excepcion.tipo AND f.numero = excepcion.numero
        AND f."Total"::numeric = excepcion.total AND f."Propina"::numeric = excepcion.propina
        AND f."metodoPago" = excepcion.metodo AND NOT f.credito
      ) UPDATE %I cabecera SET metodopago1 = conversion.pagos[1], metodopago2 = conversion.pagos[2],
        metodopago3 = conversion.pagos[3], metodopago4 = conversion.pagos[4]
      FROM conversion WHERE cabecera."CompaniaCodigo" = conversion."CompaniaCodigo"
        AND cabecera."CentroOperacionCodigo" = conversion."CentroOperacionCodigo"
        AND cabecera."TipoDocumento" = conversion."TipoDocumento" AND cabecera.numero = conversion.numero', tabla, tabla, tabla);
  END LOOP;
END $$;

COMMIT;