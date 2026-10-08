DROP INDEX IF EXISTS "Factura_pedidoId_key";
DROP INDEX IF EXISTS "FacturaVenta_PedidoId_key";

CREATE INDEX IF NOT EXISTS "Factura_pedidoId_idx" ON "Factura"("pedidoId");
CREATE INDEX IF NOT EXISTS "FacturaVenta_PedidoId_idx" ON "FacturaVenta"("PedidoId");