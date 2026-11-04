BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "Factura", "FacturaVenta", "FacturaOperacion", "FacturaVentaOperacion" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "TiposDocumento" IN SHARE MODE;

CREATE SCHEMA respaldo_tipo_prefijo_20261104;
CREATE TABLE respaldo_tipo_prefijo_20261104."FacturaOperacion" AS TABLE "FacturaOperacion";
CREATE TABLE respaldo_tipo_prefijo_20261104."FacturaVentaOperacion" AS TABLE "FacturaVentaOperacion";

CREATE TABLE respaldo_tipo_prefijo_20261104."Asignacion" AS
SELECT 'Factura'::text AS tabla, f."CompaniaCodigo", f."CentroOperacionCodigo",
  f."TipoDocumento" AS "TipoAnterior", f."TipoDocumento" AS "Prefijo", f.numero,
  CASE WHEN o."TipoDocumentoId" IS NOT NULL THEN t."Codigo"
    WHEN candidato.cantidad = 1 THEN candidato.codigo END AS "TipoDocumento",
  o."Id" AS "OperacionId", o."TipoDocumentoId",
  t."CompaniaCodigo" AS "CompaniaTipo", t."CentroOperacionCodigo" AS "CentroTipo"
FROM "Factura" f JOIN "FacturaOperacion" o USING ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero)
LEFT JOIN "TiposDocumento" t ON t."Id" = o."TipoDocumentoId"
LEFT JOIN LATERAL (
  SELECT min("Codigo") AS codigo, count(*) AS cantidad FROM "TiposDocumento"
  WHERE "CompaniaCodigo" = f."CompaniaCodigo" AND "CentroOperacionCodigo" = f."CentroOperacionCodigo"
    AND "Codigo" = f."TipoDocumento" AND "EsElectronico" = true
) candidato ON o."TipoDocumentoId" IS NULL
UNION ALL
SELECT 'FacturaVenta', f."CompaniaCodigo", f."CentroOperacionCodigo", f."TipoDocumento", f."TipoDocumento", f.numero,
  CASE WHEN o."TipoDocumentoId" IS NOT NULL THEN t."Codigo"
    WHEN candidato.cantidad = 1 THEN candidato.codigo END,
  o."Id", o."TipoDocumentoId", t."CompaniaCodigo", t."CentroOperacionCodigo"
