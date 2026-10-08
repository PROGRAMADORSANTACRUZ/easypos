ALTER TABLE "Factura"
ADD COLUMN IF NOT EXISTS "DivisionCuentaId" UUID;

ALTER TABLE "FacturaVenta"
ADD COLUMN IF NOT EXISTS "DivisionCuentaId" UUID;

ALTER TABLE "Pagos"
ADD COLUMN IF NOT EXISTS "FormaPago" VARCHAR(30);

CREATE TABLE IF NOT EXISTS "DivisionCuenta" (
  "id" UUID NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "modo" VARCHAR(20) NOT NULL,
  "emision" VARCHAR(20) NOT NULL,
  "partes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DivisionCuenta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DivisionCuenta_pedidoId_fkey" FOREIGN KEY ("pedidoId")
    REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DivisionCuenta_pedidoId_createdAt_idx"
ON "DivisionCuenta"("pedidoId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Factura" ADD CONSTRAINT "Factura_DivisionCuentaId_fkey"
    FOREIGN KEY ("DivisionCuentaId") REFERENCES "DivisionCuenta"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FacturaVenta" ADD CONSTRAINT "FacturaVenta_DivisionCuentaId_fkey"
    FOREIGN KEY ("DivisionCuentaId") REFERENCES "DivisionCuenta"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;