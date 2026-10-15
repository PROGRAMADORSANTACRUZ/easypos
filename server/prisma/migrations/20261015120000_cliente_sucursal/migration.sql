BEGIN;

LOCK TABLE "Cliente" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
	IF to_regclass('"Cliente_backup_20261015"') IS NOT NULL THEN
		RAISE EXCEPTION 'Ya existe la tabla de respaldo Cliente_backup_20261015';
	END IF;
END $$;

CREATE TEMP TABLE cliente_fk_backup ON COMMIT DROP AS
SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE confrelid = '"Cliente"'::regclass AND contype = 'f';

CREATE TABLE "Cliente_reordenada" (
	"Id" UUID NOT NULL,
	"TipoCliente" VARCHAR(20) NOT NULL DEFAULT 'NATURAL',
	"TipoDocumento" VARCHAR(10),
	"NumeroDocumento" VARCHAR(20),
	"RazonSocial" VARCHAR(200),
	documento TEXT,
	nombre TEXT NOT NULL,
	nombres TEXT,
	apellidos TEXT,
	"Sucursal" VARCHAR(200),
	"Telefono" VARCHAR(50),
	"Direccion" TEXT,
	barrio TEXT,
	ciudad TEXT,
	"Email" VARCHAR(150),
	"MunicipioCodigo" VARCHAR(10),
	"MunicipioSiesaCodigo" VARCHAR(8),
	"ResponsableIVA" BOOLEAN NOT NULL DEFAULT FALSE,
	"PorcentajeEmpleado" DOUBLE PRECISION,
	"PorcentajeCliente" DOUBLE PRECISION,
	"condicionPago" TEXT NOT NULL DEFAULT 'CONTADO',
	"creditoDias" INTEGER,
	"creditoCupo" DOUBLE PRECISION,
	activo BOOLEAN NOT NULL DEFAULT TRUE,
	"FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "Cliente_reordenada_pkey" PRIMARY KEY ("Id"),
	CONSTRAINT "Cliente_reordenada_MunicipioSiesaCodigo_fkey"
		FOREIGN KEY ("MunicipioSiesaCodigo") REFERENCES "CiudadesSiesa"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Cliente_reordenada_documento_key" ON "Cliente_reordenada" (documento);
CREATE INDEX "Cliente_reordenada_MunicipioSiesaCodigo_idx" ON "Cliente_reordenada" ("MunicipioSiesaCodigo");

INSERT INTO "Cliente_reordenada" (
	"Id", "TipoCliente", "TipoDocumento", "NumeroDocumento", "RazonSocial", documento,
	nombre, nombres, apellidos, "Telefono", "Direccion", barrio, ciudad, "Email",
	"MunicipioCodigo", "MunicipioSiesaCodigo", "ResponsableIVA", "PorcentajeEmpleado",
	"PorcentajeCliente", "condicionPago", "creditoDias", "creditoCupo", activo, "FechaCreacion"
)
SELECT
	"Id", "TipoCliente", "TipoDocumento", "NumeroDocumento", "RazonSocial", documento,
	nombre, nombres, apellidos, "Telefono", "Direccion", barrio, ciudad, "Email",
	"MunicipioCodigo", "MunicipioSiesaCodigo", "ResponsableIVA", "PorcentajeEmpleado",
	"PorcentajeCliente", "condicionPago", "creditoDias", "creditoCupo", activo, "FechaCreacion"
FROM "Cliente";

DO $$
BEGIN
	IF EXISTS (
		SELECT "Id", "TipoCliente", "TipoDocumento", "NumeroDocumento", "RazonSocial", documento,
			nombre, nombres, apellidos, "Telefono", "Direccion", barrio, ciudad, "Email",
			"MunicipioCodigo", "MunicipioSiesaCodigo", "ResponsableIVA", "PorcentajeEmpleado",
			"PorcentajeCliente", "condicionPago", "creditoDias", "creditoCupo", activo, "FechaCreacion"
		FROM "Cliente"
		EXCEPT ALL
		SELECT "Id", "TipoCliente", "TipoDocumento", "NumeroDocumento", "RazonSocial", documento,
			nombre, nombres, apellidos, "Telefono", "Direccion", barrio, ciudad, "Email",
			"MunicipioCodigo", "MunicipioSiesaCodigo", "ResponsableIVA", "PorcentajeEmpleado",
			"PorcentajeCliente", "condicionPago", "creditoDias", "creditoCupo", activo, "FechaCreacion"
		FROM "Cliente_reordenada"
	) OR EXISTS (
		SELECT "Id", "TipoCliente", "TipoDocumento", "NumeroDocumento", "RazonSocial", documento,
			nombre, nombres, apellidos, "Telefono", "Direccion", barrio, ciudad, "Email",
			"MunicipioCodigo", "MunicipioSiesaCodigo", "ResponsableIVA", "PorcentajeEmpleado",
			"PorcentajeCliente", "condicionPago", "creditoDias", "creditoCupo", activo, "FechaCreacion"
		FROM "Cliente_reordenada"
		EXCEPT ALL
		SELECT "Id", "TipoCliente", "TipoDocumento", "NumeroDocumento", "RazonSocial", documento,
			nombre, nombres, apellidos, "Telefono", "Direccion", barrio, ciudad, "Email",
			"MunicipioCodigo", "MunicipioSiesaCodigo", "ResponsableIVA", "PorcentajeEmpleado",
			"PorcentajeCliente", "condicionPago", "creditoDias", "creditoCupo", activo, "FechaCreacion"
		FROM "Cliente"
	) THEN
		RAISE EXCEPTION 'La copia de Cliente no coincide; se cancela la reorganización';
	END IF;
END $$;

DO $$
DECLARE
	fk RECORD;
BEGIN
	FOR fk IN SELECT tabla, conname FROM cliente_fk_backup LOOP
		EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tabla, fk.conname);
	END LOOP;
END $$;

ALTER TABLE "Cliente" RENAME TO "Cliente_backup_20261015";
ALTER TABLE "Cliente_backup_20261015" RENAME CONSTRAINT "Cliente_pkey" TO "Cliente_backup_20261015_pkey";
ALTER TABLE "Cliente_backup_20261015" RENAME CONSTRAINT "Cliente_MunicipioSiesaCodigo_fkey" TO "Cliente_backup_20261015_MunicipioSiesaCodigo_fkey";
ALTER INDEX "Cliente_documento_key" RENAME TO "Cliente_backup_20261015_documento_key";
ALTER INDEX "Cliente_MunicipioSiesaCodigo_idx" RENAME TO "Cliente_backup_20261015_MunicipioSiesaCodigo_idx";

ALTER TABLE "Cliente_reordenada" RENAME TO "Cliente";
ALTER TABLE "Cliente" RENAME CONSTRAINT "Cliente_reordenada_pkey" TO "Cliente_pkey";
ALTER TABLE "Cliente" RENAME CONSTRAINT "Cliente_reordenada_MunicipioSiesaCodigo_fkey" TO "Cliente_MunicipioSiesaCodigo_fkey";
ALTER INDEX "Cliente_reordenada_documento_key" RENAME TO "Cliente_documento_key";
ALTER INDEX "Cliente_reordenada_MunicipioSiesaCodigo_idx" RENAME TO "Cliente_MunicipioSiesaCodigo_idx";

DO $$
DECLARE
	fk RECORD;
BEGIN
	FOR fk IN SELECT tabla, conname, definicion FROM cliente_fk_backup LOOP
		EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.tabla, fk.conname, fk.definicion);
	END LOOP;
END $$;

COMMIT;