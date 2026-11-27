-- Devoluciones de facturas (documento 1NE en Siesa). Solo agrega tablas y permisos nuevos.
CREATE TABLE IF NOT EXISTS "Devoluciones" (
  "Id" UUID NOT NULL,
  "CompaniaCodigo" VARCHAR(3) NOT NULL,
  "CentroOperacionCodigo" VARCHAR(10) NOT NULL,
  "TipoDocumentoCodigo" VARCHAR(20) NOT NULL,
  "Prefijo" VARCHAR(20) NOT NULL,
  "Numero" INTEGER NOT NULL,
  "Origen" VARCHAR(15) NOT NULL,
  "FacturaId" UUID NOT NULL,
  "FacturaTipoDocumento" VARCHAR(20) NOT NULL,
  "FacturaPrefijo" VARCHAR(20) NOT NULL,
  "FacturaNumero" INTEGER NOT NULL,
  "ClienteId" UUID,
  "NumeroDocumentoCliente" VARCHAR(30),
  "NombreCliente" VARCHAR(200),
  "DireccionCliente" VARCHAR(200),
  "SucursalCliente" VARCHAR(200),
  "FormaPago" VARCHAR(10) NOT NULL,
  "Total" DOUBLE PRECISION NOT NULL,
  "Motivo" VARCHAR(500) NOT NULL,
  "AperturaId" UUID,
  "UsuarioId" UUID,
  "UsuarioNombre" VARCHAR(100),
  "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Devoluciones_pkey" PRIMARY KEY ("Id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Devoluciones_documento_key"
  ON "Devoluciones" ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumentoCodigo", "Numero");
CREATE INDEX IF NOT EXISTS "Devoluciones_FacturaId_idx" ON "Devoluciones" ("FacturaId");

CREATE TABLE IF NOT EXISTS "DevolucionesDetalle" (
  "Id" UUID NOT NULL,
  "DevolucionId" UUID NOT NULL,
  "FacturaDetalleId" UUID NOT NULL,
  "ProductoId" UUID,
  "ProductoCodigo" VARCHAR(50),
  "ProductoNombre" VARCHAR(250),
  "Unidad" VARCHAR(10),
  "Cantidad" DOUBLE PRECISION NOT NULL,
  "PrecioUnitario" DOUBLE PRECISION NOT NULL,
  "Total" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "DevolucionesDetalle_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "DevolucionesDetalle_DevolucionId_fkey" FOREIGN KEY ("DevolucionId")
    REFERENCES "Devoluciones" ("Id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DevolucionesDetalle_DevolucionId_idx" ON "DevolucionesDetalle" ("DevolucionId");
CREATE INDEX IF NOT EXISTS "DevolucionesDetalle_FacturaDetalleId_idx" ON "DevolucionesDetalle" ("FacturaDetalleId");

INSERT INTO "Permiso" ("codigo", "nombre", "modulo") VALUES
  ('devoluciones.ver', 'devoluciones.ver', 'devoluciones'),
  ('devoluciones.crear', 'devoluciones.crear', 'devoluciones')
ON CONFLICT ("codigo") DO UPDATE SET "nombre" = EXCLUDED."nombre", "modulo" = EXCLUDED."modulo";

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id"
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE r."nombre" IN ('ADMIN', 'CAJERO')
  AND p."codigo" IN ('devoluciones.ver', 'devoluciones.crear')
ON CONFLICT ("rolId", "permisoId") DO NOTHING;