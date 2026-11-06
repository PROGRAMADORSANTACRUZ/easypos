BEGIN;

CREATE TABLE "HistorialPedidos" (
  "id" SERIAL NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usuarioId" UUID NOT NULL,
  "usuarioCuenta" VARCHAR(50) NOT NULL,
  "usuarioNombre" VARCHAR(200) NOT NULL,
  "accion" VARCHAR(30) NOT NULL,
  "motivo" TEXT,
  "detalle" TEXT,
  "antes" JSONB,
  "despues" JSONB NOT NULL,
  CONSTRAINT "HistorialPedidos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HistorialPedidos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HistorialPedidos_accion_check" CHECK ("accion" IN (
    'CREAR', 'AGREGAR_PRODUCTO', 'CAMBIAR_CANTIDAD', 'QUITAR_PRODUCTO',
    'OBSERVACIONES', 'REENVIAR', 'CAMBIAR_MESA', 'CANCELAR'
  )),
  CONSTRAINT "HistorialPedidos_actor_check" CHECK (length(trim("usuarioCuenta")) > 0 AND length(trim("usuarioNombre")) > 0),
  CONSTRAINT "HistorialPedidos_motivo_check" CHECK (
    "accion" <> 'CANCELAR' OR ("motivo" IS NOT NULL AND length(trim("motivo")) BETWEEN 1 AND 1000)
  )
);

CREATE INDEX "HistorialPedidos_pedidoId_id_idx" ON "HistorialPedidos"("pedidoId", "id");

CREATE FUNCTION rechazar_modificacion_historial_pedidos() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'El historial de pedidos no se puede modificar ni eliminar';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER historial_pedidos_inmutable
BEFORE UPDATE OR DELETE ON "HistorialPedidos"
FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion_historial_pedidos();

COMMIT;