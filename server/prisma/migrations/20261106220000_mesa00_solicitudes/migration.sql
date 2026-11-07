BEGIN;

ALTER TABLE "Mesa" ADD COLUMN "esFantasma" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "Mesa" ("numero", "capacidad", "estado", "esFantasma")
VALUES (0, 0, 'LIBRE', true)
ON CONFLICT ("numero") DO UPDATE SET "esFantasma" = true;

ALTER TABLE "PedidoItem" ADD COLUMN "cantidadMesa00" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "StockMesa00" (
  "productoId" UUID NOT NULL,
  "cantidad" INTEGER NOT NULL DEFAULT 0,
  "actualizado" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockMesa00_pkey" PRIMARY KEY ("productoId"),
  CONSTRAINT "StockMesa00_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("Id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMesa00_cantidad_check" CHECK ("cantidad" >= 0)
);

CREATE TABLE "SolicitudesMovimientoMesa00" (
  "id" UUID NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "pedidoItemId" INTEGER NOT NULL,
  "productoId" UUID NOT NULL,
  "productoNombre" VARCHAR(250) NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "estado" VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
  "solicitadoPorId" UUID NOT NULL,
  "solicitadoPor" VARCHAR(50) NOT NULL,
  "solicitanteNombre" VARCHAR(200) NOT NULL,
  "decididoPorId" UUID,
  "decididoPor" VARCHAR(50),
  "decisionNombre" VARCHAR(200),
  "respuesta" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decididoAt" TIMESTAMP(3),
  CONSTRAINT "SolicitudesMovimientoMesa00_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SolicitudesMovimientoMesa00_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SolicitudesMovimientoMesa00_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("Id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SolicitudesMovimientoMesa00_cantidad_check" CHECK ("cantidad" > 0),
  CONSTRAINT "SolicitudesMovimientoMesa00_estado_check" CHECK ("estado" IN ('PENDIENTE', 'APROBADA', 'RECHAZADA'))
);

CREATE INDEX "SolicitudesMovimientoMesa00_estado_createdAt_idx" ON "SolicitudesMovimientoMesa00"("estado", "createdAt");
CREATE INDEX "SolicitudesMovimientoMesa00_pedidoId_pedidoItemId_estado_idx" ON "SolicitudesMovimientoMesa00"("pedidoId", "pedidoItemId", "estado");

ALTER TABLE "HistorialPedidos" DROP CONSTRAINT "HistorialPedidos_accion_check";
ALTER TABLE "HistorialPedidos" ADD CONSTRAINT "HistorialPedidos_accion_check" CHECK ("accion" IN (
  'CREAR', 'AGREGAR_PRODUCTO', 'CAMBIAR_CANTIDAD', 'QUITAR_PRODUCTO',
  'OBSERVACIONES', 'REENVIAR', 'CAMBIAR_MESA', 'CANCELAR', 'PLATO_LISTO',
  'PLATO_ITEM_LISTO', 'ENTREGAR', 'SOLICITAR_MESA00', 'APROBAR_MESA00',
  'RECHAZAR_MESA00', 'TOMAR_MESA00'
));

COMMIT;