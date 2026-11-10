BEGIN;

CREATE OR REPLACE FUNCTION pos_posicion_medio_pago(codigo TEXT) RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN string_to_array(upper(btrim(codigo)), '/') <@ ARRAY['EFE', 'EFECTIVO'] THEN 1
    WHEN string_to_array(upper(btrim(codigo)), '/') <@ ARRAY['DAT', 'DTF', 'TARJETA'] THEN 2
    WHEN string_to_array(upper(btrim(codigo)), '/') <@ ARRAY['QR'] THEN 3
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION pos_ubicar_pagos(metodos TEXT[], valores NUMERIC[])
RETURNS TABLE(codigos TEXT[], importes NUMERIC[]) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  claves TEXT[] := ARRAY[]::TEXT[];
  nombres TEXT[] := ARRAY[]::TEXT[];
  montos NUMERIC[] := ARRAY[]::NUMERIC[];
  prioridades INTEGER[] := ARRAY[]::INTEGER[];
  indice INTEGER;
  grupo INTEGER;
  posicion INTEGER;
  prioridad INTEGER;
  metodo TEXT;
  nombreCombinado TEXT;
  clave TEXT;
  monto NUMERIC;
BEGIN
  codigos := array_fill('0'::TEXT, ARRAY[4]);
  importes := array_fill(0::NUMERIC, ARRAY[4]);
  FOR indice IN 1..4 LOOP
    metodo := upper(btrim(coalesce(metodos[indice], '0')));
    monto := coalesce(valores[indice], 0);
    IF metodo = '0' AND monto = 0 THEN CONTINUE; END IF;
    IF metodo IN ('', '0') OR monto <= 0 THEN
      RAISE EXCEPTION 'Cada pago requiere un medio y un importe positivo valido' USING ERRCODE = '23514';
    END IF;
    prioridad := pos_posicion_medio_pago(metodo);
    clave := CASE WHEN prioridad > 0 THEN 'posicion:' || prioridad::TEXT ELSE 'medio:' || metodo END;
    SELECT indices.pos INTO grupo FROM generate_subscripts(claves, 1) AS indices(pos) WHERE claves[indices.pos] = clave;
    IF grupo IS NULL THEN
      claves := array_append(claves, clave);
      nombres := array_append(nombres, metodo);
      montos := array_append(montos, monto);
      prioridades := array_append(prioridades, prioridad);
    ELSE
      SELECT string_agg(parte, '/' ORDER BY parte COLLATE "C") INTO nombreCombinado
      FROM (SELECT DISTINCT unnest(string_to_array(nombres[grupo], '/') || string_to_array(metodo, '/')) AS parte) AS partes;
      nombres[grupo] := nombreCombinado;
      montos[grupo] := montos[grupo] + monto;
    END IF;
  END LOOP;
  FOR grupo IN SELECT indices.pos FROM generate_subscripts(claves, 1) AS indices(pos) WHERE prioridades[indices.pos] > 0 LOOP
    posicion := prioridades[grupo];
    codigos[posicion] := nombres[grupo];
    importes[posicion] := montos[grupo];
  END LOOP;
  FOR grupo IN SELECT indices.pos FROM generate_subscripts(claves, 1) AS indices(pos)
    WHERE prioridades[indices.pos] = 0 ORDER BY nombres[indices.pos] COLLATE "C" LOOP
    posicion := NULL;
    FOREACH indice IN ARRAY ARRAY[4, 1, 2, 3] LOOP
      IF codigos[indice] = '0' THEN posicion := indice; EXIT; END IF;
    END LOOP;
    IF posicion IS NULL THEN
      RAISE EXCEPTION 'No hay columnas disponibles para conservar todos los medios de pago' USING ERRCODE = '23514';
    END IF;
    codigos[posicion] := nombres[grupo];
    importes[posicion] := montos[grupo];
  END LOOP;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION pos_fijar_columnas_pago() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE normalizado RECORD;
BEGIN
  SELECT * INTO normalizado FROM pos_ubicar_pagos(
    ARRAY[NEW.metodopago1, NEW.metodopago2, NEW.metodopago3, NEW.metodopago4],
    ARRAY[NEW.valor1, NEW.valor2, NEW.valor3, NEW.valor4]);
  NEW.metodopago1 := normalizado.codigos[1]; NEW.valor1 := normalizado.importes[1];
  NEW.metodopago2 := normalizado.codigos[2]; NEW.valor2 := normalizado.importes[2];
  NEW.metodopago3 := normalizado.codigos[3]; NEW.valor3 := normalizado.importes[3];
  NEW.metodopago4 := normalizado.codigos[4]; NEW.valor4 := normalizado.importes[4];
  RETURN NEW;
END;
$$;

DO $$
DECLARE tabla TEXT;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tabla || '_pagos_posicion_fija', tabla);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION pos_fijar_columnas_pago()', tabla || '_pagos_posicion_fija', tabla);
    EXECUTE format('UPDATE %I SET metodopago1 = metodopago1', tabla);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('%I', tabla)::regclass AND conname = tabla || '_pagos_posicion_fija_check') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (pos_posicion_medio_pago(metodopago1) IN (0,1) AND pos_posicion_medio_pago(metodopago2) IN (0,2) AND pos_posicion_medio_pago(metodopago3) IN (0,3) AND pos_posicion_medio_pago(metodopago4) = 0)', tabla, tabla || '_pagos_posicion_fija_check');
    END IF;
  END LOOP;
END;
$$;

COMMIT;