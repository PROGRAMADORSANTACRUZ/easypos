BEGIN;

LOCK TABLE "Factura", "FacturaVenta", "Abono", "ComisionesVendedores", "EventosDIAN", "FacturaDetalle", "FacturaVentaDetalle", "NotasCredito", "NotasDebito", "Pagos", "RetencionesFactura" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('"Factura_backup_20261009"') IS NOT NULL OR to_regclass('"FacturaVenta_backup_20261009"') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existen tablas de respaldo de la reorganización';
  END IF;
END $$;

DROP VIEW IF EXISTS "FacturaOrdenada";
DROP VIEW IF EXISTS "FacturaVentaOrdenada";

CREATE TABLE "Factura_reordenada" (
  "CompaniaCodigo" VARCHAR(3),
  "CentroOperacionCodigo" VARCHAR(10),
  "Id" UUID NOT NULL,
  "NumeroFactura" VARCHAR(50),
  "Prefijo" VARCHAR(20),
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
  "TipoDocumentoId" UUID,
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
  "Id" UUID NOT NULL,
  "Numero" VARCHAR(50),
  "Prefijo" VARCHAR(20) DEFAULT 'COT',
  "Consecutivo" INTEGER,
  "ClienteId" UUID,
  "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ValidezDias" INTEGER,
  "Subtotal" DOUBLE PRECISION NOT NULL,
  "IVA" DOUBLE PRECISION NOT NULL,
  "Total" DOUBLE PRECISION NOT NULL,
  "Estado" VARCHAR(20) NOT NULL DEFAULT 'FACTURADA',
  "Observaciones" TEXT,
  "PedidoId" INTEGER NOT NULL,
  "ImpuestoPct" DOUBLE PRECISION NOT NULL,
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
  "TipoDocumentoId" UUID,
  "DivisionCuentaId" UUID,
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
  "CompaniaCodigo", "CentroOperacionCodigo", "Id", "NumeroFactura", "Prefijo", "pedidoId", "ClienteId", "Subtotal", "impuestoPct", "IVA", "Total", "Propina", "metodoPago", credito, "creditoDias", vence, "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "Fecha", "TipoDocumentoId", "DivisionCuentaId"
)
SELECT
  "CompaniaCodigo", "CentroOperacionCodigo", "Id", "NumeroFactura", "Prefijo", "pedidoId", "ClienteId", "Subtotal", "impuestoPct", "IVA", "Total", "Propina", "metodoPago", credito, "creditoDias", vence, "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "Fecha", "TipoDocumentoId", "DivisionCuentaId"
FROM "Factura";

INSERT INTO "FacturaVenta_reordenada" (
  "CompaniaCodigo", "CentroOperacionCodigo", "Id", "Numero", "Prefijo", "Consecutivo", "ClienteId", "Fecha", "ValidezDias", "Subtotal", "IVA", "Total", "Estado", "Observaciones", "PedidoId", "ImpuestoPct", "Propina", "MetodoPago", "Credito", "CreditoDias", "Vence", "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "TipoDocumentoId", "DivisionCuentaId"
)
SELECT
  "CompaniaCodigo", "CentroOperacionCodigo", "Id", "Numero", "Prefijo", "Consecutivo", "ClienteId", "Fecha", "ValidezDias", "Subtotal", "IVA", "Total", "Estado", "Observaciones", "PedidoId", "ImpuestoPct", "Propina", "MetodoPago", "Credito", "CreditoDias", "Vence", "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "TipoDocumentoId", "DivisionCuentaId"
FROM "FacturaVenta";

DO $$
BEGIN
  IF EXISTS (
    SELECT "Id", "NumeroFactura", "Prefijo", "pedidoId", "ClienteId", "Subtotal", "impuestoPct", "IVA", "Total", "Propina", "metodoPago", credito, "creditoDias", vence, "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "Fecha", "TipoDocumentoId", "CompaniaCodigo", "CentroOperacionCodigo", "DivisionCuentaId" FROM "Factura"
    EXCEPT ALL
    SELECT "Id", "NumeroFactura", "Prefijo", "pedidoId", "ClienteId", "Subtotal", "impuestoPct", "IVA", "Total", "Propina", "metodoPago", credito, "creditoDias", vence, "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "Fecha", "TipoDocumentoId", "CompaniaCodigo", "CentroOperacionCodigo", "DivisionCuentaId" FROM "Factura_reordenada"
  ) OR EXISTS (
    SELECT "Id", "Numero", "Prefijo", "Consecutivo", "ClienteId", "Fecha", "ValidezDias", "Subtotal", "IVA", "Total", "Estado", "Observaciones", "PedidoId", "ImpuestoPct", "Propina", "MetodoPago", "Credito", "CreditoDias", "Vence", "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "TipoDocumentoId", "CompaniaCodigo", "CentroOperacionCodigo", "DivisionCuentaId" FROM "FacturaVenta"
    EXCEPT ALL
    SELECT "Id", "Numero", "Prefijo", "Consecutivo", "ClienteId", "Fecha", "ValidezDias", "Subtotal", "IVA", "Total", "Estado", "Observaciones", "PedidoId", "ImpuestoPct", "Propina", "MetodoPago", "Credito", "CreditoDias", "Vence", "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN", "UsuarioId", "AperturaId", "TipoDocumentoId", "CompaniaCodigo", "CentroOperacionCodigo", "DivisionCuentaId" FROM "FacturaVenta_reordenada"
  ) THEN
    RAISE EXCEPTION 'La copia no coincide con los datos originales; se cancela la reorganización';
  END IF;
END $$;

ALTER TABLE "Abono" DROP CONSTRAINT "Abono_facturaId_fkey";
ALTER TABLE "Abono" DROP CONSTRAINT "Abono_FacturaVentaId_fkey";
ALTER TABLE "ComisionesVendedores" DROP CONSTRAINT "ComisionesVendedores_FacturaId_fkey";
ALTER TABLE "ComisionesVendedores" DROP CONSTRAINT "ComisionesVendedores_FacturaVentaId_fkey";
ALTER TABLE "EventosDIAN" DROP CONSTRAINT "EventosDIAN_FacturaId_fkey";
ALTER TABLE "FacturaDetalle" DROP CONSTRAINT "FacturaDetalle_FacturaId_fkey";
ALTER TABLE "FacturaVentaDetalle" DROP CONSTRAINT "FacturaVentaDetalle_FacturaVentaId_fkey";
ALTER TABLE "NotasCredito" DROP CONSTRAINT "NotasCredito_FacturaId_fkey";
ALTER TABLE "NotasDebito" DROP CONSTRAINT "NotasDebito_FacturaId_fkey";
ALTER TABLE "Pagos" DROP CONSTRAINT "Pagos_FacturaId_fkey";
ALTER TABLE "Pagos" DROP CONSTRAINT "Pagos_FacturaVentaId_fkey";
ALTER TABLE "RetencionesFactura" DROP CONSTRAINT "RetencionesFactura_FacturaId_fkey";

ALTER TABLE "Factura" RENAME TO "Factura_backup_20261009";
ALTER TABLE "FacturaVenta" RENAME TO "FacturaVenta_backup_20261009";
ALTER TABLE "Factura_reordenada" RENAME TO "Factura";
ALTER TABLE "FacturaVenta_reordenada" RENAME TO "FacturaVenta";

ALTER TABLE "Factura_backup_20261009" RENAME CONSTRAINT "Factura_pkey" TO "Factura_backup_20261009_pkey";
ALTER INDEX "Factura_pedidoId_idx" RENAME TO "Factura_backup_20261009_pedidoId_idx";
ALTER TABLE "FacturaVenta_backup_20261009" RENAME CONSTRAINT "FacturaVenta_pkey" TO "FacturaVenta_backup_20261009_pkey";
ALTER INDEX "FacturaVenta_PedidoId_idx" RENAME TO "FacturaVenta_backup_20261009_PedidoId_idx";

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

ALTER TABLE "Abono" ADD CONSTRAINT "Abono_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("Id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_FacturaVentaId_fkey" FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVenta"("Id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "ComisionesVendedores" ADD CONSTRAINT "ComisionesVendedores_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "ComisionesVendedores" ADD CONSTRAINT "ComisionesVendedores_FacturaVentaId_fkey" FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVenta"("Id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "EventosDIAN" ADD CONSTRAINT "EventosDIAN_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "FacturaDetalle" ADD CONSTRAINT "FacturaDetalle_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "FacturaVentaDetalle" ADD CONSTRAINT "FacturaVentaDetalle_FacturaVentaId_fkey" FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVenta"("Id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "NotasCredito" ADD CONSTRAINT "NotasCredito_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "NotasDebito" ADD CONSTRAINT "NotasDebito_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Pagos" ADD CONSTRAINT "Pagos_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "Pagos" ADD CONSTRAINT "Pagos_FacturaVentaId_fkey" FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVenta"("Id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "RetencionesFactura" ADD CONSTRAINT "RetencionesFactura_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON UPDATE CASCADE ON DELETE CASCADE;

COMMIT;
