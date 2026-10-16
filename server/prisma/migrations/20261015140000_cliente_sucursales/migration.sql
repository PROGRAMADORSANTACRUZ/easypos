BEGIN;

CREATE SEQUENCE "ClienteSucursalIdSeq" START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE TABLE "SucursalesClientes" (
  "Id" VARCHAR(20) NOT NULL DEFAULT ('001' || lpad(nextval('"ClienteSucursalIdSeq"'::regclass)::text, 6, '0')),
  "ClienteId" UUID NOT NULL,
  "Nombre" VARCHAR(120) NOT NULL,
  "Telefono" VARCHAR(50),
  "Direccion" TEXT,
  "Barrio" TEXT,
  "Ciudad" TEXT,
  "Email" VARCHAR(150),
  "MunicipioSiesaCodigo" VARCHAR(8),
  "Activo" BOOLEAN NOT NULL DEFAULT TRUE,
  "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SucursalesClientes_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "SucursalesClientes_Id_prefijo_check" CHECK ("Id" LIKE '001%'),
  CONSTRAINT "SucursalesClientes_ClienteId_fkey" FOREIGN KEY ("ClienteId") REFERENCES "Cliente"("Id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "SucursalesClientes_MunicipioSiesaCodigo_fkey" FOREIGN KEY ("MunicipioSiesaCodigo") REFERENCES "CiudadesSiesa"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL
);

ALTER SEQUENCE "ClienteSucursalIdSeq" OWNED BY "SucursalesClientes"."Id";
CREATE INDEX "SucursalesClientes_ClienteId_idx" ON "SucursalesClientes" ("ClienteId");
CREATE INDEX "SucursalesClientes_MunicipioSiesaCodigo_idx" ON "SucursalesClientes" ("MunicipioSiesaCodigo");

INSERT INTO "SucursalesClientes" (
  "ClienteId", "Nombre", "Telefono", "Direccion", "Barrio", "Ciudad", "Email", "MunicipioSiesaCodigo"
)
SELECT "Id", "Sucursal", "Telefono", "Direccion", barrio, ciudad, "Email", "MunicipioSiesaCodigo"
FROM "Cliente"
WHERE NULLIF(BTRIM("Sucursal"), '') IS NOT NULL;

DO $$
DECLARE
  sucursales_anteriores BIGINT;
  sucursales_migradas BIGINT;
BEGIN
  SELECT COUNT(*) INTO sucursales_anteriores
  FROM "Cliente"
  WHERE NULLIF(BTRIM("Sucursal"), '') IS NOT NULL;
  SELECT COUNT(*) INTO sucursales_migradas FROM "SucursalesClientes";
  IF sucursales_anteriores <> sucursales_migradas THEN
    RAISE EXCEPTION 'La migración de sucursales no coincide: % origen, % destino', sucursales_anteriores, sucursales_migradas;
  END IF;
END $$;

COMMIT;
