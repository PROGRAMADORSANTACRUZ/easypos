BEGIN;

ALTER TABLE "Factura" ADD COLUMN IF NOT EXISTS "TotalConsumo" DOUBLE PRECISION;
ALTER TABLE "FacturaVenta" ADD COLUMN IF NOT EXISTS "TotalConsumo" DOUBLE PRECISION;

UPDATE "Factura" SET "TotalConsumo" = "Total" WHERE "TotalConsumo" IS NULL;
UPDATE "FacturaVenta" SET "TotalConsumo" = "Total" WHERE "TotalConsumo" IS NULL;

ALTER TABLE "Factura" ALTER COLUMN "TotalConsumo" SET DEFAULT 0, ALTER COLUMN "TotalConsumo" SET NOT NULL;
ALTER TABLE "FacturaVenta" ALTER COLUMN "TotalConsumo" SET DEFAULT 0, ALTER COLUMN "TotalConsumo" SET NOT NULL;

CREATE OR REPLACE FUNCTION pos_sincronizar_consumo_legacy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."TotalConsumo" = 0 AND NEW."Total" <> 0 THEN
      NEW."TotalConsumo" := NEW."Total";
    END IF;
  ELSIF NEW."Total" IS DISTINCT FROM OLD."Total"
    AND NEW."TotalConsumo" IS NOT DISTINCT FROM OLD."TotalConsumo" THEN
    NEW."TotalConsumo" := NEW."Total";
  END IF;
  NEW."Total" := NEW."TotalConsumo";
  RETURN NEW;
END;
$$;

DO $$
DECLARE tabla TEXT;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = format('%I', tabla)::regclass
      AND tgname IN (tabla || '_sincronizar_consumo_legacy', tabla || '_total_con_propina')) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION pos_sincronizar_consumo_legacy()', tabla || '_sincronizar_consumo_legacy', tabla);
    END IF;
  END LOOP;
END;
$$;

COMMIT;