FROM "FacturaVenta" f JOIN "FacturaVentaOperacion" o USING ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero)
LEFT JOIN "TiposDocumento" t ON t."Id" = o."TipoDocumentoId"
LEFT JOIN LATERAL (
  SELECT min("Codigo") AS codigo, count(*) AS cantidad FROM "TiposDocumento"
  WHERE "CompaniaCodigo" = f."CompaniaCodigo" AND "CentroOperacionCodigo" = f."CentroOperacionCodigo"
    AND "Codigo" = f."TipoDocumento" AND "EsElectronico" = false
) candidato ON o."TipoDocumentoId" IS NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM respaldo_tipo_prefijo_20261104."Asignacion")
    <> (SELECT (SELECT count(*) FROM "Factura") + (SELECT count(*) FROM "FacturaVenta")) THEN
    RAISE EXCEPTION 'Hay cabeceras sin una operacion asociada; no se puede separar el tipo y el prefijo';
  END IF;
  IF EXISTS (SELECT 1 FROM respaldo_tipo_prefijo_20261104."Asignacion"
    WHERE "TipoDocumento" IS NULL OR btrim("TipoDocumento") = '' OR btrim("Prefijo") = ''
      OR ("TipoDocumentoId" IS NOT NULL AND ("CompaniaTipo" IS DISTINCT FROM "CompaniaCodigo"
        OR "CentroTipo" IS DISTINCT FROM "CentroOperacionCodigo"))) THEN
    RAISE EXCEPTION 'No se pudo identificar sin ambiguedad el codigo documental de todas las facturas';
  END IF;
  IF EXISTS (SELECT 1 FROM respaldo_tipo_prefijo_20261104."Asignacion"
    GROUP BY tabla, "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'La separacion generaria claves documentales duplicadas';
  END IF;
END $$;

DO $$
DECLARE
  nombre_tabla text;
  indice integer;
  conservaba_pausa boolean;
BEGIN
  FOREACH nombre_tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'f'
      AND confrelid = format('public.%I', nombre_tabla)::regclass
      AND conrelid <> format('public.%I', nombre_tabla || 'Operacion')::regclass) THEN
      RAISE EXCEPTION 'Hay referencias adicionales a % que requieren revision', nombre_tabla;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_depend dependencia
      JOIN pg_rewrite reescritura ON reescritura.oid = dependencia.objid
      JOIN pg_class vista ON vista.oid = reescritura.ev_class
      WHERE dependencia.refobjid = format('public.%I', nombre_tabla)::regclass AND vista.relkind IN ('v', 'm')) THEN
      RAISE EXCEPTION 'Hay vistas dependientes de % que requieren revision', nombre_tabla;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN "Prefijo" varchar(20)', nombre_tabla || 'Operacion');
    EXECUTE format('UPDATE public.%I SET "Prefijo" = "TipoDocumento"', nombre_tabla || 'Operacion');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN "Prefijo" SET NOT NULL', nombre_tabla || 'Operacion');
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', nombre_tabla || 'Operacion', nombre_tabla || 'Operacion_cabecera_fkey');
    SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = format('public.%I', nombre_tabla)::regclass
      AND tgname = '_pos_facturas_mantenimiento_20261104') INTO conservaba_pausa;
    IF conservaba_pausa THEN
      EXECUTE format('DROP TRIGGER _pos_facturas_mantenimiento_20261104 ON public.%I', nombre_tabla);
    END IF;
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA respaldo_tipo_prefijo_20261104', nombre_tabla);
    EXECUTE format('CREATE TABLE public.%I (
      "CompaniaCodigo" varchar(3) NOT NULL, "CentroOperacionCodigo" varchar(10) NOT NULL,
      "TipoDocumento" varchar(20) NOT NULL, "Prefijo" varchar(20) NOT NULL,
      fecha timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, numero integer NOT NULL,
      "NumeroDocumentoCliente" text, "NombreCliente" text, "SucursalCliente" varchar(200),
      "TelefonoCliente" varchar(50), "DireccionCliente" text, "BarrioCliente" text, "CiudadCliente" text, "EmailCliente" varchar(150),
      "Subtotal" double precision NOT NULL, "impuestoPct" double precision NOT NULL,
      "IVA" double precision NOT NULL, "Total" double precision NOT NULL, "Propina" double precision NOT NULL DEFAULT 0,
      metodopago1 text NOT NULL DEFAULT %L, valor1 numeric(18,2) NOT NULL DEFAULT 0,
      metodopago2 text NOT NULL DEFAULT %L, valor2 numeric(18,2) NOT NULL DEFAULT 0,
      metodopago3 text NOT NULL DEFAULT %L, valor3 numeric(18,2) NOT NULL DEFAULT 0,
      metodopago4 text NOT NULL DEFAULT %L, valor4 numeric(18,2) NOT NULL DEFAULT 0,
      credito boolean NOT NULL DEFAULT false, "creditoDias" integer, vence timestamp(3),
      "CUFE" varchar(200), "NumeroFactus" varchar(50), "XmlPath" text, "PdfPath" text,
      "EstadoDIAN" varchar(50), "Usuario" varchar(50) NOT NULL,
      CONSTRAINT %I PRIMARY KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero),
      CONSTRAINT %I CHECK (numero > 0))', nombre_tabla, '0', '0', '0', '0', nombre_tabla || '_pkey', nombre_tabla || '_numero_check');
    EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I,
      to_jsonb(original) || jsonb_build_object(%L, original."TipoDocumento"))).*
      FROM respaldo_tipo_prefijo_20261104.%I original', nombre_tabla, nombre_tabla, 'Prefijo', nombre_tabla);
    FOR indice IN 1..4 LOOP
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
        (%I = %L AND %I = 0) OR (%I <> %L AND btrim(%I) <> %L AND strpos(%I, %L) = 0 AND %I > 0))',
        nombre_tabla, nombre_tabla || '_pago' || indice || '_check',
        'metodopago' || indice, '0', 'valor' || indice,
        'metodopago' || indice, '0', 'metodopago' || indice, '', 'metodopago' || indice, '$', 'valor' || indice);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I
      FOREIGN KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero)
      REFERENCES public.%I ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero)
      ON DELETE CASCADE ON UPDATE CASCADE', nombre_tabla || 'Operacion', nombre_tabla || 'Operacion_cabecera_fkey', nombre_tabla);
    IF conservaba_pausa THEN
      EXECUTE format('CREATE TRIGGER _pos_facturas_mantenimiento_20261104 BEFORE INSERT OR UPDATE OR DELETE
        ON public.%I FOR EACH ROW EXECUTE FUNCTION public._pos_facturas_mantenimiento_20261104()', nombre_tabla);
    END IF;
  END LOOP;
END $$;

COMMIT;