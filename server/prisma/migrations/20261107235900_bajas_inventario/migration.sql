BEGIN;

CREATE TABLE "BajasInventario" (
  "id" UUID NOT NULL,
  "tipoItem" VARCHAR(10) NOT NULL,
  "productoId" UUID,
  "itemId" INTEGER,
  "bodegaId" UUID NOT NULL,
  "cantidad" DOUBLE PRECISION NOT NULL,
  "fotos" JSONB NOT NULL,
  "notas" TEXT,
  "estado" VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE',
  "solicitadoPorId" UUID NOT NULL,
  "solicitanteCuenta" VARCHAR(50) NOT NULL,
  "solicitanteNombre" VARCHAR(200) NOT NULL,
  "decididoPorId" UUID,
  "decisionCuenta" VARCHAR(50),
  "decisionNombre" VARCHAR(200),
  "respuesta" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decididoAt" TIMESTAMP(3),
  CONSTRAINT "BajasInventario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BajasInventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("Id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BajasInventario_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventarioItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BajasInventario_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("Id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BajasInventario_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "Usuarios"("Id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BajasInventario_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "Usuarios"("Id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BajasInventario_tipoItem_check" CHECK (
    ("tipoItem" = 'PRODUCTO' AND "productoId" IS NOT NULL AND "itemId" IS NULL)
    OR ("tipoItem" = 'INSUMO' AND "itemId" IS NOT NULL AND "productoId" IS NULL)
  ),
  CONSTRAINT "BajasInventario_cantidad_check" CHECK ("cantidad" > 0),
  CONSTRAINT "BajasInventario_fotos_check" CHECK (
    jsonb_typeof("fotos") = 'array' AND jsonb_array_length("fotos") BETWEEN 1 AND 3
  ),
  CONSTRAINT "BajasInventario_notas_check" CHECK ("notas" IS NULL OR length("notas") <= 2000),
  CONSTRAINT "BajasInventario_estado_check" CHECK ("estado" IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  CONSTRAINT "BajasInventario_otroAprobador_check" CHECK ("decididoPorId" IS NULL OR "decididoPorId" <> "solicitadoPorId"),
  CONSTRAINT "BajasInventario_decision_check" CHECK (
    ("estado" = 'PENDIENTE' AND "decididoPorId" IS NULL AND "decisionCuenta" IS NULL AND "decisionNombre" IS NULL AND "decididoAt" IS NULL)
    OR ("estado" IN ('APROBADA', 'RECHAZADA') AND "decididoPorId" IS NOT NULL AND "decisionCuenta" IS NOT NULL AND "decisionNombre" IS NOT NULL AND "decididoAt" IS NOT NULL)
  )
);

CREATE INDEX "BajasInventario_estado_createdAt_idx" ON "BajasInventario"("estado", "createdAt");
CREATE INDEX "BajasInventario_productoId_bodegaId_idx" ON "BajasInventario"("productoId", "bodegaId");
CREATE INDEX "BajasInventario_itemId_bodegaId_idx" ON "BajasInventario"("itemId", "bodegaId");

COMMIT;