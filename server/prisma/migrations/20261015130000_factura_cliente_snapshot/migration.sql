BEGIN;

LOCK TABLE "Factura", "FacturaVenta", "Abono", "ComisionesVendedores", "EventosDIAN", "FacturaDetalle", "FacturaVentaDetalle", "NotasCredito", "NotasDebito", "Pagos", "RetencionesFactura" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('"Factura_backup_20261015"') IS NOT NULL OR to_regclass('"FacturaVenta_backup_20261015"') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existen tablas de respaldo para las facturas';
  END IF;
END $$;

CREATE TEMP TABLE factura_fk_backup ON COMMIT DROP AS
SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE confrelid IN ('"Factura"'::regclass, '"FacturaVenta"'::regclass) AND contype = 'f';

CREATE TABLE "Factura_reordenada" (
  "CompaniaCodigo" VARCHAR(3),
  "CentroOperacionCodigo" VARCHAR(10),
  "TipoDocumentoId" UUID,
  "NumeroFactura" VARCHAR(50),
  "Prefijo" VARCHAR(20),
  "NumeroDocumentoCliente" TEXT,
  "NombreCliente" TEXT,
  "SucursalCliente" VARCHAR(200),
  "TelefonoCliente" VARCHAR(50),
  "DireccionCliente" TEXT,
  "BarrioCliente" TEXT,
  "CiudadCliente" TEXT,
  "EmailCliente" VARCHAR(150),
  "Id" UUID NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "ClienteId" UUID,
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
  "UsuarioId" UUID,
  "AperturaId" UUID,
  "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DivisionCuentaId" UUID,
  CONSTRAINT "Factura_reordenada_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "Factura_reordenada_AperturaId_fkey" FOREIGN KEY ("AperturaId") REFERENCES "AperturasCaja"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "Factura_reordenada_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "Factura_reordenada_ClienteId_fkey" FOREIGN KEY ("ClienteId") REFERENCES "Cliente"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "Factura_reordenada_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "Factura_reordenada_DivisionCuentaId_fkey" FOREIGN KEY ("DivisionCuentaId") REFERENCES "DivisionCuenta"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "Factura_reordenada_TipoDocumentoId_fkey" FOREIGN KEY ("TipoDocumentoId") REFERENCES "TiposDocumento"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "Factura_reordenada_UsuarioId_fkey" FOREIGN KEY ("UsuarioId") REFERENCES "Usuarios"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "Factura_reordenada_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX "Factura_reordenada_pedidoId_idx" ON "Factura_reordenada" ("pedidoId");

CREATE TABLE "FacturaVenta_reordenada" (
  "CompaniaCodigo" VARCHAR(3),
  "CentroOperacionCodigo" VARCHAR(10),
  "TipoDocumentoId" UUID,
  "Numero" VARCHAR(50),
  "Prefijo" VARCHAR(20),
  "NumeroDocumentoCliente" TEXT,
  "NombreCliente" TEXT,
  "SucursalCliente" VARCHAR(200),
  "TelefonoCliente" VARCHAR(50),
  "DireccionCliente" TEXT,
  "BarrioCliente" TEXT,
  "CiudadCliente" TEXT,
  "EmailCliente" VARCHAR(150),
  "Id" UUID NOT NULL,
  "Estado" VARCHAR(20) NOT NULL DEFAULT 'FACTURADA',
  "Consecutivo" INTEGER,
  "ValidezDias" INTEGER,
  "Observaciones" TEXT,
  "PedidoId" INTEGER NOT NULL,
  "DivisionCuentaId" UUID,
  "ClienteId" UUID,
  "Subtotal" DOUBLE PRECISION NOT NULL,
  "ImpuestoPct" DOUBLE PRECISION NOT NULL,
  "IVA" DOUBLE PRECISION NOT NULL,
  "Total" DOUBLE PRECISION NOT NULL,
  "Propina" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "MetodoPago" TEXT NOT NULL DEFAULT 'EFECTIVO',
  "Credito" BOOLEAN NOT NULL DEFAULT FALSE,
  "CreditoDias" INTEGER,
  "Vence" TIMESTAMP(3),
  "CUFE" VARCHAR(200),
  "NumeroFactus" VARCHAR(50),
  "XmlPath" TEXT,
  "PdfPath" TEXT,
  "EstadoDIAN" VARCHAR(50),
  "UsuarioId" UUID,
  "AperturaId" UUID,
  "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacturaVenta_reordenada_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "FacturaVenta_reordenada_AperturaId_fkey" FOREIGN KEY ("AperturaId") REFERENCES "AperturasCaja"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVenta_reordenada_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVenta_reordenada_ClienteId_fkey" FOREIGN KEY ("ClienteId") REFERENCES "Cliente"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVenta_reordenada_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVenta_reordenada_DivisionCuentaId_fkey" FOREIGN KEY ("DivisionCuentaId") REFERENCES "DivisionCuenta"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVenta_reordenada_PedidoId_fkey" FOREIGN KEY ("PedidoId") REFERENCES "Pedido"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "FacturaVenta_reordenada_TipoDocumentoId_fkey" FOREIGN KEY ("TipoDocumentoId") REFERENCES "TiposDocumento"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVenta_reordenada_UsuarioId_fkey" FOREIGN KEY ("UsuarioId") REFERENCES "Usuarios"("Id") ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX "FacturaVenta_reordenada_PedidoId_idx" ON "FacturaVenta_reordenada" ("PedidoId");

INSERT INTO "Factura_reordenada" (
  "CompaniaCodigo", "CentroOperacionCodigo", "NumeroFactura", "Prefijo",
  "NumeroDocumentoCliente", "NombreCliente", "SucursalCliente", "TelefonoCliente",
  "DireccionCliente", "BarrioCliente", "CiudadCliente", "EmailCliente",
  "Id", "pedidoId", "ClienteId", "Subtotal", "impuestoPct", "IVA", "Total", "Propina",
  "metodoPago", credito, "creditoDias", vence, "CUFE", "NumeroFactus", "XmlPath", "PdfPath",
  "EstadoDIAN", "UsuarioId", "AperturaId", "Fecha", "TipoDocumentoId", "DivisionCuentaId"
)
SELECT
  f."CompaniaCodigo", f."CentroOperacionCodigo", f."NumeroFactura", f."Prefijo",
  COALESCE(NULLIF(c."NumeroDocumento", ''), NULLIF(c.documento, '')),
  COALESCE(NULLIF(c."RazonSocial", ''), NULLIF(c.nombre, ''), NULLIF(p.cliente, ''), 'Consumidor Final'),
  c."Sucursal", c."Telefono", c."Direccion", c.barrio, c.ciudad, c."Email",
  f."Id", f."pedidoId", f."ClienteId", f."Subtotal", f."impuestoPct", f."IVA", f."Total", f."Propina",
  f."metodoPago", f.credito, f."creditoDias", f.vence, f."CUFE", f."NumeroFactus", f."XmlPath", f."PdfPath",
  f."EstadoDIAN", f."UsuarioId", f."AperturaId", f."Fecha", f."TipoDocumentoId", f."DivisionCuentaId"
FROM "Factura" f
LEFT JOIN "Pedido" p ON p.id = f."pedidoId"
LEFT JOIN "Cliente" c ON c."Id" = COALESCE(f."ClienteId", p."clienteId");

INSERT INTO "FacturaVenta_reordenada" (
  "CompaniaCodigo", "CentroOperacionCodigo", "Numero", "Prefijo",
  "NumeroDocumentoCliente", "NombreCliente", "SucursalCliente", "TelefonoCliente",
  "DireccionCliente", "BarrioCliente", "CiudadCliente", "EmailCliente",
  "Id", "Estado", "Consecutivo", "ValidezDias", "Observaciones", "PedidoId", "DivisionCuentaId", "ClienteId", "Subtotal", "ImpuestoPct",
  "IVA", "Total", "Propina", "MetodoPago", "Credito", "CreditoDias", "Vence", "CUFE",
  "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "TipoDocumentoId", "Fecha"
)
SELECT
  f."CompaniaCodigo", f."CentroOperacionCodigo", f."Numero", f."Prefijo",
  COALESCE(NULLIF(c."NumeroDocumento", ''), NULLIF(c.documento, '')),
  COALESCE(NULLIF(c."RazonSocial", ''), NULLIF(c.nombre, ''), NULLIF(p.cliente, ''), 'Consumidor Final'),
  c."Sucursal", c."Telefono", c."Direccion", c.barrio, c.ciudad, c."Email",
  f."Id", f."Estado", NULLIF(to_jsonb(f)->>'Consecutivo', '')::INTEGER,
  NULLIF(to_jsonb(f)->>'ValidezDias', '')::INTEGER, to_jsonb(f)->>'Observaciones',
  f."PedidoId", f."DivisionCuentaId", f."ClienteId", f."Subtotal", f."ImpuestoPct",
  f."IVA", f."Total", f."Propina", f."MetodoPago", f."Credito", f."CreditoDias", f."Vence", f."CUFE",
  f."NumeroFactus", f."XmlPath", f."PdfPath", f."EstadoDIAN", f."UsuarioId", f."AperturaId", f."TipoDocumentoId", f."Fecha"
FROM "FacturaVenta" f
LEFT JOIN "Pedido" p ON p.id = f."PedidoId"
LEFT JOIN "Cliente" c ON c."Id" = COALESCE(f."ClienteId", p."clienteId");

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "Factura") <> (SELECT COUNT(*) FROM "Factura_reordenada")
    OR (SELECT COUNT(*) FROM "FacturaVenta") <> (SELECT COUNT(*) FROM "FacturaVenta_reordenada") THEN
    RAISE EXCEPTION 'La copia no conserva el conteo de facturas; se cancela la reorganización';
  END IF;
  IF EXISTS (
    SELECT "Id", "NumeroFactura", "Prefijo", "pedidoId", "ClienteId", "Subtotal", "impuestoPct", "IVA", "Total", "Propina", "metodoPago", credito, "creditoDias", vence, "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "Fecha", "TipoDocumentoId", "CompaniaCodigo", "CentroOperacionCodigo", "DivisionCuentaId"
    FROM "Factura"
    EXCEPT ALL
    SELECT "Id", "NumeroFactura", "Prefijo", "pedidoId", "ClienteId", "Subtotal", "impuestoPct", "IVA", "Total", "Propina", "metodoPago", credito, "creditoDias", vence, "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "Fecha", "TipoDocumentoId", "CompaniaCodigo", "CentroOperacionCodigo", "DivisionCuentaId"
    FROM "Factura_reordenada"
  ) OR EXISTS (
    SELECT f."Id", f."Numero", f."Prefijo", f."Estado",
      NULLIF(to_jsonb(f)->>'Consecutivo', '')::INTEGER,
      NULLIF(to_jsonb(f)->>'ValidezDias', '')::INTEGER,
      to_jsonb(f)->>'Observaciones', f."PedidoId", f."DivisionCuentaId", f."ClienteId",
      f."Subtotal", f."ImpuestoPct", f."IVA", f."Total", f."Propina", f."MetodoPago",
      f."Credito", f."CreditoDias", f."Vence", f."CUFE", f."NumeroFactus", f."XmlPath",
      f."PdfPath", f."EstadoDIAN", f."UsuarioId", f."AperturaId", f."TipoDocumentoId",
      f."Fecha", f."CompaniaCodigo", f."CentroOperacionCodigo"
    FROM "FacturaVenta" f
    EXCEPT ALL
    SELECT "Id", "Numero", "Prefijo", "Estado", "Consecutivo", "ValidezDias", "Observaciones",
      "PedidoId", "DivisionCuentaId", "ClienteId", "Subtotal", "ImpuestoPct", "IVA", "Total",
      "Propina", "MetodoPago", "Credito", "CreditoDias", "Vence", "CUFE", "NumeroFactus",
      "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "TipoDocumentoId", "Fecha",
      "CompaniaCodigo", "CentroOperacionCodigo"
    FROM "FacturaVenta_reordenada"
  ) OR EXISTS (
    SELECT "Id", "Numero", "Prefijo", "Estado", "Consecutivo", "ValidezDias", "Observaciones",
      "PedidoId", "DivisionCuentaId", "ClienteId", "Subtotal", "ImpuestoPct", "IVA", "Total",
      "Propina", "MetodoPago", "Credito", "CreditoDias", "Vence", "CUFE", "NumeroFactus",
      "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "TipoDocumentoId", "Fecha",
      "CompaniaCodigo", "CentroOperacionCodigo"
    FROM "FacturaVenta_reordenada"
    EXCEPT ALL
    SELECT f."Id", f."Numero", f."Prefijo", f."Estado",
      NULLIF(to_jsonb(f)->>'Consecutivo', '')::INTEGER,
      NULLIF(to_jsonb(f)->>'ValidezDias', '')::INTEGER,
      to_jsonb(f)->>'Observaciones', f."PedidoId", f."DivisionCuentaId", f."ClienteId",
      f."Subtotal", f."ImpuestoPct", f."IVA", f."Total", f."Propina", f."MetodoPago",
      f."Credito", f."CreditoDias", f."Vence", f."CUFE", f."NumeroFactus", f."XmlPath",
      f."PdfPath", f."EstadoDIAN", f."UsuarioId", f."AperturaId", f."TipoDocumentoId",
      f."Fecha", f."CompaniaCodigo", f."CentroOperacionCodigo"
    FROM "FacturaVenta" f
  ) THEN
    RAISE EXCEPTION 'Los datos originales no coinciden; se cancela la reorganización';
  END IF;
END $$;

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN SELECT tabla, conname FROM factura_fk_backup LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tabla, fk.conname);
  END LOOP;
END $$;

ALTER TABLE "Factura" RENAME TO "Factura_backup_20261015";
ALTER TABLE "FacturaVenta" RENAME TO "FacturaVenta_backup_20261015";
ALTER TABLE "Factura_backup_20261015" RENAME CONSTRAINT "Factura_pkey" TO "Factura_backup_20261015_pkey";
ALTER INDEX "Factura_pedidoId_idx" RENAME TO "Factura_backup_20261015_pedidoId_idx";
ALTER TABLE "FacturaVenta_backup_20261015" RENAME CONSTRAINT "FacturaVenta_pkey" TO "FacturaVenta_backup_20261015_pkey";
ALTER INDEX "FacturaVenta_PedidoId_idx" RENAME TO "FacturaVenta_backup_20261015_PedidoId_idx";

ALTER TABLE "Factura_reordenada" RENAME TO "Factura";
ALTER TABLE "Factura" RENAME CONSTRAINT "Factura_reordenada_pkey" TO "Factura_pkey";
ALTER TABLE "Factura" RENAME CONSTRAINT "Factura_reordenada_AperturaId_fkey" TO "Factura_AperturaId_fkey";
ALTER TABLE "Factura" RENAME CONSTRAINT "Factura_reordenada_CentroOperacionCodigo_fkey" TO "Factura_CentroOperacionCodigo_fkey";
ALTER TABLE "Factura" RENAME CONSTRAINT "Factura_reordenada_ClienteId_fkey" TO "Factura_ClienteId_fkey";
ALTER TABLE "Factura" RENAME CONSTRAINT "Factura_reordenada_CompaniaCodigo_fkey" TO "Factura_CompaniaCodigo_fkey";
ALTER TABLE "Factura" RENAME CONSTRAINT "Factura_reordenada_DivisionCuentaId_fkey" TO "Factura_DivisionCuentaId_fkey";
ALTER TABLE "Factura" RENAME CONSTRAINT "Factura_reordenada_TipoDocumentoId_fkey" TO "Factura_TipoDocumentoId_fkey";
ALTER TABLE "Factura" RENAME CONSTRAINT "Factura_reordenada_UsuarioId_fkey" TO "Factura_UsuarioId_fkey";
ALTER TABLE "Factura" RENAME CONSTRAINT "Factura_reordenada_pedidoId_fkey" TO "Factura_pedidoId_fkey";
ALTER INDEX "Factura_reordenada_pedidoId_idx" RENAME TO "Factura_pedidoId_idx";

ALTER TABLE "FacturaVenta_reordenada" RENAME TO "FacturaVenta";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "FacturaVenta_reordenada_pkey" TO "FacturaVenta_pkey";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "FacturaVenta_reordenada_AperturaId_fkey" TO "FacturaVenta_AperturaId_fkey";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "FacturaVenta_reordenada_CentroOperacionCodigo_fkey" TO "FacturaVenta_CentroOperacionCodigo_fkey";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "FacturaVenta_reordenada_ClienteId_fkey" TO "FacturaVenta_ClienteId_fkey";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "FacturaVenta_reordenada_CompaniaCodigo_fkey" TO "FacturaVenta_CompaniaCodigo_fkey";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "FacturaVenta_reordenada_DivisionCuentaId_fkey" TO "FacturaVenta_DivisionCuentaId_fkey";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "FacturaVenta_reordenada_PedidoId_fkey" TO "FacturaVenta_PedidoId_fkey";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "FacturaVenta_reordenada_TipoDocumentoId_fkey" TO "FacturaVenta_TipoDocumentoId_fkey";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "FacturaVenta_reordenada_UsuarioId_fkey" TO "FacturaVenta_UsuarioId_fkey";
ALTER INDEX "FacturaVenta_reordenada_PedidoId_idx" RENAME TO "FacturaVenta_PedidoId_idx";

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN SELECT tabla, conname, definicion FROM factura_fk_backup LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.tabla, fk.conname, fk.definicion);
  END LOOP;
END $$;

COMMIT;
