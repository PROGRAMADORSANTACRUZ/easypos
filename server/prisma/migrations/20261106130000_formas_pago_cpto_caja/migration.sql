BEGIN;

LOCK TABLE "FormasPago" IN ACCESS EXCLUSIVE MODE;

CREATE TABLE "FormasPago_por_concepto" (
  "ClaseCpto" VARCHAR(10) NOT NULL DEFAULT 'RECOGIDA',
  "CptoCaja" VARCHAR(10) NOT NULL,
  "DescCptoCaja" VARCHAR(120) NOT NULL,
  "MedioPago" VARCHAR(10) NOT NULL,
  "Moneda" VARCHAR(3) NOT NULL DEFAULT 'COP',
  "ManejaDocumento" BOOLEAN NOT NULL DEFAULT false,
  "Cuenta" VARCHAR(30),
  "Exportado" BOOLEAN NOT NULL DEFAULT false,
  "ConsignarEn" VARCHAR(60),
  "TipoDatafono" VARCHAR(40),
  "IdBodega" INTEGER DEFAULT 0,
  "FormaPagoDian" VARCHAR(40),
  "Activo" BOOLEAN NOT NULL DEFAULT true,
  "Id" UUID,
  "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormasPago_por_concepto_pkey" PRIMARY KEY ("CptoCaja"),
  CONSTRAINT "FormasPago_por_concepto_clase_check" CHECK ("ClaseCpto" IN ('ADICION', 'RECOGIDA')),
  CONSTRAINT "FormasPago_por_concepto_codigo_check" CHECK ("CptoCaja" ~ '^[A-Z0-9_-]{1,10}$' AND "MedioPago" ~ '^[A-Z0-9_-]{1,10}$'),
  CONSTRAINT "FormasPago_por_concepto_moneda_check" CHECK ("Moneda" ~ '^[A-Z]{3}$'),
  CONSTRAINT "FormasPago_por_concepto_descripcion_check" CHECK (length(trim("DescCptoCaja")) > 0)
);

CREATE UNIQUE INDEX "FormasPago_por_concepto_Id_key" ON "FormasPago_por_concepto"("Id");

INSERT INTO "FormasPago_por_concepto" (
  "ClaseCpto", "CptoCaja", "DescCptoCaja", "MedioPago", "Moneda", "ManejaDocumento", "Cuenta", "Exportado",
  "ConsignarEn", "TipoDatafono", "IdBodega", "FormaPagoDian", "Activo", "Id", "FechaCreacion"
)
SELECT 'RECOGIDA', 'LEG' || lpad(row_number() OVER (ORDER BY "FechaCreacion", "Id")::text, 6, '0'),
  "FormaPago", 'LEG' || lpad(row_number() OVER (ORDER BY "FechaCreacion", "Id")::text, 6, '0'), 'COP',
  "ManejaDocumento", "Cuenta", "Exportado", "ConsignarEn", "TipoDatafono", "IdBodega", "FormaPagoDian", "Activo", "Id", "FechaCreacion"
FROM "FormasPago";

DO $$
BEGIN
  IF (SELECT count(*) FROM "FormasPago") <> (SELECT count(*) FROM "FormasPago_por_concepto") THEN
    RAISE EXCEPTION 'La copia no conserva todos los medios de pago anteriores';
  END IF;
  IF EXISTS (
    SELECT "Id", "FormaPago", "ManejaDocumento", "Cuenta", "Exportado", "ConsignarEn", "TipoDatafono", "IdBodega", "FormaPagoDian", "Activo", "FechaCreacion" FROM "FormasPago"
    EXCEPT ALL
    SELECT "Id", "DescCptoCaja", "ManejaDocumento", "Cuenta", "Exportado", "ConsignarEn", "TipoDatafono", "IdBodega", "FormaPagoDian", "Activo", "FechaCreacion" FROM "FormasPago_por_concepto"
  ) THEN
    RAISE EXCEPTION 'Los datos anteriores de medios de pago no coinciden';
  END IF;
END $$;

INSERT INTO "FormasPago_por_concepto" ("ClaseCpto", "CptoCaja", "DescCptoCaja", "MedioPago", "Moneda") VALUES
  ('ADICION', 'DOM', 'DOMICILIOS', 'DOM', 'COP'),
  ('RECOGIDA', 'DAT', 'DATAFONOS TD-TC INTEGRADOS', 'DAT', 'COP'),
  ('RECOGIDA', 'DTF', 'DATAFONOS TD-TC', 'DTF', 'COP'),
  ('RECOGIDA', 'EFE', 'REC EFECTIVO', 'EFE', 'COP'),
  ('RECOGIDA', 'PSE', 'PSE', 'PSE', 'COP'),
  ('RECOGIDA', 'QR', 'QR', 'QR', 'COP'),
  ('RECOGIDA', 'TRE', 'TRANS BANCOLOMBIA CARTAGENA', 'TRE', 'COP'),
  ('RECOGIDA', 'TRH', 'TRANS BOGOTA CARTAGENA', 'TRH', 'COP');

ALTER TABLE "FormasPago" RENAME TO "FormasPago_backup_20261106";
ALTER TABLE "FormasPago_backup_20261106" RENAME CONSTRAINT "FormasPago_pkey" TO "FormasPago_backup_20261106_pkey";
ALTER TABLE "FormasPago_por_concepto" RENAME TO "FormasPago";
ALTER TABLE "FormasPago" RENAME CONSTRAINT "FormasPago_por_concepto_pkey" TO "FormasPago_pkey";
ALTER INDEX "FormasPago_por_concepto_Id_key" RENAME TO "FormasPago_Id_key";

COMMIT;