BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Cotizaciones") OR EXISTS (SELECT 1 FROM "CotizacionDetalle") THEN
    RAISE EXCEPTION 'No se puede reutilizar Cotizaciones: la tabla o sus detalles contienen registros';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Factura"
    WHERE "EstadoDIAN" = 'NO_APLICA' AND "Fecha" >= DATE '2026-09-26'
  ) THEN
    RAISE EXCEPTION 'No se encontraron facturas no electronicas desde el 26 de septiembre de 2026';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Abono" a JOIN "Factura" f ON a."facturaId" = f."Id"
    WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26'
  ) OR EXISTS (
    SELECT 1 FROM "Pagos" a JOIN "Factura" f ON a."FacturaId" = f."Id"
    WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26'
  ) OR EXISTS (
    SELECT 1 FROM "NotasCredito" a JOIN "Factura" f ON a."FacturaId" = f."Id"
    WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26'
  ) OR EXISTS (
    SELECT 1 FROM "NotasDebito" a JOIN "Factura" f ON a."FacturaId" = f."Id"
    WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26'
  ) OR EXISTS (
    SELECT 1 FROM "RetencionesFactura" a JOIN "Factura" f ON a."FacturaId" = f."Id"
    WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26'
  ) OR EXISTS (
    SELECT 1 FROM "ComisionesVendedores" a JOIN "Factura" f ON a."FacturaId" = f."Id"
    WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26'
  ) OR EXISTS (
    SELECT 1 FROM "EventosDIAN" a JOIN "Factura" f ON a."FacturaId" = f."Id"
    WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26'
  ) THEN
    RAISE EXCEPTION 'Hay relaciones externas asociadas a facturas; se cancela el traslado para preservarlas';
  END IF;
END $$;

ALTER TABLE "Cotizaciones" RENAME TO "FacturaVenta";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "Cotizaciones_pkey" TO "FacturaVenta_pkey";
ALTER TABLE "FacturaVenta" RENAME CONSTRAINT "Cotizaciones_ClienteId_fkey" TO "FacturaVenta_ClienteId_fkey";
ALTER TABLE "CotizacionDetalle" RENAME TO "FacturaVentaDetalle";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "CotizacionDetalle_pkey" TO "FacturaVentaDetalle_pkey";
ALTER TABLE "FacturaVentaDetalle" RENAME COLUMN "CotizacionId" TO "FacturaVentaId";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "CotizacionDetalle_CotizacionId_fkey" TO "FacturaVentaDetalle_FacturaVentaId_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "CotizacionDetalle_ProductoId_fkey" TO "FacturaVentaDetalle_ProductoId_fkey";
ALTER TABLE "FacturaVentaDetalle" ADD COLUMN "IVA" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "FacturaVenta" ADD COLUMN "PedidoId" INTEGER;
ALTER TABLE "FacturaVenta" ADD COLUMN "ImpuestoPct" DOUBLE PRECISION;
ALTER TABLE "FacturaVenta" ADD COLUMN "Propina" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "FacturaVenta" ADD COLUMN "MetodoPago" TEXT NOT NULL DEFAULT 'EFECTIVO';
ALTER TABLE "FacturaVenta" ADD COLUMN "Credito" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "FacturaVenta" ADD COLUMN "CreditoDias" INTEGER;
ALTER TABLE "FacturaVenta" ADD COLUMN "Vence" TIMESTAMP(3);
ALTER TABLE "FacturaVenta" ADD COLUMN "CUFE" VARCHAR(200);
ALTER TABLE "FacturaVenta" ADD COLUMN "NumeroFactus" VARCHAR(50);
ALTER TABLE "FacturaVenta" ADD COLUMN "XmlPath" TEXT;
ALTER TABLE "FacturaVenta" ADD COLUMN "PdfPath" TEXT;
ALTER TABLE "FacturaVenta" ADD COLUMN "EstadoDIAN" VARCHAR(50);
ALTER TABLE "FacturaVenta" ADD COLUMN "UsuarioId" UUID;
ALTER TABLE "FacturaVenta" ADD COLUMN "AperturaId" UUID;
ALTER TABLE "FacturaVenta" ALTER COLUMN "Estado" SET DEFAULT 'FACTURADA';

ALTER TABLE "FacturaVenta" ADD CONSTRAINT "FacturaVenta_PedidoId_fkey"
  FOREIGN KEY ("PedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacturaVenta" ADD CONSTRAINT "FacturaVenta_UsuarioId_fkey"
  FOREIGN KEY ("UsuarioId") REFERENCES "Usuarios"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacturaVenta" ADD CONSTRAINT "FacturaVenta_AperturaId_fkey"
  FOREIGN KEY ("AperturaId") REFERENCES "AperturasCaja"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "FacturaVenta" (
  "Id", "Numero", "Prefijo", "PedidoId", "ClienteId", "Subtotal", "ImpuestoPct", "IVA", "Total",
  "Propina", "MetodoPago", "Credito", "CreditoDias", "Vence", "CUFE", "NumeroFactus", "XmlPath", "PdfPath",
  "EstadoDIAN", "UsuarioId", "AperturaId", "Fecha", "Estado"
)
SELECT
  "Id", "NumeroFactura", "Prefijo", "pedidoId", "ClienteId", "Subtotal", "impuestoPct", "IVA", "Total",
  "Propina", "metodoPago", "credito", "creditoDias", "vence", "CUFE", "NumeroFactus", "XmlPath", "PdfPath",
  "EstadoDIAN", "UsuarioId", "AperturaId", "Fecha", 'FACTURADA'
FROM "Factura"
WHERE "EstadoDIAN" = 'NO_APLICA' AND "Fecha" >= DATE '2026-09-26';

INSERT INTO "FacturaVentaDetalle" (
  "Id", "FacturaVentaId", "ProductoId", "Cantidad", "PrecioUnitario", "IVA", "Total"
)
SELECT d."Id", d."FacturaId", d."ProductoId", d."Cantidad", d."PrecioUnitario", d."IVA", d."Total"
FROM "FacturaDetalle" d
JOIN "Factura" f ON f."Id" = d."FacturaId"
WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26';

DO $$
DECLARE
  facturas_origen BIGINT;
  facturas_destino BIGINT;
  detalles_origen BIGINT;
  detalles_destino BIGINT;
BEGIN
  SELECT COUNT(*) INTO facturas_origen FROM "Factura"
    WHERE "EstadoDIAN" = 'NO_APLICA' AND "Fecha" >= DATE '2026-09-26';
  SELECT COUNT(*) INTO facturas_destino FROM "FacturaVenta"
    WHERE "EstadoDIAN" = 'NO_APLICA' AND "Fecha" >= DATE '2026-09-26';
  SELECT COUNT(*) INTO detalles_origen FROM "FacturaDetalle" d
    JOIN "Factura" f ON f."Id" = d."FacturaId"
    WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26';
  SELECT COUNT(*) INTO detalles_destino FROM "FacturaVentaDetalle" d
    JOIN "FacturaVenta" f ON f."Id" = d."FacturaVentaId"
    WHERE f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26';
  IF facturas_origen <> facturas_destino OR detalles_origen <> detalles_destino THEN
    RAISE EXCEPTION 'Conteos no coinciden: facturas %/%, detalles %/%', facturas_origen, facturas_destino, detalles_origen, detalles_destino;
  END IF;
END $$;

ALTER TABLE "FacturaVenta" ALTER COLUMN "PedidoId" SET NOT NULL;
ALTER TABLE "FacturaVenta" ALTER COLUMN "ImpuestoPct" SET NOT NULL;
ALTER TABLE "FacturaVenta"
  ALTER COLUMN "Subtotal" SET NOT NULL,
  ALTER COLUMN "IVA" SET NOT NULL,
  ALTER COLUMN "Total" SET NOT NULL;
CREATE UNIQUE INDEX "FacturaVenta_PedidoId_key" ON "FacturaVenta"("PedidoId");

ALTER TABLE "Abono" ALTER COLUMN "facturaId" DROP NOT NULL;
ALTER TABLE "Abono" ADD COLUMN "FacturaVentaId" UUID;
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_FacturaVentaId_fkey"
  FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVenta"("Id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pagos" ADD COLUMN "FacturaVentaId" UUID;
ALTER TABLE "Pagos" ADD CONSTRAINT "Pagos_FacturaVentaId_fkey"
  FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVenta"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComisionesVendedores" ADD COLUMN "FacturaVentaId" UUID;
ALTER TABLE "ComisionesVendedores" ADD CONSTRAINT "ComisionesVendedores_FacturaVentaId_fkey"
  FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVenta"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

DELETE FROM "FacturaDetalle" d USING "Factura" f
WHERE d."FacturaId" = f."Id" AND f."EstadoDIAN" = 'NO_APLICA' AND f."Fecha" >= DATE '2026-09-26';
DELETE FROM "Factura" WHERE "EstadoDIAN" = 'NO_APLICA' AND "Fecha" >= DATE '2026-09-26';

COMMIT;
