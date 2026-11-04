BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE FUNCTION public._pos_facturas_mantenimiento_20261104() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('pos.migracion_facturas', true) IS DISTINCT FROM '20261104' THEN
    RAISE EXCEPTION 'Facturacion temporalmente en mantenimiento por reorganizacion de la base de datos'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER _pos_facturas_mantenimiento_20261104
BEFORE INSERT OR UPDATE OR DELETE ON "Factura"
FOR EACH ROW EXECUTE FUNCTION public._pos_facturas_mantenimiento_20261104();

CREATE TRIGGER _pos_facturas_mantenimiento_20261104
BEFORE INSERT OR UPDATE OR DELETE ON "FacturaVenta"
FOR EACH ROW EXECUTE FUNCTION public._pos_facturas_mantenimiento_20261104();

COMMIT;