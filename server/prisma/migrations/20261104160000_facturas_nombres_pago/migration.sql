BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "Factura", "FacturaVenta" IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  tabla text;
  indice integer;
  campo_metodo text;
  campo_valor text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    FOR indice IN 1..4 LOOP
      campo_metodo := 'metodopago' || indice;
      campo_valor := 'valor' || indice;
      EXECUTE format('UPDATE %I SET %I = regexp_replace(btrim(translate(%I, chr(160) || chr(8239), %L)), %L, %L)',
        tabla, campo_metodo, campo_metodo, '  ', '\s+\$.*$', '');
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (
        (%I = %L AND %I = 0) OR
        (%I <> %L AND btrim(%I) <> %L AND strpos(%I, %L) = 0 AND %I > 0))',
        tabla, tabla || '_pago' || indice || '_check',
        campo_metodo, '0', campo_valor,
        campo_metodo, '0', campo_metodo, '', campo_metodo, '$', campo_valor);
    END LOOP;
  END LOOP;
END $$;

COMMIT;