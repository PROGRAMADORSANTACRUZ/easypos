BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "Factura", "FacturaVenta" IN ACCESS EXCLUSIVE MODE;

CREATE SCHEMA respaldo_valores_pago_20261104;
CREATE TABLE respaldo_valores_pago_20261104."Factura" AS TABLE "Factura";
CREATE TABLE respaldo_valores_pago_20261104."FacturaVenta" AS TABLE "FacturaVenta";

CREATE FUNCTION pg_temp.valor_pago_registrado(metodo text) RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE
  captura text[];
  importe numeric;
BEGIN
  metodo := btrim(translate(metodo, chr(160) || chr(8239), '  '));
  IF metodo = '0' THEN RETURN 0; END IF;
  captura := regexp_match(metodo, '^(.+?)\s+\$\s*((?:[0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)(?:,[0-9]{1,2})?)$');
  IF captura IS NULL OR btrim(captura[1]) = '0' THEN
    RAISE EXCEPTION 'No se puede extraer un valor de pago verificable de %', metodo;
  END IF;
  importe := replace(replace(captura[2], '.', ''), ',', '.')::numeric;
  IF importe <= 0 OR importe > 90071992547409.91 THEN
    RAISE EXCEPTION 'El importe no es positivo o excede la precision admitida: %', metodo;
  END IF;
  RETURN importe;
END $$;

DO $$
DECLARE
  tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN valor1 numeric(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN valor2 numeric(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN valor3 numeric(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN valor4 numeric(18,2) NOT NULL DEFAULT 0', tabla);
    EXECUTE format('UPDATE %I SET valor1 = pg_temp.valor_pago_registrado(metodopago1),
      valor2 = pg_temp.valor_pago_registrado(metodopago2),
      valor3 = pg_temp.valor_pago_registrado(metodopago3),
      valor4 = pg_temp.valor_pago_registrado(metodopago4)', tabla);
  END LOOP;
END $$;

COMMIT;