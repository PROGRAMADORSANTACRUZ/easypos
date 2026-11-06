BEGIN;

ALTER TABLE "PreparacionCocina"
  ADD COLUMN "itemsListos" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "HistorialPedidos" DROP CONSTRAINT "HistorialPedidos_accion_check";
ALTER TABLE "HistorialPedidos" ADD CONSTRAINT "HistorialPedidos_accion_check" CHECK ("accion" IN (
  'CREAR', 'AGREGAR_PRODUCTO', 'CAMBIAR_CANTIDAD', 'QUITAR_PRODUCTO',
  'OBSERVACIONES', 'REENVIAR', 'CAMBIAR_MESA', 'CANCELAR', 'PLATO_LISTO',
  'PLATO_ITEM_LISTO', 'ENTREGAR'
));

COMMIT;