BEGIN;

CREATE OR REPLACE FUNCTION pos_total_factura_con_propina() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."TotalConsumo" = 0 AND NEW."Subtotal" + NEW."IVA" <> 0 THEN
    NEW."TotalConsumo" := round((NEW."Subtotal"::numeric + NEW."IVA"::numeric), 2)::double precision;
  END IF;
  NEW."Total" := round((NEW."TotalConsumo"::numeric + NEW."Propina"::numeric), 2)::double precision;
  RETURN NEW;
END;
$$;

DO $$
DECLARE tabla TEXT;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tabla || '_sincronizar_consumo_legacy', tabla);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tabla || '_total_con_propina', tabla);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION pos_total_factura_con_propina()', tabla || '_total_con_propina', tabla);
    EXECUTE format('UPDATE %I SET "Total" = round(("TotalConsumo"::numeric + "Propina"::numeric), 2)::double precision WHERE "Total" IS DISTINCT FROM round(("TotalConsumo"::numeric + "Propina"::numeric), 2)::double precision', tabla);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('%I', tabla)::regclass
      AND conname = tabla || '_total_incluye_propina_check') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (round("Total"::numeric, 2) = round("TotalConsumo"::numeric + "Propina"::numeric, 2))', tabla, tabla || '_total_incluye_propina_check');
    END IF;
  END LOOP;
END;
$$;

COMMIT;