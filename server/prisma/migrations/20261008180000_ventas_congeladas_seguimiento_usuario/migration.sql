ALTER TABLE "Pedido"
ADD COLUMN "usuarioId" UUID;

CREATE INDEX "Pedido_usuarioId_tipo_createdAt_idx"
ON "Pedido"("usuarioId", "tipo", "createdAt");

ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuarios"("Id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VentaCongelada" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "electronica" BOOLEAN NOT NULL DEFAULT true,
    "cliente" TEXT,
    "pago" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VentaCongelada_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VentaCongelada_usuarioId_electronica_createdAt_idx"
ON "VentaCongelada"("usuarioId", "electronica", "createdAt");

ALTER TABLE "VentaCongelada"
ADD CONSTRAINT "VentaCongelada_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuarios"("Id")
ON DELETE CASCADE ON UPDATE CASCADE;