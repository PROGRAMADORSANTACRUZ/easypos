BEGIN;

LOCK TABLE "Factura", "FacturaVenta" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "Usuarios", "TiposDocumento" IN SHARE MODE;

DO $$
BEGIN
  IF to_regnamespace('respaldo_facturas_20261104') IS NOT NULL
    OR to_regclass('"FacturaOperacion"') IS NOT NULL
    OR to_regclass('"FacturaVentaOperacion"') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe el respaldo o las tablas operativas de esta migracion';
  END IF;
END $$;

CREATE TEMP TABLE "_facturas_origen" ON COMMIT DROP AS
SELECT 'Factura'::text AS tabla, f."Id" AS id,
  COALESCE(f."CompaniaCodigo", t."CompaniaCodigo") AS compania,
  COALESCE(f."CentroOperacionCodigo", t."CentroOperacionCodigo") AS centro,
  COALESCE(NULLIF(f."Prefijo", ''), t."Prefijo") AS tipo,
  f."NumeroFactura" AS numero_texto,
  t."Id" AS tipo_id, t."CompaniaCodigo" AS tipo_compania,
  t."CentroOperacionCodigo" AS tipo_centro, t."Prefijo" AS tipo_codigo,
  u."Usuario" AS usuario, to_jsonb(f) AS datos
FROM "Factura" f
LEFT JOIN "TiposDocumento" t ON t."Id" = f."TipoDocumentoId"
LEFT JOIN "Usuarios" u ON u."Id" = f."UsuarioId"
UNION ALL
SELECT 'FacturaVenta', f."Id",
  COALESCE(f."CompaniaCodigo", t."CompaniaCodigo"),
  COALESCE(f."CentroOperacionCodigo", t."CentroOperacionCodigo"),
  COALESCE(NULLIF(f."Prefijo", ''), t."Prefijo"), f."Numero",
  t."Id", t."CompaniaCodigo", t."CentroOperacionCodigo", t."Prefijo",
  u."Usuario", to_jsonb(f)
FROM "FacturaVenta" f
LEFT JOIN "TiposDocumento" t ON t."Id" = f."TipoDocumentoId"
LEFT JOIN "Usuarios" u ON u."Id" = f."UsuarioId";

CREATE TEMP TABLE "_facturas_excepciones" ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(COALESCE(NULLIF(current_setting('pos.facturas_desvincular_tipo', true), ''), '[]')::jsonb)
AS excepcion(tabla text, id uuid, compania text, centro text, tipo text, numero text, tipo_id uuid);
ALTER TABLE "_facturas_origen" ADD COLUMN desvincular_tipo boolean NOT NULL DEFAULT false;
UPDATE "_facturas_origen" origen SET desvincular_tipo = true
FROM "_facturas_excepciones" excepcion
WHERE origen.tabla = excepcion.tabla AND origen.id = excepcion.id
  AND origen.compania = excepcion.compania AND origen.centro = excepcion.centro
  AND origen.tipo = excepcion.tipo AND origen.numero_texto = excepcion.numero
  AND origen.datos->>'TipoDocumentoId' = excepcion.tipo_id::text;

DO $$
DECLARE
  invalida record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM "_facturas_excepciones" excepcion
    WHERE NOT EXISTS (
      SELECT 1 FROM "_facturas_origen" origen WHERE origen.desvincular_tipo
        AND origen.tabla = excepcion.tabla AND origen.id = excepcion.id
        AND origen.compania = excepcion.compania AND origen.centro = excepcion.centro
        AND origen.tipo = excepcion.tipo AND origen.numero_texto = excepcion.numero
        AND origen.datos->>'TipoDocumentoId' = excepcion.tipo_id::text
    )
  ) THEN
    RAISE EXCEPTION 'Una excepcion autorizada no coincide exactamente con su documento original';
  END IF;
  SELECT tabla, id INTO invalida FROM "_facturas_origen"
  WHERE compania IS NULL OR btrim(compania) = ''
    OR centro IS NULL OR btrim(centro) = '' OR tipo IS NULL OR btrim(tipo) = ''
    OR usuario IS NULL OR btrim(usuario) = ''
    OR (NOT desvincular_tipo AND (tipo_id IS NULL OR compania IS DISTINCT FROM tipo_compania
      OR centro IS DISTINCT FROM tipo_centro OR tipo IS DISTINCT FROM tipo_codigo))
    OR numero_texto IS NULL OR numero_texto !~ '^[0-9]+$'
    OR CASE WHEN numero_texto ~ '^[0-9]+$'
      THEN numero_texto::numeric NOT BETWEEN 1 AND 2147483647 ELSE false END
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Documento % / % sin clave, tipo, numero entero o usuario valido; corregir antes de migrar', invalida.tabla, invalida.id;
  END IF;
  SELECT tabla, id INTO invalida FROM "_facturas_origen"
  WHERE tabla = 'FacturaVenta' AND datos->>'Consecutivo' IS NOT NULL
    AND (datos->>'Consecutivo')::integer <> numero_texto::integer
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Documento % / % tiene Numero y Consecutivo diferentes', invalida.tabla, invalida.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "_facturas_origen"
    GROUP BY tabla, compania, centro, tipo, numero_texto::integer HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay claves de factura duplicadas por compania, centro, tipo y numero';
  END IF;
END $$;

ALTER TABLE "_facturas_origen" ADD COLUMN cabecera jsonb;
UPDATE "_facturas_origen" SET cabecera = jsonb_build_object(
  'CompaniaCodigo', compania, 'CentroOperacionCodigo', centro, 'TipoDocumento', tipo,
  'fecha', datos->'Fecha', 'numero', numero_texto::integer,
  'NumeroDocumentoCliente', datos->'NumeroDocumentoCliente', 'NombreCliente', datos->'NombreCliente',
  'SucursalCliente', datos->'SucursalCliente', 'TelefonoCliente', datos->'TelefonoCliente',
  'DireccionCliente', datos->'DireccionCliente', 'BarrioCliente', datos->'BarrioCliente',
  'CiudadCliente', datos->'CiudadCliente', 'EmailCliente', datos->'EmailCliente',
  'Subtotal', datos->'Subtotal', 'impuestoPct', COALESCE(datos->'impuestoPct', datos->'ImpuestoPct'),
  'IVA', datos->'IVA', 'Total', datos->'Total', 'Propina', datos->'Propina',
  'metodoPago', COALESCE(datos->'metodoPago', datos->'MetodoPago'),
  'credito', COALESCE(datos->'credito', datos->'Credito'),
  'creditoDias', COALESCE(datos->'creditoDias', datos->'CreditoDias'),
  'vence', COALESCE(datos->'vence', datos->'Vence'),
  'CUFE', datos->'CUFE', 'NumeroFactus', datos->'NumeroFactus',
  'XmlPath', datos->'XmlPath', 'PdfPath', datos->'PdfPath', 'EstadoDIAN', datos->'EstadoDIAN',
  'Usuario', usuario
);

CREATE SCHEMA respaldo_facturas_20261104;
CREATE TABLE respaldo_facturas_20261104."Factura" AS TABLE "Factura";
CREATE TABLE respaldo_facturas_20261104."FacturaVenta" AS TABLE "FacturaVenta";

DROP VIEW IF EXISTS "FacturaOrdenada";
DROP VIEW IF EXISTS "FacturaVentaOrdenada";

ALTER TABLE "Factura" RENAME TO "FacturaOperacion";
ALTER TABLE "FacturaVenta" RENAME TO "FacturaVentaOperacion";

DO $$
DECLARE
  tabla text;
  restriccion record;
  indice record;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    FOR restriccion IN SELECT conname FROM pg_constraint WHERE conrelid = format('%I', tabla || 'Operacion')::regclass LOOP
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', tabla || 'Operacion',
        restriccion.conname, replace(restriccion.conname, tabla || '_', tabla || 'Operacion_'));
    END LOOP;
    FOR indice IN
      SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE i.indrelid = format('%I', tabla || 'Operacion')::regclass
        AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = i.indexrelid)
    LOOP
      EXECUTE format('ALTER INDEX %I RENAME TO %I', indice.relname,
        replace(indice.relname, tabla || '_', tabla || 'Operacion_'));
    END LOOP;
  END LOOP;
END $$;

CREATE TABLE "Factura" (
  "CompaniaCodigo" VARCHAR(3) NOT NULL,
  "CentroOperacionCodigo" VARCHAR(10) NOT NULL,
  "TipoDocumento" VARCHAR(20) NOT NULL,
  fecha TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  numero INTEGER NOT NULL,
  "NumeroDocumentoCliente" TEXT,
  "NombreCliente" TEXT,
  "SucursalCliente" VARCHAR(200),
  "TelefonoCliente" VARCHAR(50),
  "DireccionCliente" TEXT,
  "BarrioCliente" TEXT,
  "CiudadCliente" TEXT,
  "EmailCliente" VARCHAR(150),
  "Subtotal" DOUBLE PRECISION NOT NULL,
  "impuestoPct" DOUBLE PRECISION NOT NULL,
  "IVA" DOUBLE PRECISION NOT NULL,
  "Total" DOUBLE PRECISION NOT NULL,
  "Propina" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metodoPago" TEXT NOT NULL DEFAULT 'EFECTIVO',
  credito BOOLEAN NOT NULL DEFAULT FALSE,
  "creditoDias" INTEGER,
  vence TIMESTAMP(3),
  "CUFE" VARCHAR(200),
  "NumeroFactus" VARCHAR(50),
  "XmlPath" TEXT,
  "PdfPath" TEXT,
  "EstadoDIAN" VARCHAR(50),
  "Usuario" VARCHAR(50) NOT NULL,
  CONSTRAINT "Factura_pkey" PRIMARY KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero),
  CONSTRAINT "Factura_numero_check" CHECK (numero > 0)
);

CREATE TABLE "FacturaVenta" (LIKE "Factura" INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE "FacturaVenta" ADD CONSTRAINT "FacturaVenta_pkey"
  PRIMARY KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero);

INSERT INTO "Factura" SELECT (jsonb_populate_record(NULL::"Factura", cabecera)).*
FROM "_facturas_origen" WHERE tabla = 'Factura';
INSERT INTO "FacturaVenta" SELECT (jsonb_populate_record(NULL::"FacturaVenta", cabecera)).*
FROM "_facturas_origen" WHERE tabla = 'FacturaVenta';

DO $$
DECLARE
  tabla text;
  columna text;
  copia_distinta boolean;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['Factura', 'FacturaVenta'] LOOP
    EXECUTE format('SELECT EXISTS (
      (SELECT cabecera FROM "_facturas_origen" WHERE tabla = %L EXCEPT ALL SELECT to_jsonb(f) FROM %I f)
      UNION ALL
      (SELECT to_jsonb(f) FROM %I f EXCEPT ALL SELECT cabecera FROM "_facturas_origen" WHERE tabla = %L)
    )', tabla, tabla, tabla, tabla) INTO copia_distinta;
    IF copia_distinta THEN
      RAISE EXCEPTION 'La copia de % no coincide con los documentos originales', tabla;
    END IF;
    EXECUTE format('UPDATE %I f SET "CompaniaCodigo" = o.compania, "CentroOperacionCodigo" = o.centro, "Prefijo" = o.tipo,
      "TipoDocumentoId" = CASE WHEN o.desvincular_tipo THEN NULL ELSE f."TipoDocumentoId" END
      FROM "_facturas_origen" o WHERE o.tabla = %L AND o.id = f."Id"', tabla || 'Operacion', tabla);
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO numero', tabla || 'Operacion',
      CASE WHEN tabla = 'Factura' THEN 'NumeroFactura' ELSE 'Numero' END);
    EXECUTE format('ALTER TABLE %I RENAME COLUMN "Prefijo" TO "TipoDocumento"', tabla || 'Operacion');
    EXECUTE format('ALTER TABLE %I ALTER COLUMN numero TYPE integer USING numero::integer,
      ALTER COLUMN numero SET NOT NULL, ALTER COLUMN "TipoDocumento" SET NOT NULL,
      ALTER COLUMN "CompaniaCodigo" SET NOT NULL, ALTER COLUMN "CentroOperacionCodigo" SET NOT NULL', tabla || 'Operacion');
    FOREACH columna IN ARRAY ARRAY[
      'Fecha', 'NumeroDocumentoCliente', 'NombreCliente', 'SucursalCliente', 'TelefonoCliente',
      'DireccionCliente', 'BarrioCliente', 'CiudadCliente', 'EmailCliente',
      'Subtotal', 'IVA', 'Total', 'Propina', 'CUFE', 'NumeroFactus', 'XmlPath', 'PdfPath', 'EstadoDIAN',
      CASE WHEN tabla = 'Factura' THEN 'impuestoPct' ELSE 'ImpuestoPct' END,
      CASE WHEN tabla = 'Factura' THEN 'metodoPago' ELSE 'MetodoPago' END,
      CASE WHEN tabla = 'Factura' THEN 'credito' ELSE 'Credito' END,
      CASE WHEN tabla = 'Factura' THEN 'creditoDias' ELSE 'CreditoDias' END,
      CASE WHEN tabla = 'Factura' THEN 'vence' ELSE 'Vence' END
    ] LOOP
      EXECUTE format('ALTER TABLE %I DROP COLUMN %I', tabla || 'Operacion', columna);
    END LOOP;
    IF tabla = 'FacturaVenta' THEN
      ALTER TABLE "FacturaVentaOperacion" DROP COLUMN "Consecutivo";
    END IF;
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero)',
      tabla || 'Operacion', tabla || 'Operacion_documento_key');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero)
      REFERENCES %I ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", numero) ON DELETE CASCADE ON UPDATE CASCADE',
      tabla || 'Operacion', tabla || 'Operacion_cabecera_fkey', tabla);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I, DROP CONSTRAINT %I', tabla || 'Operacion',
      tabla || 'Operacion_CompaniaCodigo_fkey', tabla || 'Operacion_CentroOperacionCodigo_fkey');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON DELETE RESTRICT ON UPDATE CASCADE,
      ADD CONSTRAINT %I FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON DELETE RESTRICT ON UPDATE CASCADE',
      tabla || 'Operacion', tabla || 'Operacion_CompaniaCodigo_fkey', tabla || 'Operacion_CentroOperacionCodigo_fkey');
  END LOOP;
END $$;

COMMIT